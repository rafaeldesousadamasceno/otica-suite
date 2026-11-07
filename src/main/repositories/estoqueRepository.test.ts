import { DatabaseSync } from 'node:sqlite'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'

const { banco } = vi.hoisted(() => ({ banco: { db: null as DatabaseSync | null } }))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))

import { contarAbaixoMinimo, listarComSaldo } from './estoqueRepository'

beforeAll(() => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS) db.exec(m.sql)
  // 501 produtos com estoque sobrando; so o ultimo em ordem alfabetica esta abaixo do minimo.
  const produto = db.prepare(`INSERT INTO produto (descricao, categoria, estoque_minimo) VALUES (:d, 'armacao', :min)`)
  for (let i = 0; i < 501; i++) produto.run({ d: `Produto ${String(i).padStart(3, '0')}`, min: i === 500 ? 3 : 0 })
  produto.run({ d: 'Zerado sem minimo', min: 0 })
  db.prepare(`INSERT INTO produto (descricao, categoria, estoque_minimo) VALUES ('Servico', 'servico', 5)`).run()
  banco.db = db
})

describe('listarComSaldo', () => {
  it('filtra "abaixo do minimo" antes do limite de 500 linhas', () => {
    const itens = listarComSaldo({ busca: '', categoria: '', situacao: 'abaixo_minimo' })
    expect(itens.map((i) => i.descricao)).toEqual(['Produto 500'])
  })

  it('zerado inclui quem nunca teve movimentacao; servico nunca aparece', () => {
    const itens = listarComSaldo({ busca: 'Zerado', categoria: '', situacao: 'zerado' })
    expect(itens.map((i) => i.descricao)).toEqual(['Zerado sem minimo'])
    expect(listarComSaldo({ busca: 'Servico', categoria: '', situacao: '' })).toHaveLength(0)
  })

  it('sem filtro de situacao continua limitado a 500', () => {
    expect(listarComSaldo({ busca: '', categoria: '', situacao: '' })).toHaveLength(500)
  })
})

describe('contarAbaixoMinimo', () => {
  it('conta sem limite de linhas e ignora servicos', () => {
    expect(contarAbaixoMinimo()).toBe(1)
  })
})
