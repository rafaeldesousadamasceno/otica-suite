import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'

// SQLite em memoria com o schema REAL das migrations: o que se testa aqui e o
// SQL das series dos graficos (nome de coluna, JOIN, filtro), nao um mock dele.
const { banco } = vi.hoisted(() => ({ banco: { db: null as DatabaseSync | null } }))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))

import { dashboardRepository } from './dashboardRepository'

/** Fixa "hoje" para as datas do teste nao dependerem do dia em que ele roda. */
const HOJE = '2026-09-19'

function inserirVenda(
  db: DatabaseSync,
  v: { numero: string; vendedorId: number; data: string; total: number; situacao?: string }
): number {
  const info = db
    .prepare(
      `INSERT INTO venda (numero, cliente_id, vendedor_id, data, subtotal_centavos, desconto_centavos, total_centavos, situacao)
       VALUES (:numero, 1, :vendedorId, :data, :total, 0, :total, :situacao)`
    )
    .run({ ...v, situacao: v.situacao ?? 'CONCLUIDA' })
  return Number(info.lastInsertRowid)
}

function inserirItem(db: DatabaseSync, vendaId: number, produtoId: number | null, total: number): void {
  db.prepare(
    `INSERT INTO venda_item (venda_id, produto_id, descricao, quantidade, preco_unitario_centavos, total_centavos)
     VALUES (:vendaId, :produtoId, 'item', 1, :total, :total)`
  ).run({ vendaId, produtoId, total })
}

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${HOJE}T15:00:00Z`))

  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS) db.exec(m.sql)
  banco.db = db

  const usuario = db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES (:nome, :login, 'x', :perfil)")
  usuario.run({ nome: 'Ana', login: 'ana', perfil: 'admin' }) // 1
  usuario.run({ nome: 'Beto', login: 'beto', perfil: 'vendedor' }) // 2
  usuario.run({ nome: 'Cida', login: 'cida', perfil: 'vendedor' }) // 3
  db.prepare("INSERT INTO cliente (nome) VALUES ('Cliente')").run()

  const produto = db.prepare("INSERT INTO produto (descricao, categoria) VALUES (:d, :c)")
  produto.run({ d: 'Armacao', c: 'armacao' }) // 1
  produto.run({ d: 'Lente', c: 'lente' }) // 2

  const v1 = inserirVenda(db, { numero: 'V1', vendedorId: 2, data: '2026-09-19', total: 10000 })
  inserirItem(db, v1, 1, 10000)
  const v2 = inserirVenda(db, { numero: 'V2', vendedorId: 3, data: '2026-09-19', total: 5000 })
  inserirItem(db, v2, 2, 5000)
  const v3 = inserirVenda(db, { numero: 'V3', vendedorId: 2, data: '2026-09-10', total: 20000 })
  inserirItem(db, v3, 1, 12000)
  inserirItem(db, v3, 2, 8000)
  const v4 = inserirVenda(db, { numero: 'V4', vendedorId: 2, data: '2026-08-25', total: 7000 }) // dentro dos 30 dias, fora do mes
  inserirItem(db, v4, 1, 7000)
  inserirVenda(db, { numero: 'V5', vendedorId: 2, data: '2026-07-01', total: 99999 }) // fora dos 30 dias
  const v6 = inserirVenda(db, { numero: 'V6', vendedorId: 2, data: HOJE, total: 55555, situacao: 'CANCELADA' })
  inserirItem(db, v6, 1, 55555)
  const v7 = inserirVenda(db, { numero: 'V7', vendedorId: 2, data: '2026-09-12', total: 3000 })
  inserirItem(db, v7, null, 3000) // sem produto cadastrado -> 'outros'

  const lancamento = db.prepare(
    "INSERT INTO lancamento (tipo, descricao, valor_centavos, data) VALUES (:tipo, 'l', :valor, :data)"
  )
  lancamento.run({ tipo: 'RECEITA', valor: 5000, data: '2026-09-05' })
  lancamento.run({ tipo: 'DESPESA', valor: 2000, data: '2026-09-06' })
  lancamento.run({ tipo: 'RECEITA', valor: 1000, data: '2026-08-15' })
  lancamento.run({ tipo: 'DESPESA', valor: 9999, data: '2026-03-01' }) // antes da janela de 6 meses

  const os = db.prepare(
    "INSERT INTO ordem_servico (numero, cliente_id, situacao, criado_por) VALUES (:numero, 1, :situacao, :criadoPor)"
  )
  os.run({ numero: 'OS1', situacao: 'EM ABERTO', criadoPor: 2 })
  os.run({ numero: 'OS2', situacao: 'LABORATÓRIO', criadoPor: 2 })
  os.run({ numero: 'OS3', situacao: 'LABORATÓRIO', criadoPor: 3 })
  os.run({ numero: 'OS4', situacao: 'CHEGOU', criadoPor: 3 })
  os.run({ numero: 'OS5', situacao: 'ENTREGUE', criadoPor: 2 }) // fora do funil
  os.run({ numero: 'OS6', situacao: 'CANCELADA', criadoPor: 2 }) // fora do funil
})

afterAll(() => {
  vi.useRealTimers()
  banco.db?.close()
})

describe('dashboardRepository - dados dos graficos', () => {
  it('vendas por dia: serie continua de 30 dias, com 0 nos dias sem venda, sem canceladas nem vendas antigas', () => {
    const { vendasPorDia } = dashboardRepository.obterAdmin()

    expect(vendasPorDia).toHaveLength(30)
    expect(vendasPorDia[0].data).toBe('2026-08-21')
    expect(vendasPorDia[29].data).toBe(HOJE)

    const total = (data: string): number => vendasPorDia.find((d) => d.data === data)?.totalCentavos ?? -1
    expect(total(HOJE)).toBe(15000) // V1 + V2; a cancelada V6 nao entra
    expect(total('2026-09-10')).toBe(20000)
    expect(total('2026-09-12')).toBe(3000)
    expect(total('2026-08-25')).toBe(7000)
    expect(total('2026-09-01')).toBe(0)
    expect(vendasPorDia.reduce((s, d) => s + d.totalCentavos, 0)).toBe(45000) // V5 (julho) fica de fora
  })

  it('a barra de hoje bate com o card "Vendas hoje"', () => {
    const admin = dashboardRepository.obterAdmin()
    expect(admin.vendasPorDia[29].totalCentavos).toBe(admin.vendasHojeCentavos)
  })

  it('vendedor ve so as proprias vendas e as proprias OS', () => {
    const beto = dashboardRepository.obterVendedor(2)
    expect(beto.vendasPorDia[29].totalCentavos).toBe(10000) // so a V1, sem a V2 da Cida
    expect(beto.vendasPorDia.reduce((s, d) => s + d.totalCentavos, 0)).toBe(40000)
    expect(beto.osPorEtapa.map((e) => e.quantidade)).toEqual([1, 1, 0])

    const cida = dashboardRepository.obterVendedor(3)
    expect(cida.vendasPorDia.reduce((s, d) => s + d.totalCentavos, 0)).toBe(5000)
    expect(cida.osPorEtapa.map((e) => e.quantidade)).toEqual([0, 1, 1])
  })

  it('fluxo mensal: 6 meses terminando no atual, por tipo, sem lancamento fora da janela', () => {
    const { fluxoMensal } = dashboardRepository.obterAdmin()

    expect(fluxoMensal.map((m) => m.mes)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
    expect(fluxoMensal[5]).toEqual({ mes: '2026-09', receitasCentavos: 5000, despesasCentavos: 2000 })
    expect(fluxoMensal[4]).toEqual({ mes: '2026-08', receitasCentavos: 1000, despesasCentavos: 0 })
    expect(fluxoMensal[0]).toEqual({ mes: '2026-04', receitasCentavos: 0, despesasCentavos: 0 })
  })

  it('vendas por categoria: so o mes corrente, itens sem produto viram "outros", maior primeiro', () => {
    const { vendasPorCategoria } = dashboardRepository.obterAdmin()

    expect(vendasPorCategoria).toEqual([
      { categoria: 'armacao', totalCentavos: 22000 }, // V1 10000 + V3 12000 (V4 e agosto, V6 cancelada)
      { categoria: 'lente', totalCentavos: 13000 }, // V2 5000 + V3 8000
      { categoria: 'outros', totalCentavos: 3000 }
    ])
  })

  it('OS por etapa: sempre as 3 etapas em ordem, sem entregues nem canceladas', () => {
    const { osPorEtapa } = dashboardRepository.obterAdmin()

    expect(osPorEtapa).toEqual([
      { situacao: 'EM ABERTO', quantidade: 1 },
      { situacao: 'LABORATÓRIO', quantidade: 2 },
      { situacao: 'CHEGOU', quantidade: 1 }
    ])
  })
})
