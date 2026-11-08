import type { ReactNode } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Percent, Receipt, ShoppingCart, TrendingUp, UserPlus, Users, Wallet, CircleDollarSign, Banknote } from 'lucide-react'
import { Button } from '@renderer/components/ui/Button'
import { Card, CardBody } from '@renderer/components/ui/Card'
import { FiltroPeriodo } from '@renderer/components/dashboard/FiltroPeriodo'
import { InsightsCard } from '@renderer/components/dashboard/InsightsCard'
import { KpiCard } from '@renderer/components/dashboard/KpiCard'
import { PosicaoAtual } from '@renderer/components/dashboard/PosicaoAtual'
import {
  GraficoCategorias,
  GraficoFaturamento,
  GraficoFormasPagamento,
  GraficoOs,
  GraficoRanking,
  GraficoRecebidoDespesas,
  GraficoTopProdutos,
  NotaCobertura
} from '@renderer/components/dashboard/DashboardGraficos'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { centavosParaBRL } from '@renderer/lib/dinheiro'
import { useFiltroDashboard } from '@renderer/lib/useFiltroDashboard'
import { useAuthStore } from '@renderer/state/authStore'
import type { DashboardResumo } from '@shared/types'

const inteiro = (n: number): string => n.toLocaleString('pt-BR')
const percentual = (n: number): string => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

function Indicadores({ d }: { d: DashboardResumo }): ReactNode {
  const k = d.kpis
  const resultadoNegativo = d.financeiro ? d.financeiro.resultado.atual < 0 : false

  return (
    <>
      <section className="flex flex-col gap-3" aria-label="Indicadores do período">
        <h2 className="text-base font-semibold text-[var(--ink)]">Visão geral do período</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard
            icone={<ShoppingCart className="size-5" />}
            rotulo="Faturamento"
            valor={centavosParaBRL(k.faturamento.atual)}
            comparado={k.faturamento}
            formatar={centavosParaBRL}
            explicacao="Soma do valor das vendas feitas no período, já com os descontos. Vendas canceladas não entram. É o que foi vendido, não o que já foi recebido."
          />
          <KpiCard
            icone={<Receipt className="size-5" />}
            rotulo="Vendas realizadas"
            valor={inteiro(k.vendas.atual)}
            comparado={k.vendas}
            formatar={inteiro}
            explicacao="Quantidade de vendas feitas no período, sem as canceladas."
          />
          <KpiCard
            icone={<Banknote className="size-5" />}
            rotulo="Ticket médio"
            valor={centavosParaBRL(k.ticketMedio.atual)}
            comparado={k.ticketMedio}
            formatar={centavosParaBRL}
            explicacao="Faturamento dividido pela quantidade de vendas: quanto cada venda rendeu em média."
          />
          {k.lucroBruto && (
            <KpiCard
              icone={<TrendingUp className="size-5" />}
              rotulo="Lucro bruto (estimado)"
              valor={centavosParaBRL(k.lucroBruto.atual)}
              comparado={k.lucroBruto}
              formatar={centavosParaBRL}
              tom={k.lucroBruto.atual < 0 ? 'perigo' : 'neutro'}
              explicacao="Receita dos itens menos o custo deles. Usa o custo do produto na data da venda; vendas antigas usam o custo atual. Itens sem custo conhecido (importados, sem custo cadastrado) ficam de fora."
            />
          )}
          {k.margemPct && (
            <KpiCard
              icone={<Percent className="size-5" />}
              rotulo="Margem bruta"
              valor={percentual(k.margemPct.atual)}
              comparado={k.margemPct}
              formatar={percentual}
              explicacao="Lucro bruto dividido pela receita dos itens com custo conhecido."
            />
          )}
          <KpiCard
            icone={<Users className="size-5" />}
            rotulo="Clientes no período"
            valor={`${inteiro(k.clientesNovos.atual + k.clientesRecorrentes.atual)}`}
            explicacao="Clientes que compraram no período. Novo: primeira compra. Recorrente: já tinha comprado antes do período."
            extra={
              <p className="text-xs text-[var(--ink-3)]">
                {inteiro(k.clientesNovos.atual)} novo(s) · {inteiro(k.clientesRecorrentes.atual)} recorrente(s)
              </p>
            }
          />
          {k.comissao && (
            <KpiCard
              icone={<Wallet className="size-5" />}
              rotulo="Comissão do período"
              valor={centavosParaBRL(k.comissao.atual)}
              comparado={k.comissao}
              formatar={centavosParaBRL}
              tom="ok"
              explicacao="Comissão das vendas do período (provisionada ou liberada). Comissões de vendas canceladas não entram."
            />
          )}
        </div>
      </section>

      {d.financeiro && (
        <section className="flex flex-col gap-3" aria-label="Financeiro do período">
          <div>
            <h2 className="text-base font-semibold text-[var(--ink)]">Financeiro do período</h2>
            <p className="text-xs text-[var(--ink-3)]">Regime de caixa: o que de fato entrou e saiu, não o que foi vendido.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard
              icone={<CircleDollarSign className="size-5" />}
              rotulo="Recebido"
              valor={centavosParaBRL(d.financeiro.recebido.atual)}
              comparado={d.financeiro.recebido}
              formatar={centavosParaBRL}
              explicacao="Dinheiro que entrou no período (vendas à vista, entradas e parcelas recebidas), menos estornos de vendas canceladas. Suprimento de caixa não conta."
            />
            <KpiCard
              icone={<Wallet className="size-5" />}
              rotulo="Despesas pagas"
              valor={centavosParaBRL(d.financeiro.despesas.atual)}
              comparado={d.financeiro.despesas}
              formatar={centavosParaBRL}
              maisEBom={false}
              explicacao="Despesas efetivamente pagas no período. Sangria de caixa e estornos de venda não contam como despesa."
            />
            <KpiCard
              icone={<TrendingUp className="size-5" />}
              rotulo="Resultado de caixa"
              valor={
                <span className={resultadoNegativo ? 'text-[var(--danger)]' : 'text-[var(--ok)]'}>
                  {centavosParaBRL(d.financeiro.resultado.atual)}
                </span>
              }
              comparado={d.financeiro.resultado}
              formatar={centavosParaBRL}
              tom={resultadoNegativo ? 'perigo' : 'ok'}
              explicacao="Recebido menos despesas pagas no período. Não é o lucro da empresa nem o saldo do caixa: é só a diferença entre o que entrou e o que saiu."
            />
          </div>
        </section>
      )}
    </>
  )
}

