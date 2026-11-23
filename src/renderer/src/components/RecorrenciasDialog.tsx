import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pencil, Repeat, TrendingUp, CalendarX } from 'lucide-react'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Badge } from '@renderer/components/ui/Badge'
import { Button } from '@renderer/components/ui/Button'
import { unwrap } from '@renderer/lib/ipc'
import { centavosParaBRL } from '@renderer/lib/dinheiro'
import { competenciaParaTexto, rotuloFrequencia } from '@shared/recorrencia'
import type { ContaPagar, Recorrencia } from '@shared/types'

function formatarDataBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

/** As series de despesa recorrente (ativas e encerradas). Compartilha a consulta com o detalhe da conta. */
export function useRecorrencias(enabled = true) {
  return useQuery({
    queryKey: ['contasPagar', 'recorrencias'],
    queryFn: () => unwrap(window.api.contasPagar.recorrencias()),
    enabled
  })
}

function vigenciasTexto(r: Recorrencia): string {
  return r.vigencias.map((v) => `${centavosParaBRL(v.valorCentavos)} desde ${competenciaParaTexto(v.vigenteDesde)}`).join(' → ')
}

interface ListaProps {
  open: boolean
  onClose: () => void
  onReajustar: (r: Recorrencia) => void
  onEncerrar: (r: Recorrencia) => void
}

/** Recorrencias: as series ativas e encerradas, o valor vigente de cada uma e as acoes sobre elas. */
export function RecorrenciasDialog({ open, onClose, onReajustar, onEncerrar }: ListaProps): ReactNode {
  const recorrencias = useRecorrencias(open)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Despesas recorrentes"
      description="Aluguel, energia e outras despesas que se repetem. Cada mês vira uma conta com o seu próprio valor."
      className="max-w-3xl"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--rule)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
              <th className="px-3 py-2">Despesa</th>
              <th className="px-3 py-2">Frequência</th>
              <th className="px-3 py-2 text-right">Valor atual</th>
              <th className="px-3 py-2">Período</th>
              <th className="px-3 py-2">Situação</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {recorrencias.data?.map((r) => (
              <tr key={r.id} className="border-b border-[var(--rule)] align-top last:border-0">
                <td className="px-3 py-2.5">
                  <p className="font-medium text-[var(--ink)]">{r.descricao}</p>
                  <p className="text-xs text-[var(--ink-3)]">{[r.categoria, r.fornecedorNome].filter(Boolean).join(' · ') || 'Sem categoria'}</p>
                  {r.vigencias.length > 1 && <p className="mt-0.5 text-xs text-[var(--ink-3)]">{vigenciasTexto(r)}</p>}
                </td>
                <td className="px-3 py-2.5 text-[var(--ink-2)]">
                  {rotuloFrequencia(r.frequencia)}
                  <span className="block text-xs text-[var(--ink-3)]">dia {r.diaVencimento}</span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono-tab font-medium text-[var(--ink)]">{centavosParaBRL(r.valorAtualCentavos)}</td>
                <td className="px-3 py-2.5 text-[var(--ink-2)]">
                  <span className="font-mono-tab">{formatarDataBr(r.dataInicio)}</span>
                  <span className="block text-xs text-[var(--ink-3)]">{r.dataFim ? `até ${formatarDataBr(r.dataFim)}` : 'sem data de término'}</span>
                </td>
                <td className="px-3 py-2.5">
                  <Badge tone={r.status === 'ATIVA' ? 'ok' : 'neutral'}>{r.status === 'ATIVA' ? 'Ativa' : 'Encerrada'}</Badge>
                  <span className="mt-0.5 block text-xs text-[var(--ink-3)]">
                    {r.abertas} em aberto{r.proximoVencimento ? ` · próx. ${formatarDataBr(r.proximoVencimento)}` : ''}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  {r.status === 'ATIVA' && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="secondary" onClick={() => onReajustar(r)}>
                        <TrendingUp className="size-3.5" /> Reajustar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onEncerrar(r)}>
                        <CalendarX className="size-3.5" /> Encerrar
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {recorrencias.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[var(--ink-3)]">
                  Nenhuma despesa recorrente. Marque "Despesa recorrente" ao lançar uma nova conta.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Dialog>
  )
}

interface DetalheProps {
  conta: ContaPagar | null
  onClose: () => void
  onEditar: (c: ContaPagar) => void
  onReajustar: (r: Recorrencia, competencia: string | null) => void
  onEncerrar: (r: Recorrencia) => void
}

/** Detalhe de uma conta de recorrencia: a serie a que pertence e as acoes (editar, reajustar, encerrar). */
export function ContaRecorrenteDialog({ conta, onClose, onEditar, onReajustar, onEncerrar }: DetalheProps): ReactNode {
  const recorrencias = useRecorrencias(conta !== null)
  if (!conta) return null
  const serie = recorrencias.data?.find((r) => r.id === conta.recorrenciaId)
  const emAberto = conta.situacao === 'ABERTA' && conta.valorPagoCentavos === 0
  const ativa = serie?.status === 'ATIVA'

  return (
    <Dialog
      open
      onClose={onClose}
      title={conta.descricao}
      description={conta.competencia ? `Despesa recorrente · competência ${competenciaParaTexto(conta.competencia)}` : 'Despesa recorrente'}
      className="max-w-md"
    >
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-[var(--ink-3)]">Esta conta</dt>
          <dd className="text-right font-mono-tab text-[var(--ink)]">{centavosParaBRL(conta.valorCentavos)}</dd>
          <dt className="text-[var(--ink-3)]">Vencimento</dt>
          <dd className="text-right font-mono-tab text-[var(--ink)]">{formatarDataBr(conta.vencimento)}</dd>
          {serie && (
            <>
              <dt className="text-[var(--ink-3)]">Valor vigente da série</dt>
              <dd className="text-right font-mono-tab text-[var(--ink)]">{centavosParaBRL(serie.valorAtualCentavos)}</dd>
              <dt className="text-[var(--ink-3)]">Frequência</dt>
              <dd className="text-right text-[var(--ink)]">
                {rotuloFrequencia(serie.frequencia)}, dia {serie.diaVencimento}
              </dd>
              <dt className="text-[var(--ink-3)]">Série</dt>
              <dd className="text-right text-[var(--ink)]">
                {serie.status === 'ATIVA' ? 'Ativa' : `Encerrada${serie.dataFim ? ` em ${formatarDataBr(serie.dataFim)}` : ''}`}
              </dd>
            </>
          )}
        </dl>
        {!emAberto && <p className="text-xs text-[var(--ink-3)]">Esta conta já foi paga (ou tem pagamento): não pode ser alterada.</p>}
        <div className="flex flex-col gap-2 border-t border-[var(--rule)] pt-4">
          <Button variant="secondary" disabled={!emAberto} onClick={() => onEditar(conta)}>
            <Pencil className="size-4" /> Editar esta conta…
          </Button>
          <Button variant="secondary" disabled={!serie || !ativa} onClick={() => serie && onReajustar(serie, conta.competencia)}>
            <TrendingUp className="size-4" /> Reajustar valor…
          </Button>
          <Button variant="secondary" disabled={!serie || !ativa} onClick={() => serie && onEncerrar(serie)}>
            <CalendarX className="size-4" /> Encerrar recorrência…
          </Button>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-[var(--ink-3)]">
          <Repeat className="size-3.5" /> Para excluir, use a lixeira da lista: dá para excluir só esta conta ou esta e as próximas.
        </p>
      </div>
    </Dialog>
  )
}
