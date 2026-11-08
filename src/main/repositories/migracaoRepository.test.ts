import { DatabaseSync } from 'node:sqlite'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'

const { banco } = vi.hoisted(() => ({ banco: { db: null as DatabaseSync | null } }))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))

import { corrigirTextosCliente, removerClienteImportadoSemNome } from './migracaoRepository'

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
    expect((db.prepare('SELECT nome FROM cliente WHERE id = ?').get(id) as { nome: string }).nome).toBe(NOVO.nome.toUpperCase())
  })

  it('nao sobrescreve o que ja esta correto (edicao manual) nem repete', () => {
    const db = banco.db!
    db.prepare("INSERT INTO cliente (nome) VALUES ('Nome Editado à Mão')").run()
    const id = Number((db.prepare('SELECT last_insert_rowid() id').get() as { id: number }).id)
    expect(corrigirTextosCliente(id, NOVO)).toBe(false)
    expect((db.prepare('SELECT nome FROM cliente WHERE id = ?').get(id) as { nome: string }).nome).toBe('Nome Editado à Mão')
  })
})

describe('removerClienteImportadoSemNome', () => {
  /** Cliente sem nome como uma importacao anterior deixava: com a linha em migracao_registro. */
  function clienteImportado(nome: string, origemId: number): number {
    const db = banco.db!
    const id = Number(db.prepare('INSERT INTO cliente (nome) VALUES (:nome)').run({ nome }).lastInsertRowid)
    db.prepare(
      `INSERT INTO migracao_registro (origem_sistema, origem_tabela, origem_id, destino_tabela, destino_id)
       VALUES ('mdoculos', 'clientes', :origemId, 'cliente', :id)`
    ).run({ origemId, id })
    return id
  }

  function existe(sql: string, id: number): boolean {
    return banco.db!.prepare(sql).get({ id }) !== undefined
  }

  it('remove o cliente sem nome e sem vinculos, junto com o registro da migracao', () => {
    const id = clienteImportado('  ', 9001)
    expect(removerClienteImportadoSemNome(id)).toBe(true)
    expect(existe('SELECT 1 FROM cliente WHERE id = :id', id)).toBe(false)
    expect(existe("SELECT 1 FROM migracao_registro WHERE destino_tabela = 'cliente' AND destino_id = :id", id)).toBe(false)
  })

  it('mantem o cliente sem nome que tem receita', () => {
    const id = clienteImportado('', 9002)
    banco.db!.prepare("INSERT INTO receita_optica (cliente_id, data_exame) VALUES (:id, '2024-01-01')").run({ id })
    expect(removerClienteImportadoSemNome(id)).toBe(false)
    expect(existe('SELECT 1 FROM cliente WHERE id = :id', id)).toBe(true)
  })

  it('mantem o cliente sem nome que tem contato no Relacionamento', () => {
    const id = clienteImportado('', 9003)
    banco.db!.prepare("INSERT INTO contato (cliente_id, motivo, referencia) VALUES (:id, 'ANIVERSARIO', '2026')").run({ id })
    expect(removerClienteImportadoSemNome(id)).toBe(false)
    expect(existe('SELECT 1 FROM cliente WHERE id = :id', id)).toBe(true)
  })

  it('mantem o cliente cujo nome foi preenchido depois da importacao', () => {
    const id = clienteImportado('Maria Completou O Cadastro', 9004)
    expect(removerClienteImportadoSemNome(id)).toBe(false)
    expect(existe('SELECT 1 FROM cliente WHERE id = :id', id)).toBe(true)
  })
})
