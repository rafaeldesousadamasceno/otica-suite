import type { Empresa } from '@shared/types'
import {
  graficos as blocoGraficos,
  montarDocumento,
  resumoCards,
  rodape,
  secao,
  tabela,
  type ColunaTabela,
  type GraficoRelatorio,
  type Orientacao,
  type ResumoCard
} from './layout'

/**
 * RF-12: ponto de entrada dos relatorios tabulares. A formatacao mora em
 * `formatacao.ts` e o visual em `layout.ts`; este arquivo junta os dois no
 * formato que a maioria dos relatorios usa (resumo, graficos e uma tabela).
 */
export {
  escapeHtml,
  formatarContatos,
  formatarDataBr,
  formatarEndereco,
  formatarMoeda,
  formatarPercentual,
  montarFiltroPeriodo,
  texto
} from './formatacao'

export type ColunaRelatorio = ColunaTabela
export type { ResumoCard }

interface MontarRelatorioTabelaInput {
  titulo: string
  subtitulo?: string
  empresa: Empresa
  orientacao?: Orientacao
  filtroTexto?: string
  resumo?: ResumoCard[]
  graficos?: GraficoRelatorio[]
  /** Dois graficos lado a lado (padrao: um por linha). */
  graficosLadoALado?: boolean
  /** Titulo da secao da tabela (padrao: sem titulo de secao). */
  tituloTabela?: string
  colunas: ColunaRelatorio[]
  /** Cada linha ja vem pronta em HTML (usar `texto`/`formatarMoeda` antes de montar). */
  linhas: string[][]
  linhaVazia?: string
  rodapeTexto?: string
  /** Linha de totais opcional, no mesmo formato de `linhas`. */
  totais?: string[]
}

/**
 * Relatorio tabular generico: cabecalho da otica, titulo com o filtro,
 * cards de resumo, graficos opcionais e a tabela. Cobre a maioria dos
 * relatorios do RF-12 (os documentos - OS, comprovante, carne, protocolo -
 * montam o proprio miolo com os blocos de `layout.ts`).
 */
export function montarRelatorioTabela(input: MontarRelatorioTabelaInput): string {
  const tabelaHtml = tabela({ colunas: input.colunas, linhas: input.linhas, totais: input.totais, vazio: input.linhaVazia })

  const corpo = [
    resumoCards(input.resumo ?? []),
    blocoGraficos(input.graficos ?? [], input.graficosLadoALado ? 2 : 1),
    input.tituloTabela ? secao(input.tituloTabela, tabelaHtml) : tabelaHtml,
    rodape(`Total de registros: ${input.linhas.length}`, input.rodapeTexto)
  ].join('\n')

  return montarDocumento({
    titulo: input.titulo,
    subtitulo: input.subtitulo,
    chips: input.filtroTexto ? [input.filtroTexto] : [],
    empresa: input.empresa,
    orientacao: input.orientacao ?? 'paisagem',
    corpo
  })
}
