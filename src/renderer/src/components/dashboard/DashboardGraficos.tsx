import type { ReactNode } from 'react'
import { Trophy } from 'lucide-react'
import { ChartCard } from '@renderer/components/charts/ChartCard'
import { LineAreaChart } from '@renderer/components/charts/LineAreaChart'
import { ColumnChart } from '@renderer/components/charts/ColumnChart'
import { BarChartH } from '@renderer/components/charts/BarChartH'
import { centavosParaBRL } from '@renderer/lib/dinheiro'
import type {
  CategoriaVenda,
  DashboardAdmin,
  DashboardVendedor,
  EtapaOS,
  FluxoMesItem,
  OsEtapaItem,
  VendaDiaItem
} from '@shared/types'

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
// Lista propria: o MESES de @shared/types traz o numero junto ("04 - Abril"), feito para <select>.
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const ROTULO_CATEGORIA: Record<CategoriaVenda, string> = {
  armacao: 'Armação',
  lente: 'Lente',
  acessorio: 'Acessório',
  servico: 'Serviço',
  outros: 'Outros'
}

const ROTULO_ETAPA: Record<EtapaOS, string> = {
  'EM ABERTO': 'Em aberto',
  'LABORATÓRIO': 'No laboratório',
  CHEGOU: 'Chegou'
}

