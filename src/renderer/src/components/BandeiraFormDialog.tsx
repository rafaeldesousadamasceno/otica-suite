import { type ReactNode, useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { NumeroInput } from '@renderer/components/ui/NumeroInput'
import { PercentualInput } from '@renderer/components/ui/PercentualInput'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { enterAvancaCampo } from '@renderer/lib/enterAvancaCampo'
import { validarOuErro } from '@renderer/lib/validar'
import { toast } from '@renderer/state/toastStore'
import { bandeiraInputSchema } from '@shared/ipc'
import { MAX_PARCELAS_CARTAO } from '@shared/vendaCalculo'
import type { Bandeira } from '@shared/types'

interface LinhaFaixa {
  chave: string
  parcelas: number
  taxaBp: number | null
  prazoDias: number | null
  descontoClienteBp: number | null
}

interface FormState {
  nome: string
  adquirente: string
  aceitaDebito: boolean
  aceitaCredito: boolean
  debitoTaxaBp: number | null
  debitoPrazoDias: number | null
  faixas: LinhaFaixa[]
  ativo: boolean
}

const VAZIO: FormState = {
  nome: '',
  adquirente: '',
  aceitaDebito: true,
  aceitaCredito: true,
  debitoTaxaBp: null,
  debitoPrazoDias: 1,
  faixas: [],
  ativo: true
}

let contador = 0
const novaChave = (): string => `f${Date.now()}-${contador++}`

function paraForm(b: Bandeira): FormState {
  return {
    nome: b.nome,
    adquirente: b.adquirente ?? '',
    aceitaDebito: b.aceitaDebito,
    aceitaCredito: b.aceitaCredito,
    debitoTaxaBp: b.debitoTaxaBp,
    debitoPrazoDias: b.debitoPrazoDias,
    faixas: b.faixas.map((f) => ({ chave: novaChave(), parcelas: f.parcelas, taxaBp: f.taxaBp, prazoDias: f.prazoDias, descontoClienteBp: f.descontoClienteBp })),
    ativo: b.ativo
  }
}

interface Props {
  open: boolean
  onClose: () => void
  bandeira?: Bandeira
}

/** Cadastro de bandeira: taxa e prazo do debito, e a tabela de faixas do credito (de 1x ate Nx). */
export function BandeiraFormDialog({ open, onClose, bandeira }: Props): ReactNode {
  const queryClient = useQueryClient()
  const editando = Boolean(bandeira)
  const [form, setForm] = useState<FormState>(VAZIO)
  const [ateParcelas, setAteParcelas] = useState<number | null>(12)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(bandeira ? paraForm(bandeira) : VAZIO)
      setErro(null)
    }
  }, [open, bandeira])

  const set = <K extends keyof FormState>(chave: K, valor: FormState[K]): void => setForm((f) => ({ ...f, [chave]: valor }))

  function atualizarFaixa(chave: string, parte: Partial<LinhaFaixa>): void {
    setForm((f) => ({ ...f, faixas: f.faixas.map((l) => (l.chave === chave ? { ...l, ...parte } : l)) }))
  }

  function adicionarFaixa(): void {
    setForm((f) => {
      const proxima = f.faixas.reduce((m, l) => Math.max(m, l.parcelas), 0) + 1
      if (proxima > MAX_PARCELAS_CARTAO) return f
      return { ...f, faixas: [...f.faixas, { chave: novaChave(), parcelas: proxima, taxaBp: null, prazoDias: null, descontoClienteBp: 0 }] }
    })
  }

  /** Cria as linhas que faltam de 1x ate Nx (sem taxa: a pessoa preenche; nada vai sem taxa informada). */
  function criarAte(): void {
    const n = Math.min(Math.max(ateParcelas ?? 0, 1), MAX_PARCELAS_CARTAO)
    setForm((f) => {
      const jaTem = new Set(f.faixas.map((l) => l.parcelas))
      const novas: LinhaFaixa[] = []
      for (let p = 1; p <= n; p++) if (!jaTem.has(p)) novas.push({ chave: novaChave(), parcelas: p, taxaBp: null, prazoDias: null, descontoClienteBp: 0 })
      return { ...f, faixas: [...f.faixas, ...novas].sort((a, b) => a.parcelas - b.parcelas) }
    })
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (form.aceitaCredito) {
        const incompleta = form.faixas.find((l) => l.taxaBp === null || l.prazoDias === null)
        if (incompleta) throw new Error(`Preencha a taxa e o prazo da faixa de ${incompleta.parcelas}x.`)
      }
      const dados = validarOuErro(bandeiraInputSchema, {
        nome: form.nome,
        adquirente: form.adquirente,
        aceitaDebito: form.aceitaDebito,
        aceitaCredito: form.aceitaCredito,
        debitoTaxaBp: form.debitoTaxaBp,
        debitoPrazoDias: form.debitoPrazoDias,
        faixas: form.faixas.map((l) => ({ parcelas: l.parcelas, taxaBp: l.taxaBp ?? 0, prazoDias: l.prazoDias ?? 0, descontoClienteBp: l.descontoClienteBp ?? 0 }))
      })
      if (bandeira) {
        const salva = await unwrap(window.api.bandeiras.update({ id: bandeira.id, dados }))
        if (form.ativo !== bandeira.ativo) await unwrap(window.api.bandeiras.setAtivo({ id: bandeira.id, ativo: form.ativo }))
        return salva
      }
      const criada = await unwrap(window.api.bandeiras.create(dados))
      if (!form.ativo) await unwrap(window.api.bandeiras.setAtivo({ id: criada.id, ativo: false }))
      return criada
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bandeiras'] })
      toast.ok(editando ? 'Bandeira atualizada.' : 'Bandeira cadastrada.')
      onClose()
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  return (
    <Dialog open={open} onClose={onClose} title={editando ? 'Editar bandeira' : 'Nova bandeira'} className="max-w-3xl">
      <form
        onKeyDown={enterAvancaCampo}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
        noValidate
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Bandeira" required>
            <Input value={form.nome} onChange={(e) => set('nome', e.target.value)} autoFocus maxLength={60} placeholder="Visa, Mastercard, Elo…" />
          </Field>
          <Field label="Adquirente / maquininha" hint="Opcional: a taxa costuma mudar de uma maquininha para outra.">
            <Input value={form.adquirente} onChange={(e) => set('adquirente', e.target.value)} maxLength={60} placeholder="Stone, Cielo, Rede…" />
          </Field>
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
            <input type="checkbox" checked={form.aceitaDebito} onChange={(e) => set('aceitaDebito', e.target.checked)} />
            <b className="text-[var(--ink)]">Aceita débito</b>
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
            <input type="checkbox" checked={form.aceitaCredito} onChange={(e) => set('aceitaCredito', e.target.checked)} />
            <b className="text-[var(--ink)]">Aceita crédito</b>
          </label>
        </div>

        {form.aceitaDebito && (
          <div className="rounded-md border border-[var(--rule)] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">Débito</p>
            <div className="grid max-w-md grid-cols-2 gap-3">
              <Field label="Taxa da operadora" required>
                <PercentualInput value={form.debitoTaxaBp} aria-label="Taxa do débito" placeholder="0" onChange={(v) => set('debitoTaxaBp', v)} />
              </Field>
              <Field label="Prazo de recebimento" required>
                <NumeroInput value={form.debitoPrazoDias} casas={0} unidade="dias" aria-label="Prazo de recebimento do débito" onChange={(v) => set('debitoPrazoDias', v)} />
              </Field>
            </div>
          </div>
        )}

        {form.aceitaCredito && (
          <div className="flex flex-col gap-2 rounded-md border border-[var(--rule)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">Crédito: faixas de parcelas</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--ink-3)]">Criar de 1x até</span>
                <div className="w-20">
                  <NumeroInput value={ateParcelas} casas={0} unidade="x" aria-label="Criar faixas até quantas parcelas" onChange={setAteParcelas} />
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={criarAte}>
                  Criar faixas
                </Button>
              </div>
            </div>

            {form.faixas.length > 0 && (
              <div className="overflow-hidden rounded-md border border-[var(--rule)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-xs text-[var(--ink-3)]">
                      <th className="w-20 px-2 py-1.5">Parcelas</th>
                      <th className="px-2 py-1.5">Taxa da operadora</th>
                      <th className="px-2 py-1.5">Prazo de recebimento</th>
                      <th className="px-2 py-1.5" title="Desconto comercial dado ao cliente nesta quantidade de parcelas. 0 = sem efeito.">
                        Desconto ao cliente
                      </th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.faixas.map((l) => (
                      <tr key={l.chave} className="border-b border-[var(--rule)] last:border-0">
                        <td className="px-2 py-1.5">
                          <NumeroInput value={l.parcelas} casas={0} unidade="x" aria-label="Parcelas da faixa" onChange={(v) => atualizarFaixa(l.chave, { parcelas: v ?? l.parcelas })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <PercentualInput value={l.taxaBp} aria-label={`Taxa de ${l.parcelas}x`} placeholder="0" onChange={(v) => atualizarFaixa(l.chave, { taxaBp: v })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <NumeroInput value={l.prazoDias} casas={0} unidade="dias" aria-label={`Prazo de ${l.parcelas}x`} onChange={(v) => atualizarFaixa(l.chave, { prazoDias: v })} />
                        </td>
                        <td className="px-2 py-1.5">
                          <PercentualInput value={l.descontoClienteBp} aria-label={`Desconto ao cliente em ${l.parcelas}x`} placeholder="0" onChange={(v) => atualizarFaixa(l.chave, { descontoClienteBp: v ?? 0 })} />
                        </td>
                        <td className="px-1 py-1">
                          <button
                            type="button"
                            title="Remover faixa"
                            aria-label={`Remover faixa de ${l.parcelas}x`}
                            onClick={() => setForm((f) => ({ ...f, faixas: f.faixas.filter((x) => x.chave !== l.chave) }))}
                            className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--danger-wash)] hover:text-[var(--danger)]"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between">
              <Button type="button" variant="ghost" size="sm" onClick={adicionarFaixa}>
                <Plus className="size-3.5" /> Adicionar faixa
              </Button>
              <p className="text-xs text-[var(--ink-3)]">O desconto ao cliente é opcional: com 0% ele não muda nada na venda.</p>
            </div>
          </div>
        )}

        <label className="flex items-start gap-2 text-sm text-[var(--ink-2)]">
          <input type="checkbox" className="mt-0.5" checked={form.ativo} onChange={(e) => set('ativo', e.target.checked)} />
          <span>
            <b className="text-[var(--ink)]">Ativa</b>
            <span className="block text-xs text-[var(--ink-3)]">
              Bandeira inativa não aparece nas vendas novas. Mudar a taxa vale só para as vendas novas: as vendas antigas guardam a taxa que usaram.
            </span>
          </span>
        </label>

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex justify-end gap-2 border-t border-[var(--rule)] pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {editando ? 'Salvar alterações' : 'Cadastrar bandeira'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
