import type { Empresa, RankingVendedorItem } from '@shared/types'
import type { ComissaoRelatorioItem, VendasPorVendedorItem } from '@main/repositories/relatorioRepository'
import { PALETA_VIZ } from '@shared/graficos'
import { formatarDataBr, formatarMoeda, formatarPercentual, montarFiltroPeriodo, montarRelatorioTabela, texto } from './htmlUtils'
import { LARGURA_UTIL, badge, type Tom } from './layout'
import { svgBarrasH } from './svgCharts'

type Periodo = { dataInicio: string; dataFim: string }

const LARGURA_GRAFICO = LARGURA_UTIL.paisagem - 24

export function montarHtmlVendasPorVendedor(itens: VendasPorVendedorItem[], empresa: Empresa, periodo: Periodo): string {
  const totalVendas = itens.reduce((s, i) => s + i.quantidadeVendas, 0)
  const totalCentavos = itens.reduce((s, i) => s + i.totalCentavos, 0)

  return montarRelatorioTabela({
    titulo: 'Vendas por Vendedor',
    subtitulo: 'Quantidade de vendas e valor vendido por vendedor (vendas canceladas fora).',
    empresa,
    filtroTexto: montarFiltroPeriodo(periodo.dataInicio, periodo.dataFim),
    resumo: [
      { label: 'Total de vendas', valor: String(totalVendas) },
      { label: 'Valor total', valor: formatarMoeda(totalCentavos), tom: 'destaque' },
      { label: 'Ticket médio', valor: totalVendas > 0 ? formatarMoeda(Math.round(totalCentavos / totalVendas)) : '—' }
    ],
    graficos: itens.length
      ? [
          {
            titulo: 'Total vendido por vendedor',
            html: svgBarrasH({
              itens: [...itens]
                .sort((a, b) => b.totalCentavos - a.totalCentavos)
                .map((i) => ({ rotulo: i.vendedorNome, valor: i.totalCentavos, cor: PALETA_VIZ.categorica[0] })),
              formatarValor: formatarMoeda,
              largura: LARGURA_GRAFICO,
              descricao: 'Total vendido por vendedor no período'
            })
          }
        ]
      : [],
    colunas: [
      { label: 'Vendedor' },
      { label: 'Qtd Vendas', alinhar: 'direita' },
      { label: 'Ticket Médio', alinhar: 'direita' },
      { label: 'Participação', alinhar: 'direita' },
      { label: 'Total Vendido', alinhar: 'direita' }
    ],
    linhas: itens.map((i) => [
      texto(i.vendedorNome),
      String(i.quantidadeVendas),
      i.quantidadeVendas > 0 ? formatarMoeda(Math.round(i.totalCentavos / i.quantidadeVendas)) : '—',
      totalCentavos > 0 ? formatarPercentual((i.totalCentavos / totalCentavos) * 100) : '—',
      formatarMoeda(i.totalCentavos)
    ]),
    totais: itens.length ? ['Total', String(totalVendas), '', '', formatarMoeda(totalCentavos)] : undefined,
    linhaVazia: 'Nenhuma venda no período.'
  })
}

export function montarHtmlRankingVendedores(itens: RankingVendedorItem[], empresa: Empresa, periodo: Periodo): string {
  return montarRelatorioTabela({
    titulo: 'Ranking de Vendedores',
    subtitulo: 'Vendedores ordenados pelo total vendido no período.',
    empresa,
    filtroTexto: montarFiltroPeriodo(periodo.dataInicio, periodo.dataFim),
    graficos: itens.length
      ? [
          {
            titulo: 'Total vendido',
            html: svgBarrasH({
              itens: itens.map((i, idx) => ({ rotulo: `${idx + 1}º ${i.vendedorNome}`, valor: i.totalCentavos, cor: PALETA_VIZ.categorica[0] })),
              formatarValor: formatarMoeda,
              largura: LARGURA_GRAFICO,
              descricao: 'Ranking de vendedores pelo total vendido'
            })
          }
        ]
      : [],
    colunas: [{ label: 'Posição', alinhar: 'centro' }, { label: 'Vendedor' }, { label: 'Total Vendido', alinhar: 'direita' }],
    linhas: itens.map((i, idx) => [`${idx + 1}º`, texto(i.vendedorNome), formatarMoeda(i.totalCentavos)]),
    linhaVazia: 'Nenhuma venda no período.'
  })
}

const ROTULO_SITUACAO: Record<ComissaoRelatorioItem['situacao'], string> = {
  PROVISIONADA: 'Provisionada',
  LIBERADA: 'Liberada',
  CANCELADA: 'Cancelada'
}

const TOM_SITUACAO: Record<ComissaoRelatorioItem['situacao'], Tom> = {
  PROVISIONADA: 'atencao',
  LIBERADA: 'ok',
  CANCELADA: 'neutro'
}

export function montarHtmlComissoes(itens: ComissaoRelatorioItem[], empresa: Empresa, periodo: Periodo): string {
  const soma = (situacao: ComissaoRelatorioItem['situacao']): number =>
    itens.filter((i) => i.situacao === situacao).reduce((s, i) => s + i.valorCentavos, 0)
  const totalCentavos = soma('PROVISIONADA') + soma('LIBERADA')

  return montarRelatorioTabela({
    titulo: 'Comissões',
    subtitulo: 'Liberada: a venda já foi quitada. Provisionada: ainda há parcelas em aberto.',
    empresa,
    filtroTexto: montarFiltroPeriodo(periodo.dataInicio, periodo.dataFim),
    resumo: [
      { label: 'Total (não canceladas)', valor: formatarMoeda(totalCentavos), tom: 'destaque' },
      { label: 'Liberadas', valor: formatarMoeda(soma('LIBERADA')), tom: 'ok' },
      { label: 'Provisionadas', valor: formatarMoeda(soma('PROVISIONADA')), tom: 'atencao' },
      { label: 'Canceladas', valor: formatarMoeda(soma('CANCELADA')) }
    ],
    colunas: [
      { label: 'Venda' },
      { label: 'Vendedor' },
      { label: 'Data' },
      { label: 'Base', alinhar: 'direita' },
      { label: '%', alinhar: 'direita' },
      { label: 'Valor', alinhar: 'direita' },
      { label: 'Situação' }
    ],
    linhas: itens.map((i) => [
      texto(i.vendaNumero),
      texto(i.vendedorNome),
      formatarDataBr(i.data),
      formatarMoeda(i.baseCentavos),
      `${i.percentual}%`,
      formatarMoeda(i.valorCentavos),
      badge(ROTULO_SITUACAO[i.situacao], TOM_SITUACAO[i.situacao])
    ]),
    linhaVazia: 'Nenhuma comissão no período.'
  })
}
