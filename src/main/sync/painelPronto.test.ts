import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'

// Sem mock de requireSessao: o worker roda sem ninguem logado.
const { banco } = vi.hoisted(() => ({ banco: { db: null as DatabaseSync | null } }))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))

import { montarPaineis } from './painelPronto'

const HOJE = '2026-11-07'

function contas(db: DatabaseSync): number {
  return Number((db.prepare('SELECT COUNT(*) AS n FROM conta_pagar').get() as { n: number }).n)
}

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-07T15:00:00'))

  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS) db.exec(m.sql)
  banco.db = db

  db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Ana', 'ana', 'x', 'admin')").run()
  db.prepare("INSERT INTO cliente (nome) VALUES ('Cliente')").run()
  db.prepare("INSERT INTO produto (descricao, categoria, custo_centavos) VALUES ('Armacao', 'armacao', 3000)").run()
  const venda = db.prepare(
    `INSERT INTO venda (numero, cliente_id, vendedor_id, data, subtotal_centavos, desconto_centavos, total_centavos)
     VALUES (:n, 1, 1, :d, :t, 0, :t)`
  )
  const item = db.prepare(
    `INSERT INTO venda_item (venda_id, produto_id, descricao, quantidade, preco_unitario_centavos, total_centavos)
     VALUES (:id, 1, 'item', 1, :t, :t)`
  )
  for (const [n, d, t] of [
    ['V1', '2026-11-07', 10000], // hoje
    ['V2', '2026-10-15', 7000] // mes passado
  ] as const) {
    const id = Number(venda.run({ n, d, t }).lastInsertRowid)
    item.run({ id, t })
  }
  // Recorrencia ativa que, se o horizonte fosse completado, geraria contas.
  db.prepare("INSERT INTO recorrencia (descricao, frequencia, dia_vencimento, data_inicio) VALUES ('aluguel', 'MENSAL', 10, '2026-01-01')").run()
  db.prepare("INSERT INTO recorrencia_valor (recorrencia_id, valor_centavos, vigente_desde) VALUES (1, 100000, '2026-01')").run()
})

afterAll(() => vi.useRealTimers())

describe('montarPaineis', () => {
  it('hoje, mes e mes_anterior trazem faturamento coerente com o periodo', () => {
    const p = montarPaineis(HOJE) as Record<string, any>
    expect(p.hoje.periodo).toEqual({ inicio: HOJE, fim: HOJE })
    expect(p.hoje.kpis.faturamento.atual).toBe(10000)
    expect(p.mes.periodo).toEqual({ inicio: '2026-11-01', fim: HOJE })
    expect(p.mes.kpis.faturamento.atual).toBe(10000)
    expect(p.mes_anterior.periodo).toEqual({ inicio: '2026-10-01', fim: '2026-10-31' })
    expect(p.mes_anterior.kpis.faturamento.atual).toBe(7000)
  })

  it('avisos traz insights e posicao', () => {
    const p = montarPaineis(HOJE) as Record<string, any>
    expect(Array.isArray(p.avisos.insights)).toBe(true)
    expect(p.avisos.posicao).toBeDefined()
    expect(Object.keys(p.avisos).sort()).toEqual(['insights', 'posicao'])
  })

  it('não escreve no banco (não completa recorrências)', () => {
    const antes = contas(banco.db!)
    montarPaineis(HOJE)
    expect(contas(banco.db!)).toBe(antes)
  })

  it('funciona sem sessão', () => {
    expect(() => montarPaineis(HOJE)).not.toThrow()
  })
})
