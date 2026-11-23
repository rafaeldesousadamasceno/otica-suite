import { type ReactNode, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, CircleDollarSign, Printer, Trash2 } from 'lucide-react'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Badge } from '@renderer/components/ui/Badge'
import { Button } from '@renderer/components/ui/Button'
import { AuthorizeAdminDialog } from '@renderer/components/AuthorizeAdminDialog'
import { BaixaParcelaDialog } from '@renderer/components/BaixaParcelaDialog'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { useGerarPdf } from '@renderer/lib/useGerarPdf'
import { centavosParaBRL } from '@renderer/lib/dinheiro'
import { useExcluirVenda } from '@renderer/lib/useExcluirVenda'
import { useAuthStore } from '@renderer/state/authStore'
import { formatarBp } from '@shared/dinheiro'
import { descreverAcrescimo } from '@shared/vendaCalculo'
import { toast } from '@renderer/state/toastStore'
import type { CredencialAdminInput } from '@shared/ipc'
import type { ContaReceber, SituacaoComissao, SituacaoContaReceber, VendaPagamentoDetalhe } from '@shared/types'

function formatarDataBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

const TOM_SITUACAO_CONTA: Record<SituacaoContaReceber, 'ok' | 'warn' | 'danger'> = {
  PAGA: 'ok',
  ABERTA: 'warn',
  CANCELADA: 'danger'
}

const ROTULO_COMISSAO: Record<SituacaoComissao, string> = {
  PROVISIONADA: 'Provisionada',
  LIBERADA: 'Liberada',
  CANCELADA: 'Cancelada'
}

interface Props {
  vendaId: number | null
  onClose: () => void
}

/** Texto do pagamento COMO FOI GRAVADO na venda: forma, bandeira e parcelas (o que o cadastro diz hoje nao importa). */
function textoPagamento(p: VendaPagamentoDetalhe): string {
  return `${p.formaPagamento}${p.bandeiraNome ? ` ${p.bandeiraNome}` : ''}${p.parcelas > 1 ? ` em ${p.parcelas}x` : ''}`
}

