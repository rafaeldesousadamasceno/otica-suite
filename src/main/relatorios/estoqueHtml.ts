import type { Empresa, EstoqueItem, MargemProduto } from '@shared/types'
import { formatarMoeda, montarRelatorioTabela, texto } from './htmlUtils'

/** RF-12: usado tanto para "Posição de estoque" quanto "Produtos abaixo do mínimo" - só muda o título e os itens já filtrados. */
export function montarHtmlEstoque(titulo: string, itens: EstoqueItem[], empresa: Empresa): string {
  return montarRelatorioTabela({
    titulo,
    empresa,
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
      texto(i.categoria),
      texto(i.marca),
      String(i.saldo),
      String(i.estoqueMinimo),
      i.saldo <= 0 ? 'Zerado' : i.estoqueMinimo > 0 && i.saldo < i.estoqueMinimo ? 'Abaixo do mínimo' : 'Normal'
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

export function montarHtmlCurvaAbc(itens: CurvaAbcItem[], empresa: Empresa, periodo: { dataInicio: string; dataFim: string }): string {
  return montarRelatorioTabela({
    titulo: 'Curva ABC de Produtos',
    empresa,
    filtroTexto: `Período: ${periodo.dataInicio.split('-').reverse().join('/')} a ${periodo.dataFim.split('-').reverse().join('/')}`,
    colunas: [
      { label: 'Produto' },
      { label: 'Qtd Vendida', alinhar: 'direita' },
      { label: 'Receita', alinhar: 'direita' },
      { label: '% Acumulado', alinhar: 'direita' },
      { label: 'Classe', alinhar: 'centro' }
    ],
    linhas: itens.map((i) => [
      texto(i.descricao),
      String(i.quantidadeVendida),
      formatarMoeda(i.receitaCentavos),
      `${i.percentualAcumulado.toFixed(1)}%`,
      i.classe
    ]),
    linhaVazia: 'Nenhuma venda no período.'
  })
}
