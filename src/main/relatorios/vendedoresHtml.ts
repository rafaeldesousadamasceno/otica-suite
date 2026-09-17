import type { Empresa, RankingVendedorItem } from '@shared/types'
import type { ComissaoRelatorioItem, VendasPorVendedorItem } from '@main/repositories/relatorioRepository'
import { formatarDataBr, formatarMoeda, montarFiltroPeriodo, montarRelatorioTabela, texto } from './htmlUtils'

export function montarHtmlVendasPorVendedor(
  itens: VendasPorVendedorItem[],
  empresa: Empresa,
  periodo: { dataInicio: string; dataFim: string }
): string {
  const totalVendas = itens.reduce((s, i) => s + i.quantidadeVendas, 0)
  const totalCentavos = itens.reduce((s, i) => s + i.totalCentavos, 0)

  return montarRelatorioTabela({
    titulo: 'Vendas por Vendedor',
    empresa,
    filtroTexto: montarFiltroPeriodo(periodo.dataInicio, periodo.dataFim),
    resumo: [
      { label: 'Total de vendas', valor: String(totalVendas) },
      { label: 'Valor total', valor: formatarMoeda(totalCentavos) }
    ],
    colunas: [{ label: 'Vendedor' }, { label: 'Qtd Vendas', alinhar: 'direita' }, { label: 'Total Vendido', alinhar: 'direita' }],
    linhas: itens.map((i) => [texto(i.vendedorNome), String(i.quantidadeVendas), formatarMoeda(i.totalCentavos)]),
    linhaVazia: 'Nenhuma venda no período.'
  })
}

export function montarHtmlRankingVendedores(
  itens: RankingVendedorItem[],
  empresa: Empresa,
  periodo: { dataInicio: string; dataFim: string }
): string {
  return montarRelatorioTabela({
    titulo: 'Ranking de Vendedores',
    empresa,
    filtroTexto: montarFiltroPeriodo(periodo.dataInicio, periodo.dataFim),
    colunas: [{ label: 'Posição', alinhar: 'centro' }, { label: 'Vendedor' }, { label: 'Total Vendido', alinhar: 'direita' }],
    linhas: itens.map((i, idx) => [String(idx + 1), texto(i.vendedorNome), formatarMoeda(i.totalCentavos)]),
    linhaVazia: 'Nenhuma venda no período.'
  })
}

const ROTULO_SITUACAO: Record<ComissaoRelatorioItem['situacao'], string> = {
  PROVISIONADA: 'Provisionada',
  LIBERADA: 'Liberada',
  CANCELADA: 'Cancelada'
}

export function montarHtmlComissoes(
  itens: ComissaoRelatorioItem[],
  empresa: Empresa,
  periodo: { dataInicio: string; dataFim: string }
): string {
  const totalCentavos = itens.filter((i) => i.situacao !== 'CANCELADA').reduce((s, i) => s + i.valorCentavos, 0)

  return montarRelatorioTabela({
    titulo: 'Comissões',
    empresa,
    filtroTexto: montarFiltroPeriodo(periodo.dataInicio, periodo.dataFim),
    resumo: [{ label: 'Total (não canceladas)', valor: formatarMoeda(totalCentavos) }],
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
      ROTULO_SITUACAO[i.situacao]
    ]),
    linhaVazia: 'Nenhuma comissão no período.'
  })
}