export function VendaDetailDialog({ vendaId, onClose }: Props): ReactNode {
  const queryClient = useQueryClient()
  const ehAdmin = useAuthStore((s) => s.sessao?.usuario.perfil === 'admin')
  const { pedirExclusao, dialogos: dialogosExclusao } = useExcluirVenda({ aoExcluir: onClose })
  const [cancelando, setCancelando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [motivoAutorizacao, setMotivoAutorizacao] = useState<string | null>(null)
  const [erroAutorizacao, setErroAutorizacao] = useState<string | null>(null)
  const [parcelaParaBaixa, setParcelaParaBaixa] = useState<ContaReceber | null>(null)

  const venda = useQuery({
    queryKey: ['venda', vendaId],
    queryFn: () => unwrap(window.api.vendas.get({ id: vendaId! })),
    enabled: vendaId !== null
  })

  useEffect(() => {
    setCancelando(false)
    setErro(null)
    setMotivoAutorizacao(null)
    setErroAutorizacao(null)
  }, [vendaId])

  const cancelar = useMutation({
    mutationFn: (credencial: CredencialAdminInput | null) =>
      unwrap(window.api.vendas.cancelar({ id: vendaId!, autorizacaoAdmin: credencial })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venda', vendaId] })
      queryClient.invalidateQueries({ queryKey: ['vendas'] })
      queryClient.invalidateQueries({ queryKey: ['contasReceber'] })
      queryClient.invalidateQueries({ queryKey: ['produtos'] })
      toast.ok('Venda cancelada.')
      setCancelando(false)
    },
    onError: (err) => {
      const mensagem = err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.'
      if (err instanceof ApiCallError && err.code === 'AUTORIZACAO_ADMIN_NECESSARIA') {
        setMotivoAutorizacao(mensagem)
        return
      }
      if (motivoAutorizacao !== null) {
        setErroAutorizacao(mensagem)
        return
      }
      setErro(mensagem)
    }
  })

  const imprimirComprovante = useGerarPdf(() => window.api.relatorios.comprovanteVenda({ id: vendaId! }))

  const imprimirCarne = useGerarPdf(() => window.api.relatorios.carneParcelas({ id: vendaId! }))

  if (vendaId === null || !venda.data) return null
  const v = venda.data

  return (
    <Dialog open onClose={onClose} title={`Venda ${v.numero}`} className="max-w-xl">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--ink)]">{v.clienteNome}</p>
            <p className="text-xs text-[var(--ink-3)]">
              {formatarDataBr(v.data)} · vendedor(a) {v.vendedorNome}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={v.situacao === 'CANCELADA' ? 'danger' : 'ok'}>{v.situacao}</Badge>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={imprimirComprovante.isPending} onClick={() => imprimirComprovante.mutate()}>
            <Printer className="size-4" /> Comprovante
          </Button>
          {v.parcelas.length > 0 && (
            <Button variant="secondary" loading={imprimirCarne.isPending} onClick={() => imprimirCarne.mutate()}>
              <Printer className="size-4" /> Carnê de parcelas
            </Button>
          )}
        </div>

        {v.autorizadoPorNome && (
          <p className="rounded-md bg-[var(--warn-wash)] px-3 py-2 text-xs text-[var(--warn)]">
            Ação autorizada por {v.autorizadoPorNome}.
          </p>
        )}

        <div className="overflow-hidden rounded-md border border-[var(--rule)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-xs text-[var(--ink-3)]">
                <th className="px-2 py-1.5 text-left">Item</th>
                <th className="px-2 py-1.5">Qtd</th>
                <th className="px-2 py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {v.itens.map((it) => (
                <tr key={it.id} className="border-b border-[var(--rule)] last:border-0">
                  <td className="px-2 py-1.5 text-[var(--ink)]">{it.descricao}</td>
                  <td className="px-2 py-1.5 text-center font-mono-tab text-[var(--ink-2)]">{it.quantidade}</td>
                  <td className="px-2 py-1.5 text-right font-mono-tab text-[var(--ink)]">
                    {centavosParaBRL(it.totalCentavos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-[var(--ink-3)]">Subtotal</p>
            <p className="font-mono-tab text-[var(--ink)]">{centavosParaBRL(v.subtotalCentavos)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--ink-3)]">
              Desconto{v.descontoAdicionalTipo === 'PERCENTUAL' && v.descontoAdicionalValor > 0 ? ` (adicional de ${formatarBp(v.descontoAdicionalValor)})` : ''}
            </p>
            <p className="font-mono-tab text-[var(--ink)]">{centavosParaBRL(v.descontoCentavos)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--ink-3)]">Total</p>
            <p className="font-mono-tab text-base font-semibold text-[var(--accent)]">
              {centavosParaBRL(v.totalCentavos)}
            </p>
          </div>
          {(v.acrescimoCentavos > 0 || v.descontoClienteCentavos > 0) && (
            <>
              {v.acrescimoCentavos > 0 && (
                <div>
                  <p className="text-xs text-[var(--ink-3)]">Acréscimo do parcelamento</p>
                  <p className="font-mono-tab text-[var(--ink)]">+ {centavosParaBRL(v.acrescimoCentavos)}</p>
                </div>
              )}
              {v.descontoClienteCentavos > 0 && (
                <div>
                  <p className="text-xs text-[var(--ink-3)]">Desconto do cartão</p>
                  <p className="font-mono-tab text-[var(--ink)]">− {centavosParaBRL(v.descontoClienteCentavos)}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-[var(--ink-3)]">O cliente paga</p>
                <p className="font-mono-tab text-base font-semibold text-[var(--accent)]">{centavosParaBRL(v.totalClienteCentavos)}</p>
              </div>
            </>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">Pagamento</p>
          <div className="flex flex-col gap-1">
            {v.pagamentos.map((p) => (
              <div key={p.id} className="flex flex-col text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--ink-2)]">{textoPagamento(p)}</span>
                  <span className="font-mono-tab text-[var(--ink)]">{centavosParaBRL(p.valorCentavos)}</span>
                </div>
                {p.acrescimoCentavos > 0 && (
                  <span className="text-xs text-[var(--ink-3)]">
                    {descreverAcrescimo(p)}: parcelas somam {centavosParaBRL(p.valorCentavos + p.acrescimoCentavos)}
                  </span>
                )}
                {/* Taxa e liquido sao custo da loja: so o Administrador ve. */}
                {ehAdmin && p.comportamento === 'OPERADORA' && p.taxaBp !== null && (
                  <span className="text-xs text-[var(--ink-3)]">
                    Taxa {formatarBp(p.taxaBp)} · bruto {centavosParaBRL(p.brutoCentavos ?? p.valorCentavos)} · líquido {centavosParaBRL(p.liquidoCentavos ?? 0)}
                    {p.dataPrevista ? ` · previsto para ${formatarDataBr(p.dataPrevista)}` : ''}
                    {p.descontoClienteCentavos > 0 ? ` · desconto ao cliente ${centavosParaBRL(p.descontoClienteCentavos)}` : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {v.parcelas.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
              Contas a receber
            </p>
            <div className="overflow-hidden rounded-md border border-[var(--rule)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-xs text-[var(--ink-3)]">
                    <th className="px-2 py-1.5 text-left">Parcela</th>
                    <th className="px-2 py-1.5">Vencimento</th>
                    <th className="px-2 py-1.5 text-right">Valor</th>
                    <th className="px-2 py-1.5">Situação</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {v.parcelas.map((p) => (
                    <tr key={p.id} className="border-b border-[var(--rule)] last:border-0">
                      <td className="px-2 py-1.5 text-[var(--ink)]">
                        {p.parcela}/{p.totalParcelas}
                      </td>
                      <td className="px-2 py-1.5 text-center font-mono-tab text-[var(--ink-2)]">
                        {formatarDataBr(p.vencimento)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono-tab text-[var(--ink)]">
                        {centavosParaBRL(p.valorCentavos)}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <Badge tone={TOM_SITUACAO_CONTA[p.situacao]}>{p.situacao}</Badge>
                      </td>
                      <td className="px-1 py-1 text-right">
                        {p.situacao === 'ABERTA' && (
                          <button
                            type="button"
                            title="Dar baixa"
                            onClick={() => setParcelaParaBaixa(p)}
                            className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--ok-wash)] hover:text-[var(--ok)]"
                          >
                            <CircleDollarSign className="size-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {v.recebiveisOperadora.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">Recebível da operadora</p>
            <div className="flex flex-col gap-1.5">
              {v.recebiveisOperadora.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-[var(--rule)] px-3 py-2 text-sm">
                  <span className="text-[var(--ink-2)]">
                    {r.bandeiraNome} em {r.operadoraParcelas}x · previsto para {formatarDataBr(r.vencimento)}
                    <span className="block text-xs text-[var(--ink-3)]">Não é dívida do cliente: é o que a maquininha ainda vai depositar.</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono-tab text-[var(--ink)]">{centavosParaBRL(r.valorCentavos)}</span>
                    <Badge tone={TOM_SITUACAO_CONTA[r.situacao]}>{r.situacao}</Badge>
                    {ehAdmin && r.situacao === 'ABERTA' && (
                      <button
                        type="button"
                        title="Dar baixa (depósito recebido)"
                        onClick={() => setParcelaParaBaixa(r)}
                        className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--ok-wash)] hover:text-[var(--ok)]"
                      >
                        <CircleDollarSign className="size-4" />
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {v.comissao && (
          <p className="text-sm text-[var(--ink-2)]">
            Comissão: <span className="font-mono-tab text-[var(--ink)]">{centavosParaBRL(v.comissao.valorCentavos)}</span>{' '}
            <Badge tone={v.comissao.situacao === 'CANCELADA' ? 'danger' : v.comissao.situacao === 'LIBERADA' ? 'ok' : 'warn'}>
              {ROTULO_COMISSAO[v.comissao.situacao]}
            </Badge>
          </p>
        )}

        {v.situacao === 'CONCLUIDA' && (
          <div className="border-t border-[var(--rule)] pt-4">
            {!cancelando ? (
              <Button variant="danger" onClick={() => setCancelando(true)}>
                <Ban className="size-4" /> Cancelar venda
              </Button>
            ) : (
              <div className="flex flex-col gap-2 rounded-md border border-[var(--danger)]/30 bg-[var(--danger-wash)] p-3">
                <p className="text-sm text-[var(--ink)]">
                  Cancelar estorna o estoque, o financeiro e a comissão desta venda. Esta ação não pode ser desfeita.
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setCancelando(false)}>
                    Voltar
                  </Button>
                  <Button variant="danger" loading={cancelar.isPending} onClick={() => cancelar.mutate(null)}>
                    Confirmar cancelamento
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {ehAdmin && (
          <div className="flex items-center justify-between gap-3 border-t border-[var(--rule)] pt-4">
            <p className="text-xs text-[var(--ink-3)]">Excluir tira a venda de todas as listas e relatórios (o número não é reaproveitado).</p>
            <Button variant="danger" onClick={() => void pedirExclusao(v)}>
              <Trash2 className="size-4" /> Excluir venda
            </Button>
          </div>
        )}

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}
      </div>

      {dialogosExclusao}

      <AuthorizeAdminDialog
        open={motivoAutorizacao !== null}
        motivo={motivoAutorizacao ?? ''}
        erro={erroAutorizacao}
        loading={cancelar.isPending}
        onClose={() => {
          setMotivoAutorizacao(null)
          setErroAutorizacao(null)
        }}
        onConfirm={(credencial) => {
          setErroAutorizacao(null)
          cancelar.mutate(credencial)
        }}
      />

      <BaixaParcelaDialog conta={parcelaParaBaixa} onClose={() => setParcelaParaBaixa(null)} />
    </Dialog>
  )
}
