import type { ContaReceber, Empresa, FluxoCaixaResultado, LucroPrejuizoResultado } from '@shared/types'
import { formatarDataBr, formatarMoeda, montarFiltroPeriodo, montarRelatorioTabela, texto } from './htmlUtils'

/** RF-12: "Receitas e despesas" - lista simples dos lancamentos do periodo (preserva `Receitas_Despesas.jasper`). */
export function montarHtmlReceitasDespesas(
  resultado: FluxoCaixaResultado,
  empresa: Empresa,
  periodo: { dataInicio: string; dataFim: string }
): string {
  return montarRelatorioTabela({
    titulo: 'Receitas e Despesas',
    empresa,
    filtroTexto: montarFiltroPeriodo(periodo.dataInicio, periodo.dataFim),
    resumo: [
      { label: 'Total Receitas', valor: formatarMoeda(resultado.totalReceitasCentavos) },
      { label: 'Total Despesas', valor: formatarMoeda(resultado.totalDespesasCentavos) },
      { label: 'Saldo', valor: formatarMoeda(resultado.saldoCentavos) }
    ],
    colunas: [
      { label: 'Data' },
      { label: 'Tipo' },
      { label: 'Categoria' },
      { label: 'Descrição' },
      { label: 'Valor', alinhar: 'direita' }
    ],
    linhas: resultado.lancamentos.map((l) => [
      formatarDataBr(l.data),
      texto(l.tipo),
      texto(l.categoria),
      texto(l.descricao),
      formatarMoeda(l.valorCentavos)
    ])
  })
}

/** RF-12: "Fluxo de caixa" - mesmos lancamentos, com destaque para o saldo acumulado do periodo. */
export function montarHtmlFluxoCaixa(
  resultado: FluxoCaixaResultado,
  empresa: Empresa,
  periodo: { dataInicio: string; dataFim: string }
): string {
  let acumulado = 0
  const linhas = resultado.lancamentos.map((l) => {
    acumulado += l.tipo === 'RECEITA' ? l.valorCentavos : -l.valorCentavos
    return [formatarDataBr(l.data), texto(l.tipo), texto(l.descricao), formatarMoeda(l.valorCentavos), formatarMoeda(acumulado)]
  })

  return montarRelatorioTabela({
    titulo: 'Fluxo de Caixa',
    empresa,
    filtroTexto: montarFiltroPeriodo(periodo.dataInicio, periodo.dataFim),
    resumo: [
      { label: 'Total Receitas', valor: formatarMoeda(resultado.totalReceitasCentavos) },
      { label: 'Total Despesas', valor: formatarMoeda(resultado.totalDespesasCentavos) },
      { label: 'Saldo do Período', valor: formatarMoeda(resultado.saldoCentavos) }
    ],
    colunas: [
      { label: 'Data' },
      { label: 'Tipo' },
      { label: 'Descrição' },
      { label: 'Valor', alinhar: 'direita' },
      { label: 'Saldo Acumulado', alinhar: 'direita' }
    ],
    linhas
  })
}

/** RF-12: "Lucro / Prejuízo" - os dois regimes (RN-12) lado a lado, mais margem por produto. */
export function montarHtmlLucroPrejuizo(
  resultado: LucroPrejuizoResultado,
  empresa: Empresa,
  periodo: { dataInicio: string; dataFim: string }
): string {
  return montarRelatorioTabela({
    titulo: 'Lucro / Prejuízo',
    empresa,
    filtroTexto: montarFiltroPeriodo(periodo.dataInicio, periodo.dataFim),
    resumo: [
      { label: 'Resultado (Caixa)', valor: formatarMoeda(resultado.caixa.resultadoCentavos) },
      { label: 'Resultado (Competência)', valor: formatarMoeda(resultado.competencia.resultadoCentavos) }
    ],
    colunas: [{ label: 'Produto' }, { label: 'Qtd', alinhar: 'direita' }, { label: 'Receita', alinhar: 'direita' }, { label: 'Custo', alinhar: 'direita' }, { label: 'Margem', alinhar: 'direita' }],
    linhas: resultado.margemPorProduto.map((m) => [
      texto(m.descricao),
      texto(m.quantidadeVendida),
      formatarMoeda(m.receitaCentavos),
      formatarMoeda(m.custoCentavos),
      formatarMoeda(m.margemCentavos)
    ]),
    linhaVazia: 'Nenhuma venda no período.',
    rodapeTexto: `Receitas caixa: ${formatarMoeda(resultado.caixa.receitasCentavos)} · Despesas caixa: ${formatarMoeda(resultado.caixa.despesasCentavos)} · Receitas competência: ${formatarMoeda(resultado.competencia.receitasCentavos)} · Despesas competência: ${formatarMoeda(resultado.competencia.despesasCentavos)}`
  })
}

/** RF-12: "Inadimplência" - parcelas vencidas e ainda em aberto. */
export function montarHtmlInadimplencia(parcelas: ContaReceber[], empresa: Empresa): string {
  const totalCentavos = parcelas.reduce((soma, p) => soma + (p.valorCentavos - p.valorRecebidoCentavos), 0)

  return montarRelatorioTabela({
    titulo: 'Inadimplência',
    empresa,
    resumo: [
      { label: 'Parcelas vencidas', valor: String(parcelas.length) },
      { label: 'Total em aberto', valor: formatarMoeda(totalCentavos) }
    ],
    colunas: [
      { label: 'Cliente' },
      { label: 'Venda' },
      { label: 'Vendedor' },
      { label: 'Parcela' },
      { label: 'Vencimento' },
      { label: 'Valor', alinhar: 'direita' }
    ],
    linhas: parcelas.map((p) => [
      texto(p.clienteNome),
      texto(p.vendaNumero),
      texto(p.vendedorNome),
      `${p.parcela}/${p.totalParcelas}`,
      formatarDataBr(p.vencimento),
      formatarMoeda(p.valorCentavos - p.valorRecebidoCentavos)
    ]),
    linhaVazia: 'Nenhuma parcela vencida.'
  })
}
