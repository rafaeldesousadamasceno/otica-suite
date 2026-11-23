import { type ReactNode, useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { Button } from '@renderer/components/ui/Button'
import { NumeroInput } from '@renderer/components/ui/NumeroInput'
import { PercentualInput } from '@renderer/components/ui/PercentualInput'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { centavosParaTexto, textoParaCentavos } from '@renderer/lib/dinheiro'
import { enterAvancaCampo } from '@renderer/lib/enterAvancaCampo'
import { validarOuErro } from '@renderer/lib/validar'
import { toast } from '@renderer/state/toastStore'
import { formaPagamentoInputSchema } from '@shared/ipc'
import {
  INTERVALO_PADRAO_DIAS,
  MAX_PARCELAS_CLIENTE,
  ROTULO_COMPORTAMENTO,
  ROTULO_TIPO_FORMA,
  TIPOS_FORMA_PAGAMENTO,
  comportamentoDoTipo,
  type TipoAcrescimo,
  type TipoFormaPagamento
} from '@shared/vendaCalculo'
import type { FormaPagamento } from '@shared/types'

interface FormState {
  nome: string
  tipo: TipoFormaPagamento
  ordem: number | null
  ativo: boolean
  maxParcelas: number | null
  intervaloDias: number | null
  acrescimoTipo: TipoAcrescimo
  /** % em pontos-base. */
  acrescimoPercentualBp: number | null
  /** R$ em texto. */
  acrescimoValorTexto: string
}

const VAZIO: FormState = {
  nome: '',
  tipo: 'DINHEIRO',
  ordem: 0,
  ativo: true,
  maxParcelas: 12,
  intervaloDias: INTERVALO_PADRAO_DIAS,
  acrescimoTipo: 'PERCENTUAL',
  acrescimoPercentualBp: null,
  acrescimoValorTexto: ''
}

function paraForm(f: FormaPagamento): FormState {
  const tipoAcrescimo = f.acrescimoTipo ?? 'PERCENTUAL'
  return {
    nome: f.nome,
    tipo: f.tipo,
    ordem: f.ordem,
    ativo: f.ativo,
    maxParcelas: f.maxParcelas ?? 12,
    intervaloDias: f.intervaloDias,
    acrescimoTipo: tipoAcrescimo,
    acrescimoPercentualBp: f.acrescimoTipo === 'PERCENTUAL' ? f.acrescimoValor : null,
    acrescimoValorTexto: f.acrescimoTipo === 'VALOR' ? centavosParaTexto(f.acrescimoValor) : ''
  }
}

interface Props {
  open: boolean
  onClose: () => void
  forma?: FormaPagamento
}

/** Cadastro de forma de pagamento: o TIPO decide o que a venda faz (recebe na hora, gera recebivel da operadora ou parcelas). */
export function FormaPagamentoFormDialog({ open, onClose, forma }: Props): ReactNode {
  const queryClient = useQueryClient()
  const editando = Boolean(forma)
  const [form, setForm] = useState<FormState>(VAZIO)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(forma ? paraForm(forma) : VAZIO)
      setErro(null)
    }
  }, [open, forma])

  const set = <K extends keyof FormState>(chave: K, valor: FormState[K]): void => setForm((f) => ({ ...f, [chave]: valor }))
  const comportamento = comportamentoDoTipo(form.tipo)
  const parcelado = comportamento === 'PARCELADO_CLIENTE'

  const mutation = useMutation({
    mutationFn: async () => {
      const acrescimoValor =
        form.acrescimoTipo === 'PERCENTUAL' ? (form.acrescimoPercentualBp ?? 0) : textoParaCentavos(form.acrescimoValorTexto)
      const dados = validarOuErro(formaPagamentoInputSchema, {
        nome: form.nome,
        tipo: form.tipo,
        ordem: form.ordem ?? 0,
        maxParcelas: form.maxParcelas,
        intervaloDias: form.intervaloDias,
        acrescimoTipo: acrescimoValor > 0 ? form.acrescimoTipo : null,
        acrescimoValor
      })
      if (forma) {
        const salvo = await unwrap(window.api.formasPagamento.update({ id: forma.id, dados }))
        if (form.ativo !== forma.ativo) await unwrap(window.api.formasPagamento.setAtivo({ id: forma.id, ativo: form.ativo }))
        return salvo
      }
      const criado = await unwrap(window.api.formasPagamento.create(dados))
      if (!form.ativo) await unwrap(window.api.formasPagamento.setAtivo({ id: criado.id, ativo: false }))
      return criado
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['formasPagamento'] })
      toast.ok(editando ? 'Forma de pagamento atualizada.' : 'Forma de pagamento cadastrada.')
      onClose()
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  return (
    <Dialog open={open} onClose={onClose} title={editando ? 'Editar forma de pagamento' : 'Nova forma de pagamento'} className="max-w-xl">
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
          <Field label="Nome" required>
            <Input value={form.nome} onChange={(e) => set('nome', e.target.value)} autoFocus maxLength={60} />
          </Field>
          <Field label="Tipo" required>
            <Select value={form.tipo} onChange={(e) => set('tipo', e.target.value as TipoFormaPagamento)}>
              {TIPOS_FORMA_PAGAMENTO.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO_FORMA[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ordem de exibição" hint="Menor aparece primeiro na venda.">
            <NumeroInput value={form.ordem} casas={0} aria-label="Ordem de exibição" onChange={(v) => set('ordem', v)} />
          </Field>
        </div>

        <p className="rounded-md bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--ink-2)]">
          <b className="text-[var(--ink)]">{ROTULO_COMPORTAMENTO[comportamento]}.</b>{' '}
          {comportamento === 'IMEDIATO' && 'O valor entra como recebido na data da venda.'}
          {comportamento === 'OPERADORA' &&
            'A venda pede a bandeira e gera um único recebível da operadora, pelo valor líquido (já sem a taxa). Não gera parcelas para o cliente.'}
          {comportamento === 'PARCELADO_CLIENTE' && 'A venda gera parcelas do cliente em Contas a Receber, com o acréscimo abaixo.'}
        </p>

        {parcelado && (
          <div className="flex flex-col gap-3 rounded-md border border-[var(--rule)] p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Máximo de parcelas" required hint={`De 1 a ${MAX_PARCELAS_CLIENTE}.`}>
                <NumeroInput value={form.maxParcelas} casas={0} unidade="x" aria-label="Máximo de parcelas" onChange={(v) => set('maxParcelas', v)} />
              </Field>
              <Field label="Intervalo entre parcelas" hint="Cada parcela vence N dias depois da anterior (a primeira, N dias depois da venda).">
                <NumeroInput value={form.intervaloDias} casas={0} unidade="dias" aria-label="Intervalo entre parcelas" onChange={(v) => set('intervaloDias', v)} />
              </Field>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-[var(--ink-2)]">Acréscimo</span>
              <div className="flex items-center gap-2">
                <div className="inline-flex overflow-hidden rounded-md border border-[var(--rule-strong)]" role="group" aria-label="Tipo do acréscimo">
                  {(['PERCENTUAL', 'VALOR'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={form.acrescimoTipo === t}
                      onClick={() => set('acrescimoTipo', t)}
                      className={
                        form.acrescimoTipo === t
                          ? 'bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white'
                          : 'bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--ink-2)] hover:bg-[var(--surface-2)]'
                      }
                    >
                      {t === 'PERCENTUAL' ? '%' : 'R$'}
                    </button>
                  ))}
                </div>
                <div className="w-36">
                  {form.acrescimoTipo === 'PERCENTUAL' ? (
                    <PercentualInput value={form.acrescimoPercentualBp} aria-label="Acréscimo em porcentagem" placeholder="0" onChange={(v) => set('acrescimoPercentualBp', v)} />
                  ) : (
                    <Input
                      className="text-right font-mono-tab"
                      aria-label="Acréscimo em reais"
                      placeholder="0,00"
                      value={form.acrescimoValorTexto}
                      onChange={(e) => set('acrescimoValorTexto', e.target.value)}
                    />
                  )}
                </div>
              </div>
              <p className="text-xs text-[var(--ink-3)]">
                Aplicado UMA vez sobre o valor da linha de pagamento (nunca em cada parcela). Deixe vazio para não cobrar acréscimo.
              </p>
            </div>
          </div>
        )}

        <label className="flex items-start gap-2 text-sm text-[var(--ink-2)]">
          <input type="checkbox" className="mt-0.5" checked={form.ativo} onChange={(e) => set('ativo', e.target.checked)} />
          <span>
            <b className="text-[var(--ink)]">Ativa</b>
            <span className="block text-xs text-[var(--ink-3)]">Forma inativa não aparece nas vendas novas; as vendas antigas continuam mostrando o nome dela.</span>
          </span>
        </label>

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex justify-end gap-2 border-t border-[var(--rule)] pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {editando ? 'Salvar alterações' : 'Cadastrar forma'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