export function DashboardPage(): ReactNode {
  const sessao = useAuthStore((s) => s.sessao)
  const navigate = useNavigate()
  const filtro = useFiltroDashboard()

  const dashboard = useQuery({
    queryKey: ['dashboard', filtro.query],
    queryFn: () => unwrap(window.api.dashboard.get(filtro.query)),
    placeholderData: keepPreviousData
  })
  const d = dashboard.data

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--ink)]">Olá, {sessao?.usuario.nome.split(' ')[0]}</h1>
          <p className="text-sm text-[var(--ink-3)]">
            {d?.escopo === 'vendedor' && sessao?.usuario.perfil === 'admin' ? 'Painel de um vendedor' : sessao?.usuario.perfil === 'admin' ? 'Painel do administrador' : 'Painel do vendedor'}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => navigate('/clientes')}>
            <UserPlus className="size-4" />
            Novo cliente
          </Button>
          <Button variant="secondary" onClick={() => navigate('/ordens-servico')}>
            <ClipboardList className="size-4" />
            Nova OS
          </Button>
        </div>
      </div>

      <FiltroPeriodo filtro={filtro} comparacao={d?.comparacao ?? null} />

      {dashboard.isError && !d && (
        <Card>
          <CardBody className="flex flex-col items-start gap-3">
            <p className="text-sm text-[var(--danger)]">
              {dashboard.error instanceof ApiCallError || dashboard.error instanceof Error ? dashboard.error.message : 'Não foi possível carregar o painel.'}
            </p>
            <Button variant="secondary" onClick={() => void dashboard.refetch()}>
              Tentar de novo
            </Button>
          </CardBody>
        </Card>
      )}

      {dashboard.isPending && <p className="text-sm text-[var(--ink-3)]">Carregando o painel…</p>}

      {d && (
        <div className={`flex flex-col gap-6 transition-opacity ${dashboard.isPlaceholderData ? 'opacity-60' : ''}`} aria-busy={dashboard.isPlaceholderData}>
          <InsightsCard insights={d.insights} />
          <Indicadores d={d} />
          <NotaCobertura d={d} />
          <PosicaoAtual posicao={d.posicao} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <GraficoFaturamento d={d} />
            <GraficoRecebidoDespesas d={d} />
            <GraficoCategorias d={d} />
            <GraficoRanking d={d} />
            <GraficoTopProdutos d={d} />
            <GraficoFormasPagamento d={d} />
            <GraficoOs d={d} />
          </div>
        </div>
      )}
    </div>
  )
}
