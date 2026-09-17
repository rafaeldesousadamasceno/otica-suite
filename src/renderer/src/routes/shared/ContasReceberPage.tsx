import { type ReactNode, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, CircleDollarSign } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { Badge } from '@renderer/components/ui/Badge'
import { unwrap } from '@renderer/lib/ipc'
import { useDebouncedValue } from '@renderer/lib/useDebouncedValue'
import { centavosParaBRL } from '@renderer/lib/dinheiro'
import { BaixaParcelaDialog } from '@renderer/components/BaixaParcelaDialog'
import { useAuthStore } from '@renderer/state/authStore'
import type { ContaReceber, SituacaoContaReceber } from '@shared/types'

function formatarDataBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

const TOM_SITUACAO: Record<SituacaoContaReceber, 'ok' | 'warn' | 'danger'> = {
  PAGA: 'ok',
  ABERTA: 'warn',
  CANCELADA: 'danger'
}

export function ContasReceberPage(): ReactNode {
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState<'' | SituacaoContaReceber>('')
  const [apenasVencidas, setApenasVencidas] = useState(false)
  const [parcelaParaBaixa, setParcelaParaBaixa] = useState<ContaReceber | null>(null)
  const buscaDebounced = useDebouncedValue(busca)
  const sessao = useAuthStore((s) => s.sessao)
  const ehAdmin = sessao?.usuario.perfil === 'admin'

  const contas = useQuery({
    queryKey: ['contasReceber', { busca: buscaDebounced, situacao, apenasVencidas }],
    queryFn: () => unwrap(window.api.contasReceber.list({ busca: buscaDebounced, situacao, apenasVencidas }))
  })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--ink)]">Contas a Receber</h1>
        {!ehAdmin && <p className="text-sm text-[var(--ink-3)]">Mostrando apenas as parcelas das suas vendas.</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-3)]" />
          <Input
            className="pl-9"
            placeholder="Cliente ou nº da venda…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Select className="w-40" value={situacao} onChange={(e) => setSituacao(e.target.value as '' | SituacaoContaReceber)}>
          <option value="">Todas as situações</option>
          <option value="ABERTA">Em aberto</option>
          <option value="PAGA">Pagas</option>
          <option value="CANCELADA">Canceladas</option>
        </Select>
        <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
          <input type="checkbox" checked={apenasVencidas} onChange={(e) => setApenasVencidas(e.target.checked)} />
          Só vencidas
        </label>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                <th className="px-4 py-2.5">Venda</th>
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Parcela</th>
                <th className="px-4 py-2.5">Vencimento</th>
                <th className="px-4 py-2.5 text-right">Valor</th>
                <th className="px-4 py-2.5">Situação</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {contas.data?.map((c) => (
                <tr
                  key={c.id}
                  className={`border-b border-[var(--rule)] last:border-0 ${c.vencida ? 'bg-[var(--danger-wash)]' : ''}`}
                >
                  <td className="px-4 py-2.5 font-mono-tab font-medium text-[var(--accent)]">{c.vendaNumero}</td>
                  <td className="px-4 py-2.5 text-[var(--ink)]">{c.clienteNome}</td>
                  <td className="px-4 py-2.5 text-center text-[var(--ink-2)]">
                    {c.parcela}/{c.totalParcelas}
                  </td>
                  <td className="px-4 py-2.5 font-mono-tab text-[var(--ink-2)]">{formatarDataBr(c.vencimento)}</td>
                  <td className="px-4 py-2.5 text-right font-mono-tab font-medium text-[var(--ink)]">
                    {centavosParaBRL(c.valorCentavos - c.valorRecebidoCentavos)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <Badge tone={TOM_SITUACAO[c.situacao]}>{c.situacao}</Badge>
                      {c.vencida && <Badge tone="danger">Vencida</Badge>}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    {c.situacao === 'ABERTA' && (
                      <button
                        type="button"
                        title="Dar baixa"
                        onClick={() => setParcelaParaBaixa(c)}
                        className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--ok-wash)] hover:text-[var(--ok)]"
                      >
                        <CircleDollarSign className="size-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {contas.data?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[var(--ink-3)]">
                    Nenhuma parcela encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <BaixaParcelaDialog conta={parcelaParaBaixa} onClose={() => setParcelaParaBaixa(null)} />
    </div>
  )
}
