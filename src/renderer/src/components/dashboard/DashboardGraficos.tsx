import type { ReactNode } from 'react'
import { Trophy } from 'lucide-react'
import { ChartCard } from '@renderer/components/charts/ChartCard'
import { LineAreaChart } from '@renderer/components/charts/LineAreaChart'
import { ColumnChart } from '@renderer/components/charts/ColumnChart'
import { BarChartH } from '@renderer/components/charts/BarChartH'
import { DonutChart } from '@renderer/components/charts/DonutChart'
import { Card, CardBody } from '@renderer/components/ui/Card'
import { centavosParaBRL } from '@renderer/lib/dinheiro'
import type { CategoriaVenda, DashboardResumo, EtapaOS } from '@shared/types'

const ROTULO_CATEGORIA: Record<CategoriaVenda, string> = {
  armacao: 'Armações',
  lente: 'Lentes',
  acessorio: 'Acessórios',
  servico: 'Serviços',
  outros: 'Outros'
}

/** A cor segue a categoria (nunca a posicao na lista): filtrar nao repinta quem ficou. */
const COR_CATEGORIA: Record<CategoriaVenda, string> = {
  armacao: 'var(--viz-1)',
  lente: 'var(--viz-2)',
  acessorio: 'var(--viz-3)',
  servico: 'var(--viz-4)',
  outros: 'var(--viz-outros)'
}

const ROTULO_ETAPA: Record<EtapaOS, string> = {
  'EM ABERTO': 'Em aberto',
  LABORATÓRIO: 'No laboratório',
  CHEGOU: 'Prontas p/ retirada'
}

const GRANULARIDADE_TEXTO = { dia: 'por dia', semana: 'por semana', mes: 'por mês' } as const

