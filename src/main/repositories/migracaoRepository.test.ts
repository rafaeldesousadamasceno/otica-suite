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

describe('importarExame: prescrição e laboratório importados', () => {
  const EXAME = {
    profissionalId: null, dataExame: '2025-03-10', dataVenda: '2025-03-10',
    longeOdEsf: -1, longeOdCil: -0.5, longeOdEixo: 90, longeOdDnp: 31.5,
    longeOeEsf: -1, longeOeCil: null, longeOeEixo: null, longeOeDnp: 32,
    pertoOdEsf: 1, pertoOdCil: -0.5, pertoOdEixo: 90, pertoOdDnp: 30,
    pertoOeEsf: 1, pertoOeCil: null, pertoOeEixo: null, pertoOeDnp: 30.5,
    adicao: 2, descricaoItem: 'LENTE', valorTotalCentavos: 0, formaPagamento: 'À VISTA',
    situacaoOS: 'EM ABERTO' as const, dataEnvio: null, dataChegada: null, dataEntrega: null
  }

  it('a OS importada nasce ligada a um laboratório cadastrado, sem duplicar o que já existe', async () => {
    const db = banco.db!
    db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Ana', 'ana-imp', 'x', 'admin')").run()
    db.prepare("INSERT INTO cliente (nome) VALUES ('Cliente Importado')").run()
    const clienteId = Number((db.prepare('SELECT last_insert_rowid() id').get() as { id: number }).id)
    const vendedorId = Number((db.prepare("SELECT id FROM usuario WHERE login = 'ana-imp'").get() as { id: number }).id)
    const { importarExame, garantirProdutoGenerico } = await import('./migracaoRepository')
    const produto = garantirProdutoGenerico()

    importarExame({ ...EXAME, clienteId, vendedorId, laboratorio: 'Lab Importado' }, produto, 9001)
    importarExame({ ...EXAME, clienteId, vendedorId, laboratorio: 'LAB IMPORTADO' }, produto, 9002)
    importarExame({ ...EXAME, clienteId, vendedorId, laboratorio: null }, produto, 9003)

    const labs = db.prepare("SELECT id, nome FROM laboratorio WHERE nome = 'Lab Importado' COLLATE NOCASE OR nome = 'LAB IMPORTADO'").all() as { id: number; nome: string }[]
    expect(labs).toHaveLength(1)
    const oss = db.prepare("SELECT numero, laboratorio, laboratorio_id FROM ordem_servico WHERE numero LIKE 'MDO-900%' ORDER BY numero").all() as {
      numero: string
      laboratorio: string | null
      laboratorio_id: number | null
    }[]
    expect(oss.map((o) => o.laboratorio_id)).toEqual([labs[0].id, labs[0].id, null])
    expect(oss[0].laboratorio).toBe('Lab Importado') // o texto do sistema antigo continua gravado
  })

  it('a prescrição importada segue a conversão: perto = longe + adição entra no formato atual', async () => {
    const db = banco.db!
    const r = db.prepare("SELECT adicao_od, adicao_oe, dp_longe, formato_anterior FROM receita_optica ORDER BY id DESC LIMIT 1").get() as Record<string, unknown>
    expect(r).toEqual({ adicao_od: 2, adicao_oe: 2, dp_longe: 63.5, formato_anterior: 0 })
  })
})
