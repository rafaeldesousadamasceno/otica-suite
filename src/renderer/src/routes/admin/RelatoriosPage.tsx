import { type ReactNode, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { FileText, Printer } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { toast } from '@renderer/state/toastStore'
import type { PeriodoQuery } from '@shared/ipc'

function primeiroDiaMesAtualIso(): string {
  const hoje = new Date()
  const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  return primeiro.toISOString().slice(0, 10)
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10)
}

interface RelatorioDef {
  titulo: string
  descricao: string
  precisaPeriodo: boolean
  gerar: (periodo: PeriodoQuery) => Promise<{ caminho: string } | null>
}

const RELATORIOS: RelatorioDef[] = [
  {
    titulo: 'Receitas e despesas',
    descricao: 'Lançamentos financeiros do período.',
    precisaPeriodo: true,
    gerar: (p) => unwrap(window.api.relatorios.receitasDespesas(p))
  },
  {
    titulo: 'Fluxo de caixa',
    descricao: 'Entradas e saídas com saldo acumulado.',
    precisaPeriodo: true,
    gerar: (p) => unwrap(window.api.relatorios.fluxoCaixa(p))
  },
  {
    titulo: 'Lucro / Prejuízo',
    descricao: 'Regimes de caixa e competência, margem por produto.',
    precisaPeriodo: true,
    gerar: (p) => unwrap(window.api.relatorios.lucroPrejuizo(p))
  },
  {
    titulo: 'Inadimplência',
    descricao: 'Parcelas vencidas e ainda em aberto.',
    precisaPeriodo: false,
    gerar: () => unwrap(window.api.relatorios.inadimplencia())
  },
  {
    titulo: 'Produtos abaixo do mínimo',
    descricao: 'Itens de estoque que precisam de reposição.',
    precisaPeriodo: false,
    gerar: () => unwrap(window.api.relatorios.produtosAbaixoMinimo())
  },
  {
    titulo: 'Curva ABC de produtos',
    descricao: 'Classificação A/B/C pela receita do período.',
    precisaPeriodo: true,
    gerar: (p) => unwrap(window.api.relatorios.curvaAbc(p))
  },
  {
    titulo: 'Vendas por vendedor',
    descricao: 'Quantidade e valor total vendido, por vendedor.',
    precisaPeriodo: true,
    gerar: (p) => unwrap(window.api.relatorios.vendasPorVendedor(p))
  },
  {
    titulo: 'Ranking de vendedores',
    descricao: 'Vendedores ordenados pelo total vendido no período.',
    precisaPeriodo: true,
    gerar: (p) => unwrap(window.api.relatorios.rankingVendedores(p))
  },
  {
    titulo: 'Comissões',
    descricao: 'Comissões provisionadas, liberadas e canceladas no período.',
    precisaPeriodo: true,
    gerar: (p) => unwrap(window.api.relatorios.comissoes(p))
  }
]

function RelatorioCard({ def, periodo }: { def: RelatorioDef; periodo: PeriodoQuery }): ReactNode {
  const gerar = useMutation({
    mutationFn: () => def.gerar(periodo),
    onSuccess: (resultado) => {
      if (resultado) toast.ok(`PDF salvo em ${resultado.caminho}`)
    },
    onError: (err) => toast.error(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  return (
    <Card>
      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 size-5 shrink-0 text-[var(--ink-3)]" />
          <div>
            <p className="font-medium text-[var(--ink)]">{def.titulo}</p>
            <p className="text-xs text-[var(--ink-3)]">{def.descricao}</p>
          </div>
        </div>
        <Button variant="secondary" loading={gerar.isPending} onClick={() => gerar.mutate()}>
          <Printer className="size-4" /> Gerar PDF
        </Button>
      </div>
    </Card>
  )
}

export function RelatoriosPage(): ReactNode {
  const [dataInicio, setDataInicio] = useState(primeiroDiaMesAtualIso)
  const [dataFim, setDataFim] = useState(hojeIso)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-[var(--ink)]">Relatórios</h1>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
          De
          <Input type="date" className="w-40" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
          Até
          <Input type="date" className="w-40" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
        </label>
        <p className="text-xs text-[var(--ink-3)]">
          O período acima vale para os relatórios que dependem de data — os demais trazem sempre a situação atual.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {RELATORIOS.map((def) => (
          <RelatorioCard key={def.titulo} def={def} periodo={{ dataInicio, dataFim }} />
        ))}
      </div>
    </div>
  )
}
