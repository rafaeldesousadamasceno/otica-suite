import { dashboardRepository } from '@main/repositories/dashboardRepository'
import { recorrenciaService } from '@main/services/recorrenciaService'
import { requireSessao } from '@main/auth/session'
import { possuiPermissao } from '@shared/permissions'
import { gerarInsights } from '@shared/insights'
import { agruparPorBalde, gerarBaldes, granularidadePara, periodoComparacao, type Periodo } from '@shared/periodos'
import type { DashboardQuery } from '@shared/ipc'
import type { DashboardFinanceiro, DashboardResumo, Perfil, ValorComparado } from '@shared/types'

/** Valor do periodo e do periodo de comparacao (que pode nao existir). */
function comparado(atual: number, anterior: number | null): ValorComparado {
  return { atual, anterior }
}

function ticket(total: number, quantidade: number): number {
  return quantidade > 0 ? Math.round(total / quantidade) : 0
}

/** Quem pede o painel e se o calculo pode escrever no banco (a tela completa as recorrencias; o worker de envio nao). */
export interface ContextoDashboard {
  perfil: Perfil
  usuarioId: number
  completarRecorrencias: boolean
}

export function calcularResumo(query: DashboardQuery, ctx: ContextoDashboard): DashboardResumo {
  const perfil = ctx.perfil
  const gerencial = possuiPermissao(perfil, 'relatorios_gerenciais', 'ver')
  const vendedorId = gerencial ? (query.vendedorId ?? null) : ctx.usuarioId

  const periodo: Periodo = { inicio: query.dataInicio, fim: query.dataFim }
  const anterior: Periodo | null = query.comparar ? periodoComparacao(periodo, query.preset) : null
  const granularidade = granularidadePara(periodo)
  const baldes = gerarBaldes(periodo, granularidade)
  const baldesAnterior = anterior ? gerarBaldes(anterior, granularidade) : null

  const repo = dashboardRepository
  const vendas = repo.resumoVendas(periodo, vendedorId)
  const vendasAnt = anterior ? repo.resumoVendas(anterior, vendedorId) : null
  const clientes = repo.clientes(periodo, vendedorId)
  const clientesAnt = anterior ? repo.clientes(anterior, vendedorId) : null

  const comAnterior = <T>(fn: (p: Periodo) => T): T | null => (anterior ? fn(anterior) : null)

  // Lucro bruto: so para quem pode ver custo e margem.
  const podeVerCusto = possuiPermissao(perfil, 'produtos.custo_margem', 'ver')
  const lucro = repo.lucroBruto(periodo, vendedorId)
  const lucroAnt = podeVerCusto ? comAnterior((p) => repo.lucroBruto(p, vendedorId)) : null
  const margem = (l: { receitaComCustoCentavos: number; lucroCentavos: number }): number | null =>
    l.receitaComCustoCentavos > 0 ? (l.lucroCentavos / l.receitaComCustoCentavos) * 100 : null
  const margemAtual = margem(lucro)
  const margemAnt = lucroAnt ? margem(lucroAnt) : null
  const coberturaCustoPct = podeVerCusto && lucro.receitaItensCentavos > 0 ? (lucro.receitaComCustoCentavos / lucro.receitaItensCentavos) * 100 : null

  // Financeiro: caixa da loja toda. Com o painel filtrado por vendedor nao faz sentido, entao some.
  const podeVerFinanceiro = possuiPermissao(perfil, 'financeiro_caixa', 'ver') && vendedorId === null
  let financeiro: DashboardFinanceiro | null = null
  if (podeVerFinanceiro) {
    const caixa = repo.caixa(periodo)
    const caixaAnt = comAnterior((p) => repo.caixa(p))
    const diario = repo.caixaDiario(periodo)
    const resultado = caixa.recebidoCentavos - caixa.despesasCentavos
    financeiro = {
      recebido: comparado(caixa.recebidoCentavos, caixaAnt?.recebidoCentavos ?? null),
      despesas: comparado(caixa.despesasCentavos, caixaAnt?.despesasCentavos ?? null),
      resultado: comparado(resultado, caixaAnt ? caixaAnt.recebidoCentavos - caixaAnt.despesasCentavos : null),
      recebidoPorBalde: agruparPorBalde(diario.map((d) => ({ data: d.data, valor: d.recebidoCentavos })), baldes),
      despesasPorBalde: agruparPorBalde(diario.map((d) => ({ data: d.data, valor: d.despesasCentavos })), baldes)
    }
  }

  const podeVerEquipe = gerencial && vendedorId === null
  const podeVerPagar = possuiPermissao(perfil, 'contas_pagar', 'ver') && vendedorId === null
  // As contas dos meses de hoje em diante precisam existir mesmo que ninguem abra Contas a Pagar.
  if (podeVerPagar && ctx.completarRecorrencias) recorrenciaService.completarHorizonte()

  const semInsights: Omit<DashboardResumo, 'insights'> = {
    escopo: vendedorId === null ? 'loja' : 'vendedor',
    periodo,
    comparacao: anterior,
    granularidade,
    kpis: {
      faturamento: comparado(vendas.totalCentavos, vendasAnt?.totalCentavos ?? null),
      vendas: comparado(vendas.quantidade, vendasAnt?.quantidade ?? null),
      ticketMedio: comparado(
        ticket(vendas.totalCentavos, vendas.quantidade),
        vendasAnt ? ticket(vendasAnt.totalCentavos, vendasAnt.quantidade) : null
      ),
      lucroBruto: podeVerCusto ? comparado(lucro.lucroCentavos, lucroAnt?.lucroCentavos ?? null) : null,
      margemPct: podeVerCusto && margemAtual !== null ? comparado(margemAtual, margemAnt) : null,
      clientesNovos: comparado(clientes.novos, clientesAnt?.novos ?? null),
      clientesRecorrentes: comparado(clientes.recorrentes, clientesAnt?.recorrentes ?? null),
      comissao:
        vendedorId !== null
          ? comparado(repo.comissao(periodo, vendedorId), anterior ? repo.comissao(anterior, vendedorId) : null)
          : null
    },
    coberturaCustoPct,
    serie: {
      baldes: baldes.map((b) => ({ rotulo: b.rotulo, titulo: b.titulo })),
      faturamento: agruparPorBalde(repo.faturamentoDiario(periodo, vendedorId).map((d) => ({ data: d.data, valor: d.valor })), baldes),
      comparacao:
        anterior && baldesAnterior
          ? agruparPorBalde(repo.faturamentoDiario(anterior, vendedorId).map((d) => ({ data: d.data, valor: d.valor })), baldesAnterior)
          : null
    },
    categorias: repo.categorias(periodo, vendedorId, vendas.totalCentavos),
    topProdutos: repo.topProdutos(periodo, vendedorId).map((p) => (podeVerCusto ? p : { ...p, margemCentavos: null })),
    formasPagamento: repo.formasPagamento(periodo, vendedorId),
    ranking: podeVerEquipe ? repo.ranking(periodo) : null,
    os: repo.os(periodo, vendedorId),
    financeiro,
    posicao: repo.posicao(vendedorId, podeVerPagar)
  }

  return { ...semInsights, insights: gerarInsights(semInsights) }
}

/**
 * RF-14: o painel obedece as permissoes de cada pessoa. Quem nao pode ver o
 * desempenho da equipe (`relatorios_gerenciais`) enxerga so as proprias
 * vendas, seja qual for o filtro que o renderer mandar; as secoes de
 * financeiro, custo/margem e ranking so vem preenchidas para quem tem a
 * permissao correspondente.
 */
export const dashboardService = {
  obter(query: DashboardQuery): DashboardResumo {
    const sessao = requireSessao()
    return calcularResumo(query, { perfil: sessao.usuario.perfil, usuarioId: sessao.usuario.id, completarRecorrencias: true })
  }
}
