import type { Empresa, EstoqueItem, MargemProduto } from '@shared/types'
import { formatarMoeda, formatarPercentual, montarFiltroPeriodo, montarRelatorioTabela, texto } from './htmlUtils'
import { LARGURA_UTIL, ROTULO_CATEGORIA, badge, type Tom } from './layout'
import { COR_CLASSE_ABC, svgPareto } from './svgCharts'

type SituacaoEstoque = 'Zerado' | 'Abaixo do mínimo' | 'Normal'

function situacao(i: EstoqueItem): SituacaoEstoque {
  return i.saldo <= 0 ? 'Zerado' : i.estoqueMinimo > 0 && i.saldo < i.estoqueMinimo ? 'Abaixo do mínimo' : 'Normal'
}

const TOM_SITUACAO: Record<SituacaoEstoque, Tom> = { Zerado: 'perigo', 'Abaixo do mínimo': 'atencao', Normal: 'ok' }

/** RF-12: usado tanto para "Posição de estoque" quanto "Produtos abaixo do mínimo" - só muda o título e os itens já filtrados. */
export function montarHtmlEstoque(titulo: string, itens: EstoqueItem[], empresa: Empresa): string {
  const contagem = { Zerado: 0, 'Abaixo do mínimo': 0, Normal: 0 }
  for (const i of itens) contagem[situacao(i)]++

  return montarRelatorioTabela({
    titulo,
    subtitulo: 'Saldo atual de cada produto comparado ao estoque mínimo.',
    empresa,
    resumo: [
      { label: 'Produtos', valor: String(itens.length) },
      { label: 'Abaixo do mínimo', valor: String(contagem['Abaixo do mínimo']), tom: contagem['Abaixo do mínimo'] ? 'atencao' : 'ok' },
      { label: 'Zerados', valor: String(contagem.Zerado), tom: contagem.Zerado ? 'perigo' : 'ok' }
    ],
    colunas: [
      { label: 'Produto' },
      { label: 'Categoria' },
      { label: 'Marca' },
      { label: 'Saldo', alinhar: 'direita' },
      { label: 'Estoque Mínimo', alinhar: 'direita' },
      { label: 'Situação' }
    ],
    linhas: itens.map((i) => [
      texto(i.descricao),
      texto(ROTULO_CATEGORIA[i.categoria] ?? i.categoria),
      texto(i.marca),
      String(i.saldo),
      String(i.estoqueMinimo),
      badge(situacao(i), TOM_SITUACAO[situacao(i)])
    ]),
    linhaVazia: 'Nenhum produto encontrado.'
  })
}

export interface CurvaAbcItem extends MargemProduto {
  percentualAcumulado: number
  classe: 'A' | 'B' | 'C'
}

/**
 * RF-12: curva ABC classica sobre a receita do periodo - ordena por receita
 * desc e classifica pelo percentual acumulado (A ate 80%, B ate 95%, C o
 * resto). A fonte dos dados (`margemPorProduto`) ja existe para o
 * Lucro/Prejuízo; aqui so falta o calculo da classificacao em si.
 */
export function calcularCurvaAbc(itens: MargemProduto[]): CurvaAbcItem[] {
  const totalReceita = itens.reduce((soma, i) => soma + i.receitaCentavos, 0)
  let acumulado = 0
  return itens
    .slice()
    .sort((a, b) => b.receitaCentavos - a.receitaCentavos)
    .map((item) => {
      acumulado += item.receitaCentavos
      const percentualAcumulado = totalReceita > 0 ? (acumulado / totalReceita) * 100 : 0
      const classe = percentualAcumulado <= 80 ? 'A' : percentualAcumulado <= 95 ? 'B' : 'C'
      return { ...item, percentualAcumulado, classe }
    })
}

/** Quantos produtos aparecem um a um no Pareto; o resto vira a barra "Demais". */
const PARETO_MAXIMO = 20

const TOM_CLASSE: Record<CurvaAbcItem['classe'], Tom> = { A: 'destaque', B: 'neutro', C: 'neutro' }

export function montarHtmlCurvaAbc(itens: CurvaAbcItem[], empresa: Empresa, periodo: { dataInicio: string; dataFim: string }): string {
  const total = itens.reduce((s, i) => s + i.receitaCentavos, 0)
  const resumoClasse = (classe: CurvaAbcItem['classe']) => {
    const daClasse = itens.filter((i) => i.classe === classe)
    const receita = daClasse.reduce((s, i) => s + i.receitaCentavos, 0)
    return {
      label: `Classe ${classe}`,
      valor: `${daClasse.length} produto(s)`,
      tom: classe === 'A' ? ('destaque' as const) : ('neutro' as const),
      detalhe: total > 0 ? `${formatarPercentual((receita / total) * 100)} da receita · ${formatarMoeda(receita)}` : undefined
    }
  }

  const primeiros = itens.slice(0, PARETO_MAXIMO)
  const demais = itens.slice(PARETO_MAXIMO)
  const participacao = (receita: number): number => (total > 0 ? (receita / total) * 100 : 0)
  const pontosPareto = primeiros.map((i, idx) => ({
    rotulo: String(idx + 1),
    participacao: participacao(i.receitaCentavos),
    acumulado: i.percentualAcumulado,
    classe: i.classe
  }))
  if (demais.length) {
    pontosPareto.push({
      rotulo: 'Demais',
      participacao: participacao(demais.reduce((s, i) => s + i.receitaCentavos, 0)),
      acumulado: 100,
      classe: 'C'
    })
  }

  return montarRelatorioTabela({
    titulo: 'Curva ABC de Produtos',
    subtitulo: 'Classe A: até 80% da receita · B: até 95% · C: o restante.',
    empresa,
    filtroTexto: montarFiltroPeriodo(periodo.dataInicio, periodo.dataFim),
    resumo: [resumoClasse('A'), resumoClasse('B'), resumoClasse('C')],
    graficos: itens.length
      ? [
          {
            titulo: `Participação na receita (os ${Math.min(PARETO_MAXIMO, itens.length)} primeiros produtos, na ordem da tabela)`,
            html: svgPareto({
              itens: pontosPareto,
              largura: LARGURA_UTIL.paisagem - 24,
              descricao: 'Curva ABC: participação de cada produto e receita acumulada'
            })
          }
        ]
      : [],
    tituloTabela: 'Produtos',
    colunas: [
      { label: '#', alinhar: 'direita' },
      { label: 'Produto' },
      { label: 'Qtd Vendida', alinhar: 'direita' },
      { label: 'Receita', alinhar: 'direita' },
      { label: '% Acumulado', alinhar: 'direita' },
      { label: 'Classe', alinhar: 'centro' }
    ],
    linhas: itens.map((i, idx) => [
      String(idx + 1),
      texto(i.descricao),
      String(i.quantidadeVendida),
      formatarMoeda(i.receitaCentavos),
      formatarPercentual(i.percentualAcumulado),
      `<span class="badge tom-${TOM_CLASSE[i.classe]}" style="background:${COR_CLASSE_ABC[i.classe]};color:${i.classe === 'C' ? '#17242a' : '#fff'}">${i.classe}</span>`
    ]),
    linhaVazia: 'Nenhuma venda no período.'
  })
}
