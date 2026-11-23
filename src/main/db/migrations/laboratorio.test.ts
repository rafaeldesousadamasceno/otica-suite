import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS } from './index'
import { sqlSyncTabelaNova } from '@main/sync/gerarSyncSql'
import { TABELAS_SINCRONIZAVEIS } from '@main/sync/tabelasSincronizaveis'

const VERSAO = 15
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** Banco como o de uma otica que ja usa o sistema (versoes 1 a 14). */
function bancoAntes(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS.filter((x) => x.version < VERSAO)) db.exec(m.sql)
  db.exec("INSERT INTO cliente (nome) VALUES ('MARIA')")
  return db
}

const migracao = (): string => MIGRATIONS.find((m) => m.version === VERSAO)!.sql

function os(db: DatabaseSync, numero: string, laboratorio: string | null): void {
  db.prepare("INSERT INTO ordem_servico (numero, cliente_id, laboratorio) VALUES (?, 1, ?)").run(numero, laboratorio)
}

const labs = (db: DatabaseSync): { nome: string; ativo: number }[] =>
  db.prepare('SELECT nome, ativo FROM laboratorio ORDER BY id').all() as { nome: string; ativo: number }[]

describe('migração 15: laboratórios', () => {
  it('cria os laboratórios da lista antiga, mantendo ativo/inativo e a ordem', () => {
    const db = bancoAntes()
    db.exec("INSERT INTO lista_valor (tipo, valor, ordem, ativo) VALUES ('laboratorio', 'LAB VISÃO', 2, 1), ('laboratorio', 'LAB ANTIGO', 3, 0)")
    db.exec(migracao())
    expect(labs(db)).toEqual([
      { nome: 'LABORATÓRIO PRÓPRIO', ativo: 1 }, // o que ja vem de fabrica na lista
      { nome: 'LAB VISÃO', ativo: 1 },
      { nome: 'LAB ANTIGO', ativo: 0 }
    ])
  })

  it('cria também os que só existem como texto nas OS, uma vez só mesmo com caixa diferente', () => {
    const db = bancoAntes()
    os(db, 'OS-1', 'Lab Novo')
    os(db, 'OS-2', 'LAB NOVO')
    os(db, 'OS-3', '  Lab Novo  ')
    os(db, 'OS-4', 'LABORATÓRIO PRÓPRIO')
    os(db, 'OS-5', '   ')
    os(db, 'OS-6', null)
    db.exec(migracao())

    const nomes = labs(db).map((l) => l.nome)
    expect(nomes).toHaveLength(2) // LABORATÓRIO PRÓPRIO (lista) + LAB NOVO
    expect(nomes).toContain('LABORATÓRIO PRÓPRIO')
    expect(nomes).toContain('LAB NOVO') // a versão em maiúsculas vem primeiro e é a que fica
  })

  it('limitação do SQLite: maiúscula e minúscula COM acento viram dois cadastros (a ótica inativa o repetido)', () => {
    const db = bancoAntes()
    os(db, 'OS-1', 'laboratório próprio')
    db.exec(migracao())
    expect(labs(db).map((l) => l.nome)).toEqual(['LABORATÓRIO PRÓPRIO', 'laboratório próprio'])
  })

  it('vincula cada OS ao seu laboratório e não mexe no texto de antes', () => {
    const db = bancoAntes()
    os(db, 'OS-1', 'Lab Novo')
    os(db, 'OS-2', 'LAB NOVO')
    os(db, 'OS-3', 'LABORATÓRIO PRÓPRIO')
    os(db, 'OS-4', null)
    os(db, 'OS-5', '  ')
    db.exec(migracao())

    const linhas = db.prepare('SELECT numero, laboratorio, laboratorio_id FROM ordem_servico ORDER BY id').all() as {
      numero: string
      laboratorio: string | null
      laboratorio_id: number | null
    }[]
    const idDe = (nome: string): number => (db.prepare('SELECT id FROM laboratorio WHERE nome = ?').get(nome) as { id: number }).id
    expect(linhas[0].laboratorio_id).toBe(idDe('LAB NOVO'))
    expect(linhas[1].laboratorio_id).toBe(idDe('LAB NOVO'))
    expect(linhas[2].laboratorio_id).toBe(idDe('LABORATÓRIO PRÓPRIO'))
    expect(linhas[3].laboratorio_id).toBeNull()
    expect(linhas[4].laboratorio_id).toBeNull()
    expect(linhas.map((l) => l.laboratorio)).toEqual(['Lab Novo', 'LAB NOVO', 'LABORATÓRIO PRÓPRIO', null, '  '])
  })

  it('a OS ganha entregador (nome e contato), vazio nas antigas', () => {
    const db = bancoAntes()
    os(db, 'OS-1', null)
    db.exec(migracao())
    expect(db.prepare('SELECT entregador_nome, entregador_contato FROM ordem_servico').get()).toEqual({ entregador_nome: null, entregador_contato: null })
  })

  it('o nome é único sem diferença de maiúscula, e o excluído libera o nome', () => {
    const db = bancoAntes()
    db.exec(migracao())
    db.exec("INSERT INTO laboratorio (nome) VALUES ('Lab X')")
    expect(() => db.exec("INSERT INTO laboratorio (nome) VALUES ('LAB x')")).toThrow()
    db.exec("UPDATE laboratorio SET excluido_em = datetime('now') WHERE nome = 'Lab X'")
    db.exec("INSERT INTO laboratorio (nome) VALUES ('LAB X')")
    expect((db.prepare('SELECT COUNT(*) AS n FROM laboratorio WHERE nome = ? COLLATE NOCASE').get('lab x') as { n: number }).n).toBe(2)
  })

  it('instalação nova: só o laboratório de fábrica', () => {
    const db = new DatabaseSync(':memory:')
    for (const m of MIGRATIONS) db.exec(m.sql)
    expect(labs(db)).toEqual([{ nome: 'LABORATÓRIO PRÓPRIO', ativo: 1 }])
  })
})

