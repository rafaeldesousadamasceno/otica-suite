import { describe, expect, it } from 'vitest'
import { gerarInsights } from './insights'
import type { DashboardResumo } from './types'

type Entrada = Omit<DashboardResumo, 'insights'>

function painel(parcial: Partial<Entrada> = {}): Entrada {
  return {
    escopo: 'loja',
    periodo: { inicio: '2026-11-01', fim: '2026-11-07' },
    comparacao: { inicio: '2026-10-01', fim: '2026-10-07' },
    granularidade: 'dia',
    kpis: {
      faturamento: { atual: 10000, anterior: 10000 },
      vendas: { atual: 2, anterior: 2 },
      ticketMedio: { atual: 5000, anterior: 5000 },
      lucroBruto: null,
      margemPct: null,
      clientesNovos: { atual: 0, anterior: 0 },
      clientesRecorrentes: { atual: 0, anterior: 0 },
      comissao: null
    },
    coberturaCustoPct: null,
    serie: { baldes: [], faturamento: [], comparacao: null },
    categorias: [],
    topProdutos: [],
    formasPagamento: [],
    ranking: null,
    os: { porEtapa: [], abertasNoPeriodo: 0, entreguesNoPeriodo: 0, diasMediosAteEntrega: null },
    financeiro: null,
    posicao: {
      produtosAbaixoMinimo: 0,
      osAtrasadas: 0,
      osProntas: 0,
      osProntasHaMuito: 0,
      aniversariantesSemana: 0,
      receber: null,
      pagar: null
    },
    ...parcial
  }
}

const ids = (d: Entrada): string[] => gerarInsights(d).map((i) => i.id)

describe('gerarInsights', () => {
  it('sem nada fora do normal, nao ha aviso', () => {
    expect(gerarInsights(painel())).toEqual([])
  })

  it('queda de faturamento: atencao a partir de 15%, critico a partir de 30%', () => {
    const queda = (atual: number) => painel({ kpis: { ...painel().kpis, faturamento: { atual, anterior: 10000 } } })
    expect(ids(queda(9000))).toEqual([]) // -10%: dentro do normal
    expect(gerarInsights(queda(8000))[0]).toMatchObject({ id: 'faturamento-queda', severidade: 'atencao', titulo: 'O faturamento caiu 20%' })
    expect(gerarInsights(queda(6000))[0].severidade).toBe('critico')
  })

  it('alta de faturamento e positiva; sem comparacao nao ha aviso de variacao', () => {
    const alta = painel({ kpis: { ...painel().kpis, faturamento: { atual: 13000, anterior: 10000 } } })
    expect(gerarInsights(alta)[0]).toMatchObject({ id: 'faturamento-alta', severidade: 'positivo' })
    const semComparar = painel({ comparacao: null, kpis: { ...painel().kpis, faturamento: { atual: 1, anterior: null } } })
    expect(ids(semComparar)).toEqual([])
  })

  it('base de comparacao zerada nao gera aviso de variacao', () => {
    expect(ids(painel({ kpis: { ...painel().kpis, faturamento: { atual: 5000, anterior: 0 } } }))).toEqual([])
  })

  it('queda do ticket medio', () => {
    const d = painel({ kpis: { ...painel().kpis, ticketMedio: { atual: 4000, anterior: 5000 } } })
    expect(ids(d)).toEqual(['ticket-queda'])
  })

  it('contas vencidas, contas do dia e OS levam ao registro certo', () => {
    const d = painel({
      posicao: {
        ...painel().posicao,
        receber: { abertoCentavos: 9000, abertoQtd: 3, vencidasCentavos: 4000, vencidasQtd: 2 },
        pagar: { vencidasCentavos: 8000, vencidasQtd: 1, hojeCentavos: 1200, hojeQtd: 1 },
        osAtrasadas: 3,
        osProntasHaMuito: 1,
        produtosAbaixoMinimo: 4
      }
    })
    const porId = Object.fromEntries(gerarInsights(d).map((i) => [i.id, i.link]))
    expect(porId['receber-vencidas']).toBe('/contas-receber?vencidas=1')
    expect(porId['pagar-vencidas']).toBe('/contas-pagar?vencidas=1')
    expect(porId['os-atrasadas']).toBe('/ordens-servico?atrasadas=1')
    expect(porId['os-prontas-paradas']).toBe('/ordens-servico?situacao=CHEGOU')
    expect(porId['estoque-baixo']).toBe('/estoque?situacao=abaixo_minimo')
  })

  it('ordena por gravidade e mostra no maximo 6', () => {
    const d = painel({
      kpis: { ...painel().kpis, faturamento: { atual: 5000, anterior: 10000 }, ticketMedio: { atual: 1000, anterior: 5000 } },
      coberturaCustoPct: 40,
      posicao: {
        ...painel().posicao,
        receber: { abertoCentavos: 1, abertoQtd: 1, vencidasCentavos: 1, vencidasQtd: 1 },
        pagar: { vencidasCentavos: 1, vencidasQtd: 1, hojeCentavos: 1, hojeQtd: 1 },
        osAtrasadas: 1,
        osProntasHaMuito: 1,
        produtosAbaixoMinimo: 1
      }
    })
    const lista = gerarInsights(d)
    expect(lista).toHaveLength(6)
    const ordem = { critico: 0, atencao: 1, info: 2, positivo: 3 }
    const sev = lista.map((i) => ordem[i.severidade])
    expect(sev).toEqual([...sev].sort((a, b) => a - b))
    expect(lista[0].severidade).toBe('critico')
  })

  it('vendedor sem venda so aparece em periodo de 7 dias ou mais, e so no painel da loja', () => {
    const ranking = [
      { vendedorId: 2, vendedorNome: 'Beto', quantidadeVendas: 3, totalCentavos: 100 },
      { vendedorId: 4, vendedorNome: 'Davi', quantidadeVendas: 0, totalCentavos: 0 }
    ]
    expect(gerarInsights(painel({ ranking }))[0]).toMatchObject({ id: 'vendedor-sem-venda', titulo: 'Davi não vendeu no período' })
    expect(ids(painel({ ranking, periodo: { inicio: '2026-11-07', fim: '2026-11-07' } }))).toEqual([])
    expect(ids(painel({ ranking, escopo: 'vendedor' }))).toEqual([])
  })

  it('custo cadastrado em poucos itens vira aviso informativo', () => {
    expect(gerarInsights(painel({ coberturaCustoPct: 55 }))[0]).toMatchObject({ id: 'custo-incompleto', severidade: 'info' })
    expect(ids(painel({ coberturaCustoPct: 90 }))).toEqual([])
  })
})
