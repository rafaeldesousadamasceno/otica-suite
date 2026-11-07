import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'
import { gerarSyncSql } from './gerarSyncSql'
import { TABELAS_FORA_DA_SINCRONIZACAO, TABELAS_SINCRONIZAVEIS } from './tabelasSincronizaveis'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function banco(ate: number): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS.filter((m) => m.version <= ate)) db.exec(m.sql)
  return db
}

const um = (db: DatabaseSync, sql: string, ...p: (string | number)[]): Record<string, unknown> =>
  db.prepare(sql).get(...p) as Record<string, unknown>

describe('classificação das tabelas', () => {
  it('toda tabela do schema entra na sincronização ou tem motivo para ficar de fora', () => {
    const db = banco(10)
    const tabelas = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map(
      (r) => r.name
    )
    const classificadas = new Set([...TABELAS_SINCRONIZAVEIS.map((t) => t.nome), ...Object.keys(TABELAS_FORA_DA_SINCRONIZACAO)])
    expect(tabelas.filter((t) => !classificadas.has(t))).toEqual([])
    // E nada classificado que nao exista (nome digitado errado).
    // (_migrations e criada pelo migrator, nao por um .sql: so existe no banco real.)
    expect([...classificadas].filter((t) => t !== '_migrations' && !tabelas.includes(t))).toEqual([])
  })

  it('colunas locais e chaves naturais apontam para colunas que existem', () => {
    const db = banco(10)
    for (const t of TABELAS_SINCRONIZAVEIS) {
      const colunas = (db.prepare(`PRAGMA table_info(${t.nome})`).all() as { name: string }[]).map((c) => c.name)
      for (const c of [...(t.colunasLocais ?? []), ...(t.chaveNatural ? [t.chaveNatural] : [])]) {
        expect(colunas, `${t.nome}.${c}`).toContain(c)
      }
    }
  })

  it('a senha nunca fica na parte que sincroniza', () => {
    expect(TABELAS_SINCRONIZAVEIS.find((t) => t.nome === 'usuario')?.colunasLocais).toContain('senha_hash')
  })
})

describe('010_sync_base.sql', () => {
  it('é exatamente a saída do gerador (não ficou desatualizado nem foi editado à mão)', () => {
    const db = banco(9)
    const gerado = gerarSyncSql(TABELAS_SINCRONIZAVEIS, (t) =>
      (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name)
    )
    const arquivo = readFileSync(join(__dirname, '../db/migrations/010_sync_base.sql'), 'utf8')
    expect(arquivo.replace(/\r\n/g, '\n')).toBe(gerado)
  })

  it('linhas que já existiam ganham uuid único e entram na revisão 1, sem mudar de conteúdo', () => {
    const db = banco(9)
    db.prepare("INSERT INTO cliente (nome) VALUES ('Ana'), ('Bia'), ('Caio')").run()
    db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Admin', 'admin', 'hash', 'admin')").run()

    db.exec(MIGRATIONS.find((m) => m.version === 10)!.sql)

    const clientes = db.prepare('SELECT nome, uuid, sync_rev FROM cliente ORDER BY id').all() as { nome: string; uuid: string; sync_rev: number }[]
    expect(clientes.map((c) => c.nome)).toEqual(['Ana', 'Bia', 'Caio'])
    expect(new Set(clientes.map((c) => c.uuid)).size).toBe(3)
    for (const c of clientes) {
      expect(c.uuid).toMatch(UUID_V4)
      expect(c.sync_rev).toBe(1)
    }
    expect(um(db, 'SELECT senha_hash FROM usuario').senha_hash).toBe('hash')
  })

  it('cria a identidade do computador, e ela não vira dado sincronizável', () => {
    const db = banco(10)
    const id = um(db, "SELECT valor FROM configuracao WHERE chave = 'sync_dispositivo_id'").valor as string
    expect(id).toMatch(UUID_V4)
    expect(TABELAS_SINCRONIZAVEIS.find((t) => t.nome === 'configuracao')?.filtroLocal).toContain('sync_dispositivo_id')
  })
})

