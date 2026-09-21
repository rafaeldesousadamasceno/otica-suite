import { DatabaseSync } from 'node:sqlite'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'

const { banco } = vi.hoisted(() => ({ banco: { db: null as DatabaseSync | null } }))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))

import { corrigirTextosCliente } from './migracaoRepository'

const NOVO = { nome: 'Agnaldo Da Silva Rebolças', logradouro: null, numero: null, complemento: null, bairro: null, cidade: null }

beforeAll(() => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS) db.exec(m.sql)
  banco.db = db
})

describe('corrigirTextosCliente', () => {
  it('troca o nome quebrado pelo reparado', () => {
    const db = banco.db!
    db.prepare("INSERT INTO cliente (nome) VALUES ('Agnaldo Da Silva Rebolãƒâƒã¢â€â¡as')").run()
    const id = Number((db.prepare('SELECT last_insert_rowid() id').get() as { id: number }).id)
    expect(corrigirTextosCliente(id, NOVO)).toBe(true)
    expect((db.prepare('SELECT nome FROM cliente WHERE id = ?').get(id) as { nome: string }).nome).toBe(NOVO.nome)
  })

  it('nao sobrescreve o que ja esta correto (edicao manual) nem repete', () => {
    const db = banco.db!
    db.prepare("INSERT INTO cliente (nome) VALUES ('Nome Editado à Mão')").run()
    const id = Number((db.prepare('SELECT last_insert_rowid() id').get() as { id: number }).id)
    expect(corrigirTextosCliente(id, NOVO)).toBe(false)
    expect((db.prepare('SELECT nome FROM cliente WHERE id = ?').get(id) as { nome: string }).nome).toBe('Nome Editado à Mão')
  })
})