const pct = (parte: number, total: number): string =>
  total > 0 ? `${((parte / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'

export function GraficoFaturamento({ d }: { d: DashboardResumo }): ReactNode {
  const total = d.serie.faturamento.reduce((s, v) => s + v, 0)
  const comparacao = d.serie.comparacao
  const comparando = comparacao !== null

  return (
    <ChartCard
      titulo="Evolução do faturamento"
      subtitulo={total > 0 ? `${centavosParaBRL(total)} no período, ${GRANULARIDADE_TEXTO[d.granularidade]}` : undefined}
      legenda={comparando ? [{ nome: 'Período atual', cor: 'var(--viz-1)' }, { nome: 'Período anterior', cor: 'var(--ink-3)' }] : undefined}
      tabela={{
        colunas: comparando ? ['Período', 'Atual', 'Anterior'] : ['Período', 'Faturamento'],
        linhas: d.serie.baldes.map((b, i) =>
          comparando
            ? [b.titulo, centavosParaBRL(d.serie.faturamento[i]), centavosParaBRL(comparacao[i] ?? 0)]
            : [b.titulo, centavosParaBRL(d.serie.faturamento[i])]
        )
      }}
      vazio={total === 0 && !(comparacao?.some((v) => v > 0) ?? false)}
      mensagemVazia="Nenhuma venda no período escolhido."
      className="xl:col-span-2"
    >
      <LineAreaChart
        pontos={d.serie.baldes.map((_, i) => ({ chave: String(i), valor: d.serie.faturamento[i] }))}
        nomeSerie="Período atual"
        comparacao={comparacao ? { nome: 'Período anterior', valores: comparacao } : undefined}
        formatarEixoX={(k) => d.serie.baldes[Number(k)].rotulo}
        formatarTitulo={(k) => d.serie.baldes[Number(k)].titulo}
        formatarValor={centavosParaBRL}
        ariaLabel={`Evolução do faturamento ${GRANULARIDADE_TEXTO[d.granularidade]}: ${centavosParaBRL(total)} no período. Use as setas do teclado para ver cada ponto.`}
      />
    </ChartCard>
  )
}

export function GraficoRecebidoDespesas({ d }: { d: DashboardResumo }): ReactNode {
  const f = d.financeiro
  if (!f) return null
  const semMovimento = f.recebidoPorBalde.every((v) => v === 0) && f.despesasPorBalde.every((v) => v === 0)

  return (
    <ChartCard
      titulo="Recebido e despesas"
      subtitulo={`Regime de caixa, ${GRANULARIDADE_TEXTO[d.granularidade]}`}
      legenda={[{ nome: 'Recebido', cor: 'var(--viz-1)' }, { nome: 'Despesas', cor: 'var(--viz-2)' }]}
      tabela={{
        colunas: ['Período', 'Recebido', 'Despesas'],
        linhas: d.serie.baldes.map((b, i) => [b.titulo, centavosParaBRL(f.recebidoPorBalde[i]), centavosParaBRL(f.despesasPorBalde[i])])
      }}
      vazio={semMovimento}
      mensagemVazia="Nenhum lançamento financeiro no período."
    >
      <ColumnChart
        categorias={d.serie.baldes.map((b) => b.rotulo)}
        titulosCategoria={d.serie.baldes.map((b) => b.titulo)}
        series={[
          { nome: 'Recebido', cor: 'var(--viz-1)', valores: f.recebidoPorBalde.map((v) => Math.max(0, v)) },
          { nome: 'Despesas', cor: 'var(--viz-2)', valores: f.despesasPorBalde }
        ]}
        formatarValor={centavosParaBRL}
        ariaLabel={`Recebido e despesas ${GRANULARIDADE_TEXTO[d.granularidade]}: recebido ${centavosParaBRL(f.recebido.atual)}, despesas ${centavosParaBRL(f.despesas.atual)}`}
      />
    </ChartCard>
  )
}

export function GraficoCategorias({ d }: { d: DashboardResumo }): ReactNode {
  const total = d.categorias.reduce((s, c) => s + c.totalCentavos, 0)

  return (
    <ChartCard
      titulo="Vendas por categoria"
      subtitulo="Receita dos itens vendidos, já com o desconto geral"
      tabela={{
        colunas: ['Categoria', 'Itens', 'Faturamento', 'Participação'],
        linhas: d.categorias.map((c) => [ROTULO_CATEGORIA[c.categoria], String(c.quantidade), centavosParaBRL(c.totalCentavos), pct(c.totalCentavos, total)])
      }}
      vazio={d.categorias.length === 0}
      mensagemVazia="Nenhuma venda no período escolhido."
    >
      <DonutChart
        fatias={d.categorias.map((c) => ({ id: c.categoria, rotulo: ROTULO_CATEGORIA[c.categoria], valor: c.totalCentavos, cor: COR_CATEGORIA[c.categoria] }))}
        formatarValor={centavosParaBRL}
        centro={{ valor: centavosParaBRL(total), rotulo: 'faturamento' }}
        ariaLabel={`Vendas por categoria: ${d.categorias.map((c) => `${ROTULO_CATEGORIA[c.categoria]} ${centavosParaBRL(c.totalCentavos)}`).join(', ')}`}
      />
    </ChartCard>
  )
}

export function GraficoRanking({ d }: { d: DashboardResumo }): ReactNode {
  const ranking = d.ranking
  if (!ranking) return null
  const total = ranking.reduce((s, v) => s + v.totalCentavos, 0)
  const comVenda = ranking.filter((v) => v.quantidadeVendas > 0)

  return (
    <ChartCard
      titulo="Ranking de vendedores"
      icone={<Trophy className="size-4 text-[var(--warn)]" />}
      subtitulo="Total vendido no período"
      tabela={{
        colunas: ['Vendedor', 'Vendas', 'Ticket médio', 'Total', 'Participação'],
        linhas: ranking.map((v, i) => [
          `${i + 1}. ${v.vendedorNome}`,
          String(v.quantidadeVendas),
          v.quantidadeVendas > 0 ? centavosParaBRL(Math.round(v.totalCentavos / v.quantidadeVendas)) : '—',
          centavosParaBRL(v.totalCentavos),
          pct(v.totalCentavos, total)
        ])
      }}
      vazio={comVenda.length === 0}
      mensagemVazia="Nenhuma venda no período escolhido."
    >
      <BarChartH
        itens={comVenda.slice(0, 8).map((v, i) => ({ id: v.vendedorId, rotulo: `${i + 1}. ${v.vendedorNome}`, valor: v.totalCentavos }))}
        formatarValor={centavosParaBRL}
        ariaLabel="Ranking de vendedores pelo total vendido no período"
      />
    </ChartCard>
  )
}

export function GraficoTopProdutos({ d }: { d: DashboardResumo }): ReactNode {
  return (
    <ChartCard
      titulo="Produtos mais vendidos"
      subtitulo="Pelo valor vendido (itens importados do sistema antigo ficam de fora)"
      tabela={{
        colunas: d.topProdutos.some((p) => p.margemCentavos !== null) ? ['Produto', 'Qtd', 'Faturamento', 'Margem'] : ['Produto', 'Qtd', 'Faturamento'],
        linhas: d.topProdutos.map((p) =>
          d.topProdutos.some((x) => x.margemCentavos !== null)
            ? [p.descricao, String(p.quantidade), centavosParaBRL(p.totalCentavos), p.margemCentavos === null ? '—' : centavosParaBRL(p.margemCentavos)]
            : [p.descricao, String(p.quantidade), centavosParaBRL(p.totalCentavos)]
        )
      }}
      vazio={d.topProdutos.length === 0}
      mensagemVazia="Nenhum produto vendido no período escolhido."
    >
      <BarChartH
        itens={d.topProdutos.slice(0, 8).map((p) => ({ id: p.produtoId, rotulo: p.descricao, valor: p.totalCentavos }))}
        formatarValor={centavosParaBRL}
        ariaLabel="Produtos mais vendidos no período, pelo valor vendido"
        larguraRotulo={220}
      />
    </ChartCard>
  )
}

export function GraficoFormasPagamento({ d }: { d: DashboardResumo }): ReactNode {
  const total = d.formasPagamento.reduce((s, f) => s + f.totalCentavos, 0)

  return (
    <ChartCard
      titulo="Formas de pagamento"
      subtitulo="Valor vendido em cada forma (parcelas e pendências entram inteiras)"
      tabela={{
        colunas: ['Forma', 'Vendido', 'Participação'],
        linhas: d.formasPagamento.map((f) => [f.forma, centavosParaBRL(f.totalCentavos), pct(f.totalCentavos, total)])
      }}
      vazio={d.formasPagamento.length === 0}
      mensagemVazia="Nenhuma venda no período escolhido."
    >
      <BarChartH
        itens={d.formasPagamento.map((f) => ({ id: f.forma, rotulo: f.forma, valor: f.totalCentavos }))}
        formatarValor={centavosParaBRL}
        ariaLabel="Valor vendido por forma de pagamento no período"
      />
    </ChartCard>
  )
}

export function GraficoOs({ d }: { d: DashboardResumo }): ReactNode {
  const etapas = d.os.porEtapa
  const total = etapas.reduce((s, e) => s + e.quantidade, 0)

  return (
    <ChartCard
      titulo="Ordens de serviço"
      subtitulo="Em andamento agora, da abertura até a retirada"
      tabela={{
        colunas: ['Etapa', 'Quantidade'],
        linhas: etapas.map((e) => [ROTULO_ETAPA[e.situacao], String(e.quantidade)])
      }}
      vazio={total === 0}
      mensagemVazia="Nenhuma ordem de serviço em andamento."
    >
      <div className="flex flex-col gap-4">
        {/* Etapas tem ordem (aberta -> laboratorio -> chegou): rampa ordinal de uma cor so. */}
        <BarChartH
          itens={etapas.map((e, i) => ({ id: e.situacao, rotulo: ROTULO_ETAPA[e.situacao], valor: e.quantidade, cor: `var(--viz-ord-${i + 1})` }))}
          formatarValor={(v) => `${v} ${v === 1 ? 'OS' : 'OSs'}`}
          ariaLabel={`Ordens de serviço em andamento: ${etapas.map((e) => `${ROTULO_ETAPA[e.situacao]} ${e.quantidade}`).join(', ')}`}
        />
        <dl className="grid grid-cols-3 gap-3 border-t border-[var(--rule)] pt-3 text-center">
          <div>
            <dd className="font-mono-tab text-lg font-semibold text-[var(--ink)]">{d.os.abertasNoPeriodo}</dd>
            <dt className="text-xs text-[var(--ink-3)]">abertas no período</dt>
          </div>
          <div>
            <dd className="font-mono-tab text-lg font-semibold text-[var(--ink)]">{d.os.entreguesNoPeriodo}</dd>
            <dt className="text-xs text-[var(--ink-3)]">entregues no período</dt>
          </div>
          <div>
            <dd className="font-mono-tab text-lg font-semibold text-[var(--ink)]">
              {d.os.diasMediosAteEntrega === null ? '—' : `${d.os.diasMediosAteEntrega.toLocaleString('pt-BR')} dias`}
            </dd>
            <dt className="text-xs text-[var(--ink-3)]">tempo médio até a entrega</dt>
          </div>
        </dl>
      </div>
    </ChartCard>
  )
}

/** Mensagem de rodape sobre o que o lucro bruto cobre (so quando a margem aparece). */
export function NotaCobertura({ d }: { d: DashboardResumo }): ReactNode {
  if (d.coberturaCustoPct === null || d.coberturaCustoPct >= 99.5) return null
  return (
    <Card>
      <CardBody className="py-3 text-xs text-[var(--ink-3)]">
        O lucro bruto e a margem consideram os itens com custo conhecido, que são{' '}
        {d.coberturaCustoPct.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% da receita dos itens vendidos. Itens importados do sistema
        antigo e produtos sem custo cadastrado ficam de fora.
      </CardBody>
    </Card>
  )
}
