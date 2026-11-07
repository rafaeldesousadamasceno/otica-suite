import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'
import type { ClienteOrigemRow, ExameOrigemRow } from '@main/migracao/mysqlSource'

const { banco, origem, backup } = vi.hoisted(() => ({
  banco: { db: null as DatabaseSync | null },
  origem: { clientes: [] as unknown[], exames: [] as unknown[] },
  backup: { chamadas: 0, integro: true }
}))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))
vi.mock('@main/auth/session', () => ({ requirePermissao: () => ({ usuario: { id: 1, perfil: 'admin' } }) }))
// O MySQL do MD Oculos e o arquivo de backup ficam de fora: aqui interessa a regra de quem entra e quem sai.
vi.mock('@main/migracao/mysqlSource', () => ({
  lerClientes: async () => origem.clientes,
  lerExames: async () => origem.exames,
  lerDespesas: async () => []
}))
vi.mock('@main/repositories/backupRepository', () => ({
  criarArquivoBackup: () => {
    backup.chamadas++
    return { arquivo: 'backup.db', tamanhoBytes: 1, integro: backup.integro }
  }
}))

import { migracaoService } from './migracaoService'

const CONFIG = { host: 'localhost', porta: 3306, usuario: 'root', senha: '', banco: 'mdoculos' }

const CAMPOS_EXAME_NULOS = [
  'plonge_od_esf', 'plonge_oe_esf', 'plonge_od_cil', 'plonge_oe_cil', 'plonge_od_eixo', 'plonge_oe_eixo',
  'plonge_od_dnp', 'plonge_oe_dnp', 'pperto_od_esf', 'pperto_oe_esf', 'pperto_od_cil', 'pperto_oe_cil',
  'pperto_od_eixo', 'pperto_oe_eixo', 'pperto_od_dnp', 'pperto_oe_dnp', 'adicao', 'lentes', 'tratamentos',
  'armacao', 'observacao', 'valor_exame', 'valor_oculos', 'forma_pgto', 'laboratorio', 'med_opto',
  'data_saida', 'data_chegada', 'situacao', 'data_venda'
]

function cliente(id: number, nome: string | null): ClienteOrigemRow {
  return {
    id_cliente: id,
    nome,
    data_nasc: null,
    cpf: null,
    celular: null,
    logradouro: null,
    numero: null,
    complemento: null,
    bairro: null,
    cidade: null,
    uf: null
  }
}

function exame(id: number, idCliente: number): ExameOrigemRow {
  const nulos = Object.fromEntries(CAMPOS_EXAME_NULOS.map((k) => [k, null]))
  return { ...nulos, id_exame: id, id_cliente: idCliente, data_exame: '2024-03-10' } as ExameOrigemRow
}

/** Simula um cliente que entrou numa importacao feita antes da regra existir. */
function clienteJaImportado(origemId: number, nome: string): void {
  const db = banco.db!
  const id = Number(db.prepare('INSERT INTO cliente (nome) VALUES (:nome)').run({ nome }).lastInsertRowid)
  db.prepare(
    `INSERT INTO migracao_registro (origem_sistema, origem_tabela, origem_id, destino_tabela, destino_id)
     VALUES ('mdoculos', 'clientes', :origemId, 'cliente', :id)`
  ).run({ origemId, id })
}

function nomesNoBanco(): string[] {
  return (banco.db!.prepare('SELECT nome FROM cliente ORDER BY id').all() as { nome: string }[]).map((r) => r.nome)
}

beforeEach(() => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS) db.exec(m.sql)
  db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Ana', 'ana', 'x', 'admin')").run()
  banco.db = db
  backup.chamadas = 0
  backup.integro = true
})

describe('migracaoService.importar - clientes sem nome', () => {
  it('nao importa cliente sem nome e sem receita, mas importa o sem nome que tem receita', async () => {
    origem.clientes = [cliente(1, 'MARIA SILVA'), cliente(2, ''), cliente(3, null), cliente(4, '   ')]
    origem.exames = [exame(10, 4)]

    const r = await migracaoService.importar(CONFIG)

    expect(r.clientesImportados).toBe(2)
    expect(r.clientesSemNomeIgnorados).toBe(2)
    expect(r.clientesSemNomeRemovidos).toBe(0)
    expect(r.examesImportados).toBe(1)
    expect(nomesNoBanco()).toEqual(['Maria Silva', ''])
    expect(backup.chamadas).toBe(0)
  })

  it('remove na proxima importacao os sem nome e sem receita que ja tinham entrado, com backup antes', async () => {
    clienteJaImportado(2, '')
    clienteJaImportado(3, 'Preenchido Depois')
    origem.clientes = [cliente(2, ''), cliente(3, '')]
    origem.exames = []

    const r = await migracaoService.importar(CONFIG)

    expect(r.clientesSemNomeRemovidos).toBe(1)
    expect(r.clientesIgnorados).toBe(1)
    expect(nomesNoBanco()).toEqual(['Preenchido Depois'])
    expect(backup.chamadas).toBe(1)

    const auditoria = banco
      .db!.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE acao = 'REMOVER_CLIENTES_SEM_NOME'")
      .get() as { n: number }
    expect(auditoria.n).toBe(1)

    // Rodar de novo nao remove mais nada.
    const segunda = await migracaoService.importar(CONFIG)
    expect(segunda.clientesSemNomeRemovidos).toBe(0)
  })

  it('se o backup falhar, nao remove ninguem e avisa', async () => {
    clienteJaImportado(2, '')
    origem.clientes = [cliente(2, '')]
    origem.exames = []
    backup.integro = false

    const r = await migracaoService.importar(CONFIG)

    expect(r.clientesSemNomeRemovidos).toBe(0)
    expect(nomesNoBanco()).toEqual([''])
    expect(r.avisos.some((a) => a.motivo.includes('backup'))).toBe(true)
  })
})
