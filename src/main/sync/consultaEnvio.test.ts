import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'
import { TABELAS_SINCRONIZAVEIS } from './tabelasSincronizaveis'
import { UUID_MAXIMO, lerInfoTabela, lerLote, montarConsultaEnvio, type PosicaoLote } from './consultaEnvio'

function banco(ate?: number): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS.filter((m) => ate === undefined || m.version <= ate)) db.exec(m.sql)
  return db
}

const INICIO: PosicaoLote = { rev: 0, uuid: '' }

function ler(db: DatabaseSync, nome: string, depois: PosicaoLote = INICIO, ate = 1_000_000, limite = 5000): Record<string, unknown>[] {
  const t = TABELAS_SINCRONIZAVEIS.find((x) => x.nome === nome)!
  return lerLote(db, montarConsultaEnvio(t, lerInfoTabela(db, nome)), depois, ate, limite)
}

describe('consulta de envio', () => {
  it('não envia senha, tentativas, bloqueio nem último acesso do usuário', () => {
    const db = banco()
    db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Ana', 'ana', 'hash', 'admin')").run()
    const linhas = ler(db, 'usuario')
    expect(linhas.length).toBeGreaterThan(0)
    const chaves = Object.keys(linhas[0])
    for (const c of ['senha_hash', 'tentativas_login', 'bloqueado_ate', 'ultimo_acesso', 'id']) expect(chaves).not.toContain(c)
    for (const c of ['uuid', 'login', 'sync_rev']) expect(chaves).toContain(c)
  })

  it('configuracao não envia as chaves locais', () => {
    const db = banco()
    for (const c of ['nuvem_ligada', 'licenca_local', 'sync_dispositivo_id', 'tema_comum']) {
      db.prepare('INSERT OR REPLACE INTO configuracao (chave, valor) VALUES (?, ?)').run(c, 'x')
    }
    const chaves = ler(db, 'configuracao').map((l) => l.chave)
    expect(chaves).toContain('tema_comum')
    for (const c of ['nuvem_ligada', 'licenca_local', 'sync_dispositivo_id']) expect(chaves).not.toContain(c)
  })

  it('FK vira uuid do pai, e FK nula ou órfã vira null', () => {
    const db = banco()
    db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Ana', 'ana', 'h', 'admin')").run()
    db.prepare("INSERT INTO cliente (nome, criado_por) VALUES ('Com', 1)").run()
    db.prepare("INSERT INTO venda (numero, cliente_id) VALUES ('V1', 1)").run()
    db.prepare("INSERT INTO venda (numero) VALUES ('V2')").run()
    const uuidCliente = (db.prepare('SELECT uuid FROM cliente WHERE id = 1').get() as { uuid: string }).uuid
    const uuidUsuario = (db.prepare('SELECT uuid FROM usuario WHERE id = 1').get() as { uuid: string }).uuid
    const vendas = ler(db, 'venda')
    expect(vendas.find((v) => v.numero === 'V1')!.cliente_uuid).toBe(uuidCliente)
    expect(vendas.find((v) => v.numero === 'V2')!.cliente_uuid).toBeNull()
    expect(ler(db, 'cliente')[0].criado_por_uuid).toBe(uuidUsuario)
  })

  it('pagina por (sync_rev, uuid) sem repetir nem perder linhas com a mesma revisão', () => {
    const db = banco(9)
    db.exec(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 1200)
             INSERT INTO cliente (nome) SELECT 'C' || i FROM n`)
    for (const m of MIGRATIONS.filter((m) => m.version === 10)) db.exec(m.sql)
    const vistos: string[] = []
    let pos = INICIO
    for (;;) {
      const lote = ler(db, 'cliente', pos, 1_000_000, 500)
      if (lote.length === 0) break
      for (const l of lote) vistos.push(l.uuid as string)
      const ult = lote[lote.length - 1]
      pos = { rev: ult.sync_rev as number, uuid: ult.uuid as string }
    }
    expect(vistos).toHaveLength(1200)
    expect(new Set(vistos).size).toBe(1200)
  })

  it('não devolve o que já foi enviado', () => {
    const db = banco()
    db.prepare("INSERT INTO cliente (nome) VALUES ('A')").run()
    const [a] = ler(db, 'cliente')
    const N = a.sync_rev as number
    expect(ler(db, 'cliente', { rev: N, uuid: UUID_MAXIMO }, N)).toEqual([])
    db.prepare("UPDATE cliente SET nome = 'B' WHERE id = 1").run()
    const depois = ler(db, 'cliente', { rev: N, uuid: UUID_MAXIMO }, N + 1)
    expect(depois).toHaveLength(1)
    expect(depois[0].nome).toBe('B')
  })

  it('respeita o teto ate', () => {
    const db = banco()
    db.prepare("INSERT INTO cliente (nome) VALUES ('A')").run()
    const [a] = ler(db, 'cliente')
    const N = a.sync_rev as number
    expect(ler(db, 'cliente', INICIO, N - 1)).toEqual([])
    expect(ler(db, 'cliente', INICIO, N)).toHaveLength(1)
  })

  it('toda tabela sincronizável gera SQL executável', () => {
    const db = banco()
    for (const t of TABELAS_SINCRONIZAVEIS) {
      expect(() => ler(db, t.nome, INICIO, 1_000_000, 10), t.nome).not.toThrow()
    }
  })
})
