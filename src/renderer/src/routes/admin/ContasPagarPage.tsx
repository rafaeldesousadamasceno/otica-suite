import { type ReactNode, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, CircleDollarSign, Plus, Repeat, Settings2, Trash2 } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { Badge } from '@renderer/components/ui/Badge'
import { Button } from '@renderer/components/ui/Button'
import { EscolhaDialog } from '@renderer/components/ui/EscolhaDialog'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { useConfirm } from '@renderer/lib/confirmar'
import { useDebouncedValue } from '@renderer/lib/useDebouncedValue'
import { centavosParaBRL } from '@renderer/lib/dinheiro'
import { toast } from '@renderer/state/toastStore'
import { PagarContaDialog } from '@renderer/components/PagarContaDialog'
import { ContaPagarFormDialog } from '@renderer/components/ContaPagarFormDialog'
import { ContaRecorrenteDialog, RecorrenciasDialog } from '@renderer/components/RecorrenciasDialog'
import { EditarContaRecorrenteDialog, EncerrarRecorrenciaDialog, ReajustarRecorrenciaDialog } from '@renderer/components/RecorrenciaAcoesDialogs'
import { competenciaParaTexto } from '@shared/recorrencia'
import type { ContaPagar, Recorrencia, SituacaoContaPagar } from '@shared/types'

function formatarDataBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

const TOM_SITUACAO: Record<SituacaoContaPagar, 'ok' | 'warn' | 'danger'> = {
  PAGA: 'ok',
  ABERTA: 'warn',
  CANCELADA: 'danger'
}

function mensagem(err: unknown): string {
  return err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.'
}