describe('migração 15: sincronização da tabela nova', () => {
  it('os laboratórios já existentes nascem com uuid e entram na revisão 1', () => {
    const db = bancoAntes()
    os(db, 'OS-1', 'Lab Novo')
    db.exec(migracao())
    const linhas = db.prepare('SELECT uuid, sync_rev FROM laboratorio').all() as { uuid: string; sync_rev: number }[]
    expect(linhas.length).toBeGreaterThan(1)
    for (const l of linhas) {
      expect(l.uuid).toMatch(UUID_V4)
      expect(l.sync_rev).toBe(1)
    }
    expect(new Set(linhas.map((l) => l.uuid)).size).toBe(linhas.length)
  })

  it('insert, update e delete passam pelos gatilhos', () => {
    const db = bancoAntes()
    db.exec(migracao())
    db.exec("INSERT INTO laboratorio (nome) VALUES ('Lab Y')")
    const antes = db.prepare("SELECT uuid, sync_rev FROM laboratorio WHERE nome = 'Lab Y'").get() as { uuid: string; sync_rev: number }
    expect(antes.uuid).toMatch(UUID_V4)
    expect(antes.sync_rev).toBeGreaterThan(1)

    db.exec("UPDATE laboratorio SET telefone = '85999998888' WHERE nome = 'Lab Y'")
    const depois = db.prepare("SELECT uuid, sync_rev FROM laboratorio WHERE nome = 'Lab Y'").get() as { uuid: string; sync_rev: number }
    expect(depois.uuid).toBe(antes.uuid)
    expect(depois.sync_rev).toBeGreaterThan(antes.sync_rev)

    db.exec("DELETE FROM laboratorio WHERE nome = 'Lab Y'")
    expect(db.prepare("SELECT tabela, uuid FROM sync_exclusao WHERE tabela = 'laboratorio'").get()).toEqual({ tabela: 'laboratorio', uuid: antes.uuid })
  })

  it('o trecho de sincronização da migração é exatamente a saída do gerador', () => {
    const colunas = ['id', 'nome', 'razao_social', 'cnpj', 'telefone', 'whatsapp', 'email', 'endereco', 'contato_responsavel', 'prazo_medio_dias', 'observacoes', 'ativo', 'excluido_em', 'excluido_motivo', 'criado_em']
    const gerado = sqlSyncTabelaNova(TABELAS_SINCRONIZAVEIS.find((t) => t.nome === 'laboratorio')!, colunas)
    expect(migracao().replace(/\r\n/g, '\n')).toContain(gerado.replace(/\r\n/g, '\n'))
  })

  it('a tabela está registrada como criada na migração 15 (fora da 010)', () => {
    expect(TABELAS_SINCRONIZAVEIS.find((t) => t.nome === 'laboratorio')?.desdeMigracao).toBe(15)
  })
})
