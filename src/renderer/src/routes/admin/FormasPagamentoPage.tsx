import { type ReactNode, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Banknote, Power, Trash2 } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { Badge } from '@renderer/components/ui/Badge'
import { FormaPagamentoFormDialog } from '@renderer/components/FormaPagamentoFormDialog'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { useConfirm } from '@renderer/lib/confirmar'
import { useDebouncedValue } from '@renderer/lib/useDebouncedValue'
import { centavosParaBRL } from '@renderer/lib/dinheiro'
import { toast } from '@renderer/state/toastStore'
import { formatarBp } from '@shared/dinheiro'
import { ROTULO_COMPORTAMENTO, ROTULO_TIPO_FORMA } from '@shared/vendaCalculo'
import type { FormaPagamento } from '@shared/types'

const mensagem = (err: unknown): string => (err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')

/** O que a forma faz de diferente (so as parceladas pelo cliente tem regra): "até 12x, a cada 30 dias, acréscimo de 5%". */
function regras(f: FormaPagamento): string {
  if (f.comportamento !== 'PARCELADO_CLIENTE') return '—'
  const partes = [`até ${f.maxParcelas ?? '?'}x`, `a cada ${f.intervaloDias} dias`]
  if (f.acrescimoTipo === 'PERCENTUAL' && f.acrescimoValor > 0) partes.push(`acréscimo de ${formatarBp(f.acrescimoValor)}`)
  else if (f.acrescimoTipo === 'VALOR' && f.acrescimoValor > 0) partes.push(`acréscimo de ${centavosParaBRL(f.acrescimoValor)}`)
  else partes.push('sem acréscimo')
  return partes.join(', ')
}

/** Cadastro de formas de pagamento (Administrador). A venda oferece as ativas; as que ja tem venda so podem ser inativadas. */
export function FormasPagamentoPage(): ReactNode {
  const confirmar = useConfirm()
  const queryClient = useQueryClient()
  const [busca, setBusca] = useState('')
  const [mostrarInativas, setMostrarInativas] = useState(true)
  const [novaOpen, setNovaOpen] = useState(false)
  const [editando, setEditando] = useState<FormaPagamento | null>(null)
  const buscaDebounced = useDebouncedValue(busca)

  const formas = useQuery({
    queryKey: ['formasPagamento', { busca: buscaDebounced, apenasAtivos: !mostrarInativas, tela: true }],
    queryFn: () => unwrap(window.api.formasPagamento.list({ busca: buscaDebounced, apenasAtivos: !mostrarInativas }))
  })

  const atualizar = (): void => {
    queryClient.invalidateQueries({ queryKey: ['formasPagamento'] })
  }

  const setAtivo = useMutation({
    mutationFn: (p: { id: number; ativo: boolean }) => unwrap(window.api.formasPagamento.setAtivo(p)),
    onSuccess: (_, p) => {
      atualizar()
      toast.ok(p.ativo ? 'Forma de pagamento reativada.' : 'Forma de pagamento inativada.')
    },
    onError: (err) => toast.error(mensagem(err))
  })

  const excluir = useMutation({
    mutationFn: (id: number) => unwrap(window.api.formasPagamento.excluir({ id })),
    onSuccess: () => {
      atualizar()
      toast.ok('Forma de pagamento excluída.')
    },
    // Com venda vinculada o servidor recusa e explica (e sugere Inativar).
    onError: (err) => toast.error(mensagem(err))
  })

  async function pedirInativar(f: FormaPagamento): Promise<void> {
    if (f.ativo) {
      const ok = await confirmar({
        titulo: 'Inativar forma de pagamento?',
        mensagem: `${f.nome} deixa de aparecer nas vendas novas. As vendas que já usaram continuam mostrando o nome dela, e você pode reativar depois.`,
        rotuloConfirmar: 'Inativar'
      })
      if (!ok) return
    }
    setAtivo.mutate({ id: f.id, ativo: !f.ativo })
  }

  async function pedirExcluir(f: FormaPagamento): Promise<void> {
    const ok = await confirmar({
      variante: 'excluir',
      entidade: 'forma de pagamento',
      item: f.nome,
      detalhe: f.vendasVinculadas > 0 ? `Foi usada em ${f.vendasVinculadas} pagamento(s) de venda: nesse caso o sistema não exclui e sugere inativar.` : undefined
    })
    if (ok) excluir.mutate(f.id)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[var(--ink)]">Formas de Pagamento</h1>
        <Button onClick={() => setNovaOpen(true)}>
          <Banknote className="size-4" /> Nova forma
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-3)]" />
          <Input className="pl-9" placeholder="Nome da forma…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
          <input type="checkbox" checked={mostrarInativas} onChange={(e) => setMostrarInativas(e.target.checked)} /> Mostrar inativas
        </label>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                <th className="px-4 py-2.5">Forma</th>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5">O que a venda faz</th>
                <th className="px-4 py-2.5">Regras</th>
                <th className="px-4 py-2.5 text-center">Ordem</th>
                <th className="px-4 py-2.5 text-center">Vendas</th>
                <th className="px-4 py-2.5">Situação</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {formas.data?.map((f) => (
                <tr key={f.id} onClick={() => setEditando(f)} className="cursor-pointer border-b border-[var(--rule)] last:border-0 hover:bg-[var(--surface-2)]">
                  <td className={f.ativo ? 'px-4 py-2.5 font-medium text-[var(--ink)]' : 'px-4 py-2.5 font-medium text-[var(--ink-3)]'}>{f.nome}</td>
                  <td className="px-4 py-2.5 text-[var(--ink-2)]">{ROTULO_TIPO_FORMA[f.tipo]}</td>
                  <td className="px-4 py-2.5 text-[var(--ink-2)]">{ROTULO_COMPORTAMENTO[f.comportamento]}</td>
                  <td className="px-4 py-2.5 text-[var(--ink-2)]">{regras(f)}</td>
                  <td className="px-4 py-2.5 text-center font-mono-tab text-[var(--ink-3)]">{f.ordem}</td>
                  <td className="px-4 py-2.5 text-center font-mono-tab text-[var(--ink-3)]">{f.vendasVinculadas}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={f.ativo ? 'ok' : 'neutral'}>{f.ativo ? 'Ativa' : 'Inativa'}</Badge>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        title={f.ativo ? 'Inativar' : 'Reativar'}
                        aria-label={`${f.ativo ? 'Inativar' : 'Reativar'} ${f.nome}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          void pedirInativar(f)
                        }}
                        className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                      >
                        <Power className="size-4" />
                      </button>
                      <button
                        type="button"
                        title="Excluir"
                        aria-label={`Excluir ${f.nome}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          void pedirExcluir(f)
                        }}
                        className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--danger-wash)] hover:text-[var(--danger)]"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {formas.data?.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[var(--ink-3)]">
                    Nenhuma forma de pagamento encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <FormaPagamentoFormDialog open={novaOpen} onClose={() => setNovaOpen(false)} />
      <FormaPagamentoFormDialog open={editando !== null} onClose={() => setEditando(null)} forma={editando ?? undefined} />
    </div>
  )
}