export function ContasPagarPage(): ReactNode {
  const queryClient = useQueryClient()
  const confirmar = useConfirm()
  // O painel abre esta tela ja filtrada (?vencidas=1).
  const [params] = useSearchParams()
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState<'' | SituacaoContaPagar>('')
  const [apenasVencidas, setApenasVencidas] = useState(params.get('vencidas') === '1')
  // Os 12 meses materializados a frente ficam escondidos: por padrao a lista vai ate o mes seguinte.
  const [incluirFuturas, setIncluirFuturas] = useState(false)
  const [novaOpen, setNovaOpen] = useState(false)
  const [contaParaPagar, setContaParaPagar] = useState<ContaPagar | null>(null)
  const [contaDetalhe, setContaDetalhe] = useState<ContaPagar | null>(null)
  const [contaEditando, setContaEditando] = useState<ContaPagar | null>(null)
  const [recorrenciasOpen, setRecorrenciasOpen] = useState(false)
  const [reajustando, setReajustando] = useState<{ recorrencia: Recorrencia; competencia?: string } | null>(null)
  const [encerrando, setEncerrando] = useState<Recorrencia | null>(null)
  const [contaExcluindo, setContaExcluindo] = useState<ContaPagar | null>(null)
  const [motivo, setMotivo] = useState('')
  const buscaDebounced = useDebouncedValue(busca)

  const contas = useQuery({
    queryKey: ['contasPagar', { busca: buscaDebounced, situacao, apenasVencidas, incluirFuturas }],
    queryFn: () => unwrap(window.api.contasPagar.list({ busca: buscaDebounced, situacao, apenasVencidas, incluirFuturas }))
  })

  const excluir = useMutation({
    mutationFn: (entrada: { id: number; escopo?: 'SOMENTE_ESTA' | 'ESTA_E_PROXIMAS'; motivo?: string }) => unwrap(window.api.contasPagar.excluir(entrada)),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['contasPagar'] })
      toast.ok(r.afetadas > 1 ? `${r.afetadas} contas excluídas.` : 'Conta excluída.')
    },
    // Conta paga: o servidor recusa e explica (estornar o pagamento antes).
    onError: (err) => toast.error(mensagem(err))
  })

  /** RG-01: avulsa pede confirmacao; a de recorrencia abre a escolha entre "somente esta" e "esta e as proximas". */
  async function pedirExcluir(c: ContaPagar): Promise<void> {
    if (c.situacao === 'PAGA' || c.valorPagoCentavos > 0) {
      toast.error('Esta conta já foi paga e não pode ser excluída. Estorne o pagamento antes de excluí-la.')
      return
    }
    if (c.recorrente) {
      setMotivo('')
      setContaExcluindo(c)
      return
    }
    const ok = await confirmar({
      variante: 'excluir',
      entidade: 'conta a pagar',
      item: `${c.descricao} — ${centavosParaBRL(c.valorCentavos)}, vence em ${formatarDataBr(c.vencimento)}`
    })
    if (ok) excluir.mutate({ id: c.id })
  }

  function aoEscolherExclusao(chave: string | null): void {
    const conta = contaExcluindo
    setContaExcluindo(null)
    if (!conta || chave === null) return
    excluir.mutate({ id: conta.id, escopo: chave as 'SOMENTE_ESTA' | 'ESTA_E_PROXIMAS', motivo: motivo.trim() || undefined })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[var(--ink)]">Contas a Pagar</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setRecorrenciasOpen(true)}>
            <Repeat className="size-4" /> Despesas recorrentes
          </Button>
          <Button onClick={() => setNovaOpen(true)}>
            <Plus className="size-4" /> Nova conta
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-3)]" />
          <Input className="pl-9" placeholder="Descrição ou fornecedor…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select className="w-40" value={situacao} onChange={(e) => setSituacao(e.target.value as '' | SituacaoContaPagar)}>
          <option value="">Todas as situações</option>
          <option value="ABERTA">Em aberto</option>
          <option value="PAGA">Pagas</option>
          <option value="CANCELADA">Canceladas</option>
        </Select>
        <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
          <input type="checkbox" checked={apenasVencidas} onChange={(e) => setApenasVencidas(e.target.checked)} />
          Só vencidas
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]" title="As despesas recorrentes ficam lançadas 12 meses à frente; por padrão a lista mostra até o mês seguinte.">
          <input type="checkbox" checked={incluirFuturas} onChange={(e) => setIncluirFuturas(e.target.checked)} />
          Mostrar contas futuras
        </label>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                <th className="px-4 py-2.5">Descrição</th>
                <th className="px-4 py-2.5">Categoria</th>
                <th className="px-4 py-2.5">Vencimento</th>
                <th className="px-4 py-2.5 text-right">Valor</th>
                <th className="px-4 py-2.5">Situação</th>
                <th className="w-28"></th>
              </tr>
            </thead>
            <tbody>
              {contas.data?.map((c) => (
                <tr key={c.id} className={`border-b border-[var(--rule)] last:border-0 ${c.vencida ? 'bg-[var(--danger-wash)]' : ''}`}>
                  <td className="px-4 py-2.5 text-[var(--ink)]">
                    {c.descricao}
                    {c.recorrente && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 align-middle text-xs text-[var(--ink-2)]" title="Despesa recorrente">
                        <Repeat className="size-3" /> {c.competencia ? competenciaParaTexto(c.competencia) : 'recorrente'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--ink-2)]">{c.categoria ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono-tab text-[var(--ink-2)]">{formatarDataBr(c.vencimento)}</td>
                  <td className="px-4 py-2.5 text-right font-mono-tab font-medium text-[var(--ink)]">
                    {centavosParaBRL(c.valorCentavos - c.valorPagoCentavos)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <Badge tone={TOM_SITUACAO[c.situacao]}>{c.situacao}</Badge>
                      {c.vencida && <Badge tone="danger">Vencida</Badge>}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <div className="flex justify-end gap-0.5">
                      {c.recorrente && (
                        <button
                          type="button"
                          title="Recorrência: editar, reajustar valor ou encerrar"
                          onClick={() => setContaDetalhe(c)}
                          className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                        >
                          <Settings2 className="size-4" />
                        </button>
                      )}
                      {c.situacao === 'ABERTA' && (
                        <button
                          type="button"
                          title="Pagar"
                          onClick={() => setContaParaPagar(c)}
                          className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--ok-wash)] hover:text-[var(--ok)]"
                        >
                          <CircleDollarSign className="size-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        title={c.situacao === 'PAGA' ? 'Conta paga: estorne o pagamento antes de excluir' : 'Excluir'}
                        onClick={() => void pedirExcluir(c)}
                        className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--danger-wash)] hover:text-[var(--danger)]"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {contas.data?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[var(--ink-3)]">
                    Nenhuma conta a pagar encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ContaPagarFormDialog open={novaOpen} onClose={() => setNovaOpen(false)} />
      <PagarContaDialog conta={contaParaPagar} onClose={() => setContaParaPagar(null)} />

      <ContaRecorrenteDialog
        conta={contaDetalhe}
        onClose={() => setContaDetalhe(null)}
        onEditar={(c) => {
          setContaDetalhe(null)
          setContaEditando(c)
        }}
        onReajustar={(r, competencia) => {
          setContaDetalhe(null)
          setReajustando({ recorrencia: r, competencia: competencia ?? undefined })
        }}
        onEncerrar={(r) => {
          setContaDetalhe(null)
          setEncerrando(r)
        }}
      />
      <EditarContaRecorrenteDialog conta={contaEditando} onClose={() => setContaEditando(null)} />
      {/* A lista de recorrencias some enquanto uma acao dela esta aberta (so uma janela por vez, Esc fecha uma so). */}
      <RecorrenciasDialog
        open={recorrenciasOpen && !reajustando && !encerrando}
        onClose={() => setRecorrenciasOpen(false)}
        onReajustar={(r) => setReajustando({ recorrencia: r })}
        onEncerrar={(r) => setEncerrando(r)}
      />
      <ReajustarRecorrenciaDialog recorrencia={reajustando?.recorrencia ?? null} competenciaInicial={reajustando?.competencia} onClose={() => setReajustando(null)} />
      <EncerrarRecorrenciaDialog recorrencia={encerrando} onClose={() => setEncerrando(null)} />

      <EscolhaDialog
        aberto={contaExcluindo !== null}
        titulo="Excluir conta recorrente?"
        mensagens={
          contaExcluindo
            ? [
                `${contaExcluindo.descricao}${contaExcluindo.competencia ? ` — ${competenciaParaTexto(contaExcluindo.competencia)}` : ''} — ${centavosParaBRL(contaExcluindo.valorCentavos)}`,
                '"Somente esta" tira só esta conta; o sistema não a lança de novo. "Esta e as próximas" também tira as contas em aberto seguintes e encerra a recorrência. Contas já pagas não mudam.'
              ]
            : []
        }
        aviso="Esta ação não pode ser desfeita."
        opcoes={[
          { chave: 'SOMENTE_ESTA', rotulo: 'Excluir somente esta', destrutiva: true },
          { chave: 'ESTA_E_PROXIMAS', rotulo: 'Excluir esta e as próximas (encerra a recorrência)', destrutiva: true }
        ]}
        onEscolher={aoEscolherExclusao}
      >
        <Input placeholder="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} aria-label="Motivo da exclusão (opcional)" />
      </EscolhaDialog>
    </div>
  )
}
