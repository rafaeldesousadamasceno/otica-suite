import { DatabaseSync } from 'node:sqlite'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'
import type { Perfil } from '@shared/types'

const { banco, sessao } = vi.hoisted(() => ({
  banco: { db: null as DatabaseSync | null },
  sessao: { usuario: { id: 1, perfil: 'admin' as Perfil } }
}))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))
vi.mock('@main/auth/session', () => ({ requireSessao: () => sessao }))

import { dashboardService } from './dashboardService'

const FILTRO = { dataInicio: '2026-11-01', dataFim: '2026-11-07', preset: 'esteMes' as const, comparar: true }

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-07T15:00:00'))

  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS) db.exec(m.sql)
  banco.db = db

  const usuario = db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES (:n, :l, 'x', :p)")
  usuario.run({ n: 'Ana', l: 'ana', p: 'admin' }) // 1
  usuario.run({ n: 'Beto', l: 'beto', p: 'vendedor' }) // 2
  usuario.run({ n: 'Cida', l: 'cida', p: 'vendedor' }) // 3
  db.prepare("INSERT INTO cliente (nome) VALUES ('Cliente')").run()
  db.prepare("INSERT INTO produto (descricao, categoria, custo_centavos) VALUES ('Armacao', 'armacao', 3000)").run()

  const venda = db.prepare(
    `INSERT INTO venda (numero, cliente_id, vendedor_id, data, subtotal_centavos, desconto_centavos, total_centavos)
     VALUES (:n, 1, :v, :d, :t, 0, :t)`
  )
  const item = db.prepare(
    `INSERT INTO venda_item (venda_id, produto_id, descricao, quantidade, preco_unitario_centavos, total_centavos)
     VALUES (:id, 1, 'item', 1, :t, :t)`
  )
  for (const [n, v, d, t] of [
    ['V1', 2, '2026-11-03', 10000],
    ['V2', 3, '2026-11-05', 20000],
    ['V3', 2, '2026-10-02', 6000] // periodo de comparacao (1 a 7 de outubro)
  ] as const) {
    const id = Number(venda.run({ n, v, d, t }).lastInsertRowid)
    item.run({ id, t })
  }
  db.prepare("INSERT INTO lancamento (tipo, categoria, descricao, valor_centavos, data) VALUES ('RECEITA', 'VENDA', 'x', 9000, '2026-11-04')").run()
  db.prepare("INSERT INTO conta_pagar (descricao, valor_centavos, vencimento) VALUES ('luz', 5000, '2026-11-01')").run()
})

beforeEach(() => {
  sessao.usuario = { id: 1, perfil: 'admin' }
})

describe('dashboardService.obter', () => {
  it('administrador: faturamento, comparacao, ticket medio e secoes financeiras', () => {
    const d = dashboardService.obter(FILTRO)

    expect(d.escopo).toBe('loja')
    expect(d.comparacao).toEqual({ inicio: '2026-10-01', fim: '2026-10-07' })
    expect(d.kpis.faturamento).toEqual({ atual: 30000, anterior: 6000 })
    expect(d.kpis.vendas).toEqual({ atual: 2, anterior: 1 })
    expect(d.kpis.ticketMedio).toEqual({ atual: 15000, anterior: 6000 })
    expect(d.kpis.lucroBruto).toEqual({ atual: 30000 - 6000, anterior: 6000 - 3000 })
    expect(d.financeiro?.recebido).toEqual({ atual: 9000, anterior: 0 })
    expect(d.ranking?.map((r) => r.vendedorNome)).toEqual(['Cida', 'Beto'])
    expect(d.posicao.pagar?.vencidasQtd).toBe(1)
  })

  it('a serie diaria cobre o periodo inteiro e tem a serie de comparacao do mesmo tamanho', () => {
    const d = dashboardService.obter(FILTRO)
    expect(d.granularidade).toBe('dia')
    expect(d.serie.baldes).toHaveLength(7)
    expect(d.serie.faturamento.reduce((a, b) => a + b, 0)).toBe(30000)
    expect(d.serie.comparacao).toHaveLength(7)
    expect(d.serie.comparacao?.reduce((a, b) => a + b, 0)).toBe(6000)
  })

  it('sem comparar, nao ha periodo anterior nem valores anteriores', () => {
    const d = dashboardService.obter({ ...FILTRO, comparar: false })
    expect(d.comparacao).toBeNull()
    expect(d.kpis.faturamento.anterior).toBeNull()
    expect(d.serie.comparacao).toBeNull()
    expect(d.financeiro?.recebido.anterior).toBeNull()
  })

  it('administrador filtrando um vendedor ve so as vendas dele, sem caixa nem ranking', () => {
    const d = dashboardService.obter({ ...FILTRO, vendedorId: 2 })
    expect(d.escopo).toBe('vendedor')
    expect(d.kpis.faturamento.atual).toBe(10000)
    expect(d.financeiro).toBeNull()
    expect(d.ranking).toBeNull()
    expect(d.posicao.pagar).toBeNull()
  })

  it('vendedor ve so os proprios numeros, mesmo pedindo outro vendedor ou a loja toda', () => {
    sessao.usuario = { id: 3, perfil: 'vendedor' }
    for (const vendedorId of [undefined, 2, 3]) {
      const d = dashboardService.obter({ ...FILTRO, vendedorId })
      expect(d.escopo).toBe('vendedor')
      expect(d.kpis.faturamento.atual).toBe(20000)
      expect(d.kpis.comissao).not.toBeNull()
    }
  })

  it('vendedor nao recebe financeiro, lucro, ranking nem contas a pagar', () => {
    sessao.usuario = { id: 2, perfil: 'vendedor' }
    const d = dashboardService.obter(FILTRO)
    expect(d.financeiro).toBeNull()
    expect(d.ranking).toBeNull()
    expect(d.kpis.lucroBruto).toBeNull()
    expect(d.kpis.margemPct).toBeNull()
    expect(d.coberturaCustoPct).toBeNull()
    expect(d.posicao.pagar).toBeNull()
    expect(d.topProdutos.every((p) => p.margemCentavos === null)).toBe(true)
  })

  it('periodo vazio devolve zeros e series completas, sem erro', () => {
    const d = dashboardService.obter({ ...FILTRO, dataInicio: '2020-01-01', dataFim: '2020-01-10', preset: 'personalizado' })
    expect(d.kpis.faturamento.atual).toBe(0)
    expect(d.kpis.ticketMedio.atual).toBe(0)
    expect(d.serie.baldes).toHaveLength(10)
    expect(d.categorias).toEqual([])
    expect(d.formasPagamento).toEqual([])
  })

  it('periodos longos agrupam por semana e por mes', () => {
    const tresMeses = dashboardService.obter({ ...FILTRO, dataInicio: '2026-09-01', dataFim: '2026-11-07', preset: 'ultimos3Meses' })
    expect(tresMeses.granularidade).toBe('semana')
    const ano = dashboardService.obter({ ...FILTRO, dataInicio: '2026-01-01', dataFim: '2026-11-07', preset: 'esteAno' })
    expect(ano.granularidade).toBe('mes')
    expect(ano.serie.baldes).toHaveLength(11)
  })

  it('os insights apontam o que precisa de atencao, com link', () => {
    const d = dashboardService.obter(FILTRO)
    const ids = d.insights.map((i) => i.id)
    expect(ids).toContain('faturamento-alta')
    expect(ids).toContain('pagar-vencidas')
    expect(d.insights.find((i) => i.id === 'pagar-vencidas')?.link).toBe('/contas-pagar?vencidas=1')
    expect(d.insights[0].severidade).toBe('critico')
  })
})
