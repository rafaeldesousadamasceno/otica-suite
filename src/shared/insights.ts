import type { DashboardResumo, Insight, SeveridadeInsight } from './types'
import { diasEntre, variacaoPct } from './periodos'

/**
 * "Insights da Otica": avisos gerados por regras fixas (sem IA) sobre os
 * proprios numeros do painel. Cada aviso leva ao registro que o explica.
 */

export const LIMITES_INSIGHTS = {
  /** Variacao do faturamento (%) a partir da qual vira aviso, para cima ou para baixo. */
  variacaoFaturamentoPct: 15,
  /** Queda do faturamento (%) que passa de "atencao" para "critico". */
  quedaCriticaPct: 30,
  quedaTicketMedioPct: 10,
  /** Periodo minimo (dias) para dizer que um vendedor "nao vendeu". */
  diasMinimosSemVenda: 7,
  coberturaCustoMinimaPct: 70
} as const

const ORDEM: Record<SeveridadeInsight, number> = { critico: 0, atencao: 1, info: 2, positivo: 3 }
const MAXIMO_INSIGHTS = 6

const reais = (centavos: number): string => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (v: number): string => `${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`
const plural = (n: number, singular: string, pluralTxt: string): string => `${n} ${n === 1 ? singular : pluralTxt}`

export function gerarInsights(d: Omit<DashboardResumo, 'insights'>): Insight[] {
  const lista: Insight[] = []
  const { kpis, posicao } = d

  const variacaoFat = d.comparacao && kpis.faturamento.anterior !== null ? variacaoPct(kpis.faturamento.atual, kpis.faturamento.anterior) : null
  if (variacaoFat !== null && variacaoFat <= -LIMITES_INSIGHTS.variacaoFaturamentoPct) {
    lista.push({
      id: 'faturamento-queda',
      severidade: variacaoFat <= -LIMITES_INSIGHTS.quedaCriticaPct ? 'critico' : 'atencao',
      titulo: `O faturamento caiu ${pct(variacaoFat)}`,
      detalhe: `${reais(kpis.faturamento.atual)} contra ${reais(kpis.faturamento.anterior ?? 0)} no período de comparação. Veja o desempenho por vendedor e por categoria.`
    })
  } else if (variacaoFat !== null && variacaoFat >= LIMITES_INSIGHTS.variacaoFaturamentoPct) {
    lista.push({
      id: 'faturamento-alta',
      severidade: 'positivo',
      titulo: `O faturamento subiu ${pct(variacaoFat)}`,
      detalhe: `${reais(kpis.faturamento.atual)} contra ${reais(kpis.faturamento.anterior ?? 0)} no período de comparação.`
    })
  }

  const variacaoTicket =
    d.comparacao && kpis.ticketMedio.anterior !== null ? variacaoPct(kpis.ticketMedio.atual, kpis.ticketMedio.anterior) : null
  if (variacaoTicket !== null && variacaoTicket <= -LIMITES_INSIGHTS.quedaTicketMedioPct) {
    lista.push({
      id: 'ticket-queda',
      severidade: 'atencao',
      titulo: `O ticket médio caiu ${pct(variacaoTicket)}`,
      detalhe: `Cada venda rendeu em média ${reais(kpis.ticketMedio.atual)}, contra ${reais(kpis.ticketMedio.anterior ?? 0)} antes.`
    })
  }

  if (posicao.receber && posicao.receber.vencidasQtd > 0) {
    lista.push({
      id: 'receber-vencidas',
      severidade: 'atencao',
      titulo: `${plural(posicao.receber.vencidasQtd, 'parcela vencida', 'parcelas vencidas')} a receber`,
      detalhe: `${reais(posicao.receber.vencidasCentavos)} em atraso. Vale entrar em contato com os clientes.`,
      link: '/contas-receber?vencidas=1'
    })
  }

  if (posicao.pagar && posicao.pagar.vencidasQtd > 0) {
    lista.push({
      id: 'pagar-vencidas',
      severidade: 'critico',
      titulo: `${plural(posicao.pagar.vencidasQtd, 'conta a pagar vencida', 'contas a pagar vencidas')}`,
      detalhe: `${reais(posicao.pagar.vencidasCentavos)} em atraso com fornecedores e despesas.`,
      link: '/contas-pagar?vencidas=1'
    })
  }
  if (posicao.pagar && posicao.pagar.hojeQtd > 0) {
    lista.push({
      id: 'pagar-hoje',
      severidade: 'atencao',
      titulo: `${plural(posicao.pagar.hojeQtd, 'conta vence', 'contas vencem')} hoje`,
      detalhe: `${reais(posicao.pagar.hojeCentavos)} a pagar hoje.`,
      link: '/contas-pagar'
    })
  }

  if (posicao.osAtrasadas > 0) {
    lista.push({
      id: 'os-atrasadas',
      severidade: 'critico',
      titulo: `${plural(posicao.osAtrasadas, 'ordem de serviço atrasada', 'ordens de serviço atrasadas')}`,
      detalhe: 'O prazo de entrega já passou e o par ainda não chegou. Vale cobrar o laboratório.',
      link: '/ordens-servico?atrasadas=1'
    })
  }

  if (posicao.osProntasHaMuito > 0) {
    lista.push({
      id: 'os-prontas-paradas',
      severidade: 'atencao',
      titulo: `${plural(posicao.osProntasHaMuito, 'óculos pronto', 'óculos prontos')} há mais de 7 dias`,
      detalhe: 'O cliente ainda não retirou. Um aviso pelo Relacionamento costuma resolver.',
      link: '/ordens-servico?situacao=CHEGOU'
    })
  }

  if (posicao.produtosAbaixoMinimo > 0) {
    lista.push({
      id: 'estoque-baixo',
      severidade: 'atencao',
      titulo: `${plural(posicao.produtosAbaixoMinimo, 'produto abaixo', 'produtos abaixo')} do estoque mínimo`,
      detalhe: 'Verifique a necessidade de reposição.',
      link: '/estoque?situacao=abaixo_minimo'
    })
  }

  const dias = diasEntre(d.periodo.inicio, d.periodo.fim) + 1
  const semVenda = (d.ranking ?? []).filter((v) => v.quantidadeVendas === 0)
  if (d.escopo === 'loja' && dias >= LIMITES_INSIGHTS.diasMinimosSemVenda && semVenda.length > 0) {
    lista.push({
      id: 'vendedor-sem-venda',
      severidade: 'info',
      titulo: semVenda.length === 1 ? `${semVenda[0].vendedorNome} não vendeu no período` : `${semVenda.length} vendedores não venderam no período`,
      detalhe: semVenda.map((v) => v.vendedorNome).join(', ')
    })
  }

  if (d.coberturaCustoPct !== null && d.coberturaCustoPct < LIMITES_INSIGHTS.coberturaCustoMinimaPct) {
    lista.push({
      id: 'custo-incompleto',
      severidade: 'info',
      titulo: 'A margem considera só parte das vendas',
      detalhe: `Só ${pct(d.coberturaCustoPct)} da receita tem custo cadastrado. Cadastre o custo dos produtos para o lucro bruto ficar mais fiel.`
    })
  }

  return lista.sort((a, b) => ORDEM[a.severidade] - ORDEM[b.severidade]).slice(0, MAXIMO_INSIGHTS)
}
