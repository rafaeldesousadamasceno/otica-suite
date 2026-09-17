import { financeiroRepository } from '@main/repositories/financeiroRepository'
import { requirePermissao } from '@main/auth/session'
import type { FluxoCaixaResultado, LucroPrejuizoResultado } from '@shared/types'
import type { PeriodoQuery } from '@shared/ipc'

/** RF-11.3/RF-11.4: caixa e lucro/prejuizo sao exclusivos do Administrador. */
export const financeiroService = {
  fluxoCaixa(query: PeriodoQuery): FluxoCaixaResultado {
    requirePermissao('financeiro_caixa', 'ver')
    const { dataInicio, dataFim } = query

    const totalReceitasCentavos = financeiroRepository.somaLancamentoPorTipo(dataInicio, dataFim, 'RECEITA')
    const totalDespesasCentavos = financeiroRepository.somaLancamentoPorTipo(dataInicio, dataFim, 'DESPESA')

    return {
      totalReceitasCentavos,
      totalDespesasCentavos,
      saldoCentavos: totalReceitasCentavos - totalDespesasCentavos,
      lancamentos: financeiroRepository.listarLancamentos(dataInicio, dataFim)
    }
  },

  /** RN-12: duas visoes do mesmo periodo - ver os comentarios em financeiroRepository.ts para a definicao exata de cada regime. */
  lucroPrejuizo(query: PeriodoQuery): LucroPrejuizoResultado {
    requirePermissao('financeiro_caixa', 'ver')
    const { dataInicio, dataFim } = query

    const receitasCaixa = financeiroRepository.somaLancamentoPorTipo(dataInicio, dataFim, 'RECEITA')
    const despesasCaixa = financeiroRepository.somaLancamentoPorTipo(dataInicio, dataFim, 'DESPESA')

    const receitasCompetencia = financeiroRepository.receitaVendasPorPeriodo(dataInicio, dataFim)
    const despesasCompetencia = financeiroRepository.despesaContasPagarPorPeriodo(dataInicio, dataFim)

    return {
      caixa: {
        receitasCentavos: receitasCaixa,
        despesasCentavos: despesasCaixa,
        resultadoCentavos: receitasCaixa - despesasCaixa,
        despesasPorCategoria: financeiroRepository.despesasLancamentoPorCategoria(dataInicio, dataFim)
      },
      competencia: {
        receitasCentavos: receitasCompetencia,
        despesasCentavos: despesasCompetencia,
        resultadoCentavos: receitasCompetencia - despesasCompetencia,
        despesasPorCategoria: financeiroRepository.despesasContasPagarPorCategoria(dataInicio, dataFim)
      },
      margemPorProduto: financeiroRepository.margemPorProduto(dataInicio, dataFim)
    }
  }
}
