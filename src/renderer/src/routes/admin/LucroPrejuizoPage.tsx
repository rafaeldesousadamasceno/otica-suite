import { type ReactNode, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardTitle, CardBody } from '@renderer/components/ui/Card'
import { Input } from '@renderer/components/ui/Input'
import { Badge } from '@renderer/components/ui/Badge'
import { unwrap } from '@renderer/lib/ipc'
import { centavosParaBRL } from '@renderer/lib/dinheiro'
import type { CategoriaProduto, LucroPrejuizoRegime } from '@shared/types'
import { hojeLocal, dataLocalISO } from '@shared/data'

function primeiroDiaMesAtualIso(): string {
  const hoje = new Date()
  const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  return dataLocalISO(primeiro)
}

function hojeIso(): string {
  return hojeLocal()
}

const ROTULO_CATEGORIA: Record<CategoriaProduto, string> = {
  armacao: 'Armação',
  lente: 'Lente',
  acessorio: 'Acessório',
  servico: 'Serviço'
}

function RegimeCard({ titulo, regime }: { titulo: string; regime: LucroPrejuizoRegime }): ReactNode {
  const positivo = regime.resultadoCentavos >= 0
  const categorias = [...regime.despesasPorCategoria].sort((a, b) => b.totalCentavos - a.totalCentavos)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--ink-3)]">Receitas</span>
          <span className="font-mono-tab font-medium text-[var(--ok)]">
            {centavosParaBRL(regime.receitasCentavos)}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--ink-3)]">Despesas</span>
          <span className="font-mono-tab font-medium text-[var(--danger)]">
            {centavosParaBRL(regime.despesasCentavos)}
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--rule)] pt-3 text-sm">
          <span className="font-medium text-[var(--ink)]">Resultado</span>
          <span
            className={`font-mono-tab text-lg font-bold ${positivo ? 'text-[var(--ok)]' : 'text-[var(--danger)]'}`}
          >
            {centavosParaBRL(regime.resultadoCentavos)}
          </span>
        </div>

        {categorias.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5 border-t border-[var(--rule)] pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
              Despesas por categoria
            </p>
            {categorias.map((c) => (
              <div key={c.categoria ?? 'sem-categoria'} className="flex items-center justify-between text-sm">
                <span className="text-[var(--ink-2)]">{c.categoria ?? 'Sem categoria'}</span>
                <span className="font-mono-tab text-[var(--ink)]">{centavosParaBRL(c.totalCentavos)}</span>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

export function LucroPrejuizoPage(): ReactNode {
  const [dataInicio, setDataInicio] = useState(primeiroDiaMesAtualIso)
  const [dataFim, setDataFim] = useState(hojeIso)

  const resultado = useQuery({
    queryKey: ['lucroPrejuizo', { dataInicio, dataFim }],
    queryFn: () => unwrap(window.api.financeiro.lucroPrejuizo({ dataInicio, dataFim }))
  })

  const margens = [...(resultado.data?.margemPorProduto ?? [])].sort(
    (a, b) => b.margemCentavos - a.margemCentavos
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--ink)]">Lucro / Prejuízo</h1>
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

      {resultado.data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <RegimeCard titulo="Regime de Caixa" regime={resultado.data.caixa} />
            <RegimeCard titulo="Regime de Competência" regime={resultado.data.competencia} />
          </div>

          <p className="text-xs text-[var(--ink-3)]">
            Regime de caixa considera o que efetivamente entrou/saiu; regime de competência reconhece a
            venda na data da venda e a despesa no vencimento da conta a pagar, independente do pagamento.
          </p>
        </>
      )}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Margem por Produto</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                <th className="px-4 py-2.5">Produto</th>
                <th className="px-4 py-2.5">Categoria</th>
                <th className="px-4 py-2.5 text-right">Qtd.</th>
                <th className="px-4 py-2.5 text-right">Receita</th>
                <th className="px-4 py-2.5 text-right">Custo</th>
                <th className="px-4 py-2.5 text-right">Margem</th>
              </tr>
            </thead>
            <tbody>
              {margens.map((m) => (
                <tr key={m.produtoId} className="border-b border-[var(--rule)] last:border-0">
                  <td className="px-4 py-2.5 text-[var(--ink)]">{m.descricao}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone="neutral">{ROTULO_CATEGORIA[m.categoria]}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono-tab text-[var(--ink-2)]">
                    {m.quantidadeVendida}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono-tab text-[var(--ink)]">
                    {centavosParaBRL(m.receitaCentavos)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono-tab text-[var(--ink-2)]">
                    {centavosParaBRL(m.custoCentavos)}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-mono-tab font-medium ${
                      m.margemCentavos >= 0 ? 'text-[var(--ok)]' : 'text-[var(--danger)]'
                    }`}
                  >
                    {centavosParaBRL(m.margemCentavos)}
                  </td>
                </tr>
              ))}

              {margens.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[var(--ink-3)]">
                    Nenhuma venda no período.
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
