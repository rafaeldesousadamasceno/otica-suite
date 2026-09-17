import { type ReactNode, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@renderer/components/ui/Card'
import { Input } from '@renderer/components/ui/Input'
import { Badge } from '@renderer/components/ui/Badge'
import { unwrap } from '@renderer/lib/ipc'
import { centavosParaBRL } from '@renderer/lib/dinheiro'
import type { LancamentoEntry } from '@shared/types'

function formatarDataBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

function primeiroDiaMesAtualIso(): string {
  const hoje = new Date()
  const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  return primeiro.toISOString().slice(0, 10)
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10)
}

const TOM_TIPO: Record<LancamentoEntry['tipo'], 'ok' | 'danger'> = {
  RECEITA: 'ok',
  DESPESA: 'danger'
}

export function FluxoCaixaPage(): ReactNode {
  const [dataInicio, setDataInicio] = useState(primeiroDiaMesAtualIso)
  const [dataFim, setDataFim] = useState(hojeIso)

  const fluxo = useQuery({
    queryKey: ['fluxoCaixa', { dataInicio, dataFim }],
    queryFn: () => unwrap(window.api.financeiro.fluxoCaixa({ dataInicio, dataFim }))
  })

  const saldoPositivo = (fluxo.data?.saldoCentavos ?? 0) >= 0

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--ink)]">Fluxo de Caixa</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
          De
          <Input
            type="date"
            className="w-40"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
          Até
          <Input
            type="date"
            className="w-40"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex flex-col gap-1 p-5">
            <p className="text-sm text-[var(--ink-3)]">Total Receitas</p>
            <p className="text-2xl font-semibold font-mono-tab text-[var(--ok)]">
              {centavosParaBRL(fluxo.data?.totalReceitasCentavos ?? 0)}
            </p>
          </div>
        </Card>
        <Card>
          <div className="flex flex-col gap-1 p-5">
            <p className="text-sm text-[var(--ink-3)]">Total Despesas</p>
            <p className="text-2xl font-semibold font-mono-tab text-[var(--danger)]">
              {centavosParaBRL(fluxo.data?.totalDespesasCentavos ?? 0)}
            </p>
          </div>
        </Card>
        <Card>
          <div className="flex flex-col gap-1 p-5">
            <p className="text-sm text-[var(--ink-3)]">Saldo</p>
            <p
              className={`text-2xl font-bold font-mono-tab ${saldoPositivo ? 'text-[var(--ok)]' : 'text-[var(--danger)]'}`}
            >
              {centavosParaBRL(fluxo.data?.saldoCentavos ?? 0)}
            </p>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                <th className="px-4 py-2.5">Data</th>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5">Categoria</th>
                <th className="px-4 py-2.5">Descrição</th>
                <th className="px-4 py-2.5 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {fluxo.data?.lancamentos.map((l) => (
                <tr key={l.id} className="border-b border-[var(--rule)] last:border-0">
                  <td className="px-4 py-2.5 font-mono-tab text-[var(--ink-2)]">{formatarDataBr(l.data)}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={TOM_TIPO[l.tipo]}>{l.tipo}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--ink-2)]">{l.categoria ?? '—'}</td>
                  <td className="px-4 py-2.5 text-[var(--ink)]">{l.descricao}</td>
                  <td
                    className={`px-4 py-2.5 text-right font-mono-tab font-medium ${
                      l.tipo === 'RECEITA' ? 'text-[var(--ok)]' : 'text-[var(--danger)]'
                    }`}
                  >
                    {centavosParaBRL(l.valorCentavos)}
                  </td>
                </tr>
              ))}

              {fluxo.data?.lancamentos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--ink-3)]">
                    Nenhum lançamento no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