/** '2026-09-19' -> '19/09' */
function diaMes(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

/** '2026-09-19' -> 'sexta-feira, 19 de setembro' (ao meio-dia, para o fuso nunca mudar o dia). */
function tituloDia(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
}

/** '2026-09' -> { curto: 'set', longo: 'setembro de 2026' } */
function rotulosMes(mes: string): { curto: string; longo: string } {
  const [ano, m] = mes.split('-')
  return { curto: MESES_CURTOS[Number(m) - 1], longo: `${MESES_LONGOS[Number(m) - 1]} de ${ano}` }
}

// ---------------------------------------------------------------------
// Graficos compartilhados entre os dois paineis
// ---------------------------------------------------------------------

function GraficoVendasPorDia({
  titulo,
  dias,
  nomeSerie,
  className
}: {
  titulo: string
  dias: VendaDiaItem[]
  nomeSerie: string
  className?: string
}): ReactNode {
  const total = dias.reduce((soma, d) => soma + d.totalCentavos, 0)

  return (
    <ChartCard
      titulo={titulo}
      subtitulo={total > 0 ? `${centavosParaBRL(total)} nos últimos ${dias.length} dias` : undefined}
      tabela={{
        colunas: ['Dia', 'Vendas'],
        linhas: [...dias].reverse().map((d) => [diaMes(d.data), centavosParaBRL(d.totalCentavos)])
      }}
      vazio={total === 0}
      mensagemVazia={`Nenhuma venda nos últimos ${dias.length} dias.`}
      className={className}
    >
      <LineAreaChart
        pontos={dias.map((d) => ({ chave: d.data, valor: d.totalCentavos }))}
        nomeSerie={nomeSerie}
        formatarEixoX={diaMes}
        formatarTitulo={tituloDia}
        formatarValor={centavosParaBRL}
        ariaLabel={`${titulo}: ${centavosParaBRL(total)} no período. Use as setas do teclado para ver cada dia.`}
      />
    </ChartCard>
  )
}

function GraficoOsPorEtapa({ titulo, etapas }: { titulo: string; etapas: OsEtapaItem[] }): ReactNode {
  const total = etapas.reduce((soma, e) => soma + e.quantidade, 0)

  return (
    <ChartCard
      titulo={titulo}
      subtitulo="Da abertura até a retirada pelo cliente"
      tabela={{
        colunas: ['Etapa', 'Quantidade'],
        linhas: etapas.map((e) => [ROTULO_ETAPA[e.situacao], String(e.quantidade)])
      }}
      vazio={total === 0}
      mensagemVazia="Nenhuma ordem de serviço em andamento."
    >
      {/* Etapas tem ordem (aberta -> laboratorio -> chegou): rampa ordinal de uma cor so. */}
      <BarChartH
        itens={etapas.map((e, i) => ({
          id: e.situacao,
          rotulo: ROTULO_ETAPA[e.situacao],
          valor: e.quantidade,
          cor: `var(--viz-ord-${i + 1})`
        }))}
        formatarValor={(v) => `${v} ${v === 1 ? 'OS' : 'OSs'}`}
        ariaLabel={`${titulo}: ${etapas.map((e) => `${ROTULO_ETAPA[e.situacao]} ${e.quantidade}`).join(', ')}`}
      />
    </ChartCard>
  )
}

// ---------------------------------------------------------------------
// Administrador
// ---------------------------------------------------------------------

function GraficoFluxoMensal({ meses }: { meses: FluxoMesItem[] }): ReactNode {
  const rotulos = meses.map((m) => rotulosMes(m.mes))
  const semMovimento = meses.every((m) => m.receitasCentavos === 0 && m.despesasCentavos === 0)

  return (
    <ChartCard
      titulo="Receitas e despesas"
      subtitulo={`Regime de caixa, últimos ${meses.length} meses`}
      legenda={[
        { nome: 'Receitas', cor: 'var(--viz-1)' },
        { nome: 'Despesas', cor: 'var(--viz-2)' }
      ]}
      tabela={{
        colunas: ['Mês', 'Receitas', 'Despesas'],
        linhas: [...meses]
          .reverse()
          .map((m) => [rotulosMes(m.mes).longo, centavosParaBRL(m.receitasCentavos), centavosParaBRL(m.despesasCentavos)])
      }}
      vazio={semMovimento}
      mensagemVazia={`Nenhum lançamento financeiro nos últimos ${meses.length} meses.`}
    >
      <ColumnChart
        categorias={rotulos.map((r) => r.curto)}
        titulosCategoria={rotulos.map((r) => r.longo)}
        series={[
          { nome: 'Receitas', cor: 'var(--viz-1)', valores: meses.map((m) => m.receitasCentavos) },
          { nome: 'Despesas', cor: 'var(--viz-2)', valores: meses.map((m) => m.despesasCentavos) }
        ]}
        formatarValor={centavosParaBRL}
        ariaLabel={`Receitas e despesas por mês: ${meses
          .map((m) => `${rotulosMes(m.mes).longo}, receitas ${centavosParaBRL(m.receitasCentavos)}, despesas ${centavosParaBRL(m.despesasCentavos)}`)
          .join('; ')}`}
      />
    </ChartCard>
  )
}

export function AdminGraficos({ dados }: { dados: DashboardAdmin }): ReactNode {
  const ranking = dados.rankingVendedores.slice(0, 5)

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <GraficoVendasPorDia
        titulo="Vendas nos últimos 30 dias"
        dias={dados.vendasPorDia}
        nomeSerie="Vendas"
        className="xl:col-span-2"
      />

      <GraficoFluxoMensal meses={dados.fluxoMensal} />

      <ChartCard
        titulo="Ranking de vendedores"
        icone={<Trophy className="size-4 text-[var(--warn)]" />}
        subtitulo="Total vendido no mês"
        tabela={{
          colunas: ['Vendedor', 'Total'],
          linhas: ranking.map((v, i) => [`${i + 1}. ${v.vendedorNome}`, centavosParaBRL(v.totalCentavos)])
        }}
        vazio={ranking.length === 0}
        mensagemVazia="Nenhuma venda este mês ainda."
      >
        <BarChartH
          itens={ranking.map((v, i) => ({
            id: v.vendedorId,
            rotulo: `${i + 1}. ${v.vendedorNome}`,
            valor: v.totalCentavos
          }))}
          formatarValor={centavosParaBRL}
          ariaLabel="Ranking de vendedores pelo total vendido no mês"
        />
      </ChartCard>

      <ChartCard
        titulo="Vendas por categoria"
        subtitulo="Valor dos itens vendidos no mês"
        tabela={{
          colunas: ['Categoria', 'Total'],
          linhas: dados.vendasPorCategoria.map((c) => [ROTULO_CATEGORIA[c.categoria], centavosParaBRL(c.totalCentavos)])
        }}
        vazio={dados.vendasPorCategoria.length === 0}
        mensagemVazia="Nenhuma venda este mês ainda."
      >
        <BarChartH
          itens={dados.vendasPorCategoria.map((c) => ({
            id: c.categoria,
            rotulo: ROTULO_CATEGORIA[c.categoria],
            valor: c.totalCentavos
          }))}
          formatarValor={centavosParaBRL}
          ariaLabel="Vendas do mês por categoria de produto"
        />
      </ChartCard>

      <GraficoOsPorEtapa titulo="Ordens de serviço em andamento" etapas={dados.osPorEtapa} />
    </div>
  )
}

// ---------------------------------------------------------------------
// Vendedor - so os proprios numeros (RF-14, CA3)
// ---------------------------------------------------------------------

export function VendedorGraficos({ dados }: { dados: DashboardVendedor }): ReactNode {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <GraficoVendasPorDia
        titulo="Suas vendas nos últimos 30 dias"
        dias={dados.vendasPorDia}
        nomeSerie="Suas vendas"
        className="xl:col-span-2"
      />
      <GraficoOsPorEtapa titulo="Suas ordens de serviço em andamento" etapas={dados.osPorEtapa} />
    </div>
  )
}