describe('gatilhos de sincronização', () => {
  it('insert gera uuid, revisão e data de alteração', () => {
    const db = banco(10)
    db.prepare("INSERT INTO cliente (nome) VALUES ('Ana')").run()
    const c = um(db, 'SELECT uuid, sync_rev, atualizado_em FROM cliente')
    expect(c.uuid).toMatch(UUID_V4)
    expect(c.sync_rev).toBeGreaterThan(1)
    expect(c.atualizado_em).toBeTruthy()
  })

  it('insert com uuid já informado (vindo da nuvem) mantém o uuid', () => {
    const db = banco(10)
    const uuid = '11111111-2222-4333-8444-555555555555'
    db.prepare("INSERT INTO cliente (nome, uuid) VALUES ('Ana', ?)").run(uuid)
    expect(um(db, 'SELECT uuid FROM cliente').uuid).toBe(uuid)
  })

  it('update aumenta a revisão e mantém o uuid', () => {
    const db = banco(10)
    db.prepare("INSERT INTO cliente (nome) VALUES ('Ana')").run()
    const antes = um(db, 'SELECT uuid, sync_rev FROM cliente')
    db.prepare("UPDATE cliente SET nome = 'Ana Maria'").run()
    const depois = um(db, 'SELECT uuid, sync_rev FROM cliente')
    expect(depois.uuid).toBe(antes.uuid)
    expect(depois.sync_rev as number).toBeGreaterThan(antes.sync_rev as number)
  })

  it('upsert em configuracao (chave de texto) conta como update e mantém o uuid', () => {
    const db = banco(10)
    const up = db.prepare("INSERT INTO configuracao (chave, valor) VALUES ('x', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
    up.run('1')
    const antes = um(db, "SELECT uuid, sync_rev FROM configuracao WHERE chave = 'x'")
    up.run('2')
    const depois = um(db, "SELECT uuid, sync_rev, valor FROM configuracao WHERE chave = 'x'")
    expect(depois.valor).toBe('2')
    expect(depois.uuid).toBe(antes.uuid)
    expect(depois.sync_rev as number).toBeGreaterThan(antes.sync_rev as number)
  })

  it('delete guarda o uuid em sync_exclusao, também quando a exclusão vem em cascata', () => {
    const db = banco(10)
    db.prepare("INSERT INTO cliente (nome) VALUES ('Ana')").run()
    const clienteUuid = um(db, 'SELECT uuid FROM cliente').uuid as string
    db.prepare("INSERT INTO contato (cliente_id, motivo, referencia) VALUES (1, 'ANIVERSARIO', '2026')").run()
    const contatoUuid = um(db, 'SELECT uuid FROM contato').uuid as string

    db.prepare('DELETE FROM cliente WHERE id = 1').run() // contato some por ON DELETE CASCADE

    const exclusoes = db.prepare('SELECT tabela, uuid FROM sync_exclusao ORDER BY id').all() as { tabela: string; uuid: string }[]
    expect(exclusoes).toContainEqual({ tabela: 'cliente', uuid: clienteUuid })
    expect(exclusoes).toContainEqual({ tabela: 'contato', uuid: contatoUuid })
  })

  it('a revisão cresce entre tabelas diferentes e nunca se repete', () => {
    const db = banco(10)
    db.prepare("INSERT INTO cliente (nome) VALUES ('Ana')").run()
    db.prepare("INSERT INTO produto (descricao, categoria) VALUES ('Armacao', 'armacao')").run()
    db.prepare("INSERT INTO fornecedor (razao_social) VALUES ('Forn')").run()
    db.prepare("UPDATE cliente SET nome = 'Ana B'").run()
    const revs = [
      um(db, 'SELECT sync_rev FROM produto').sync_rev,
      um(db, 'SELECT sync_rev FROM fornecedor').sync_rev,
      um(db, 'SELECT sync_rev FROM cliente').sync_rev
    ] as number[]
    expect(new Set(revs).size).toBe(3)
    expect([...revs]).toEqual([...revs].sort((a, b) => a - b))
    expect(um(db, 'SELECT valor FROM sync_contador').valor).toBe(revs[2])
  })

  it('uuid é único: dois registros com o mesmo uuid não convivem', () => {
    const db = banco(10)
    db.prepare("INSERT INTO cliente (nome) VALUES ('Ana')").run()
    const uuid = um(db, 'SELECT uuid FROM cliente').uuid as string
    expect(() => db.prepare("INSERT INTO cliente (nome, uuid) VALUES ('Bia', ?)").run(uuid)).toThrow()
  })

  it('um fluxo inteiro de venda grava, cancela e mantém tudo consistente', () => {
    const db = banco(10)
    db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('V', 'v', 'x', 'vendedor')").run()
    db.prepare("INSERT INTO cliente (nome) VALUES ('Ana')").run()
    db.prepare(
      "INSERT INTO venda (numero, cliente_id, vendedor_id, data, subtotal_centavos, desconto_centavos, total_centavos) VALUES ('V1', 1, 1, '2026-11-07', 100, 0, 100)"
    ).run()
    db.prepare("UPDATE venda SET situacao = 'CANCELADA' WHERE id = 1").run()
    const v = um(db, 'SELECT uuid, sync_rev, situacao FROM venda')
    expect(v.situacao).toBe('CANCELADA')
    expect(v.uuid).toMatch(UUID_V4)
    expect(um(db, "SELECT COUNT(*) AS n FROM sync_exclusao").n).toBe(0)
  })
})
