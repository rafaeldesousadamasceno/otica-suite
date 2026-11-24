import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'
import { executarCiclo, type DepsCiclo } from './cicloEnvio'
import type { ClienteNuvem } from './clienteNuvem'
import type { EstadoNuvem } from './estadoNuvem'

type Upsert = { tipo: 'upsert'; tabela: string; linhas: Record<string, unknown>[]; recebidoEm: string }
type Chamada = Upsert | { tipo: 'apagar'; tabela: string; uuids: string[] } | { tipo: 'varrer'; tabelas: string[]; antesDe: string }

function banco(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS) db.exec(m.sql)
  return db
}

function clienteFalso(falharNoUpsert?: number): { cliente: ClienteNuvem; chamadas: Chamada[] } {
  const chamadas: Chamada[] = []
  let upserts = 0
  const cliente: ClienteNuvem = {
    async upsert(tabela, linhas, recebidoEm) {
      upserts++
      if (falharNoUpsert === upserts) throw new Error('sem internet')
      chamadas.push({ tipo: 'upsert', tabela, linhas, recebidoEm })
    },
    async apagar(tabela, uuids) {
      chamadas.push({ tipo: 'apagar', tabela, uuids })
    },
    async varrer(tabelas, antesDe) {
      chamadas.push({ tipo: 'varrer', tabelas, antesDe })
    },
    async gravarPainel() {}
  }
  return { cliente, chamadas }
}

function montar(db: DatabaseSync, cliente: ClienteNuvem, inicial: EstadoNuvem, extra: Partial<DepsCiclo> = {}) {
  const estado = { atual: inicial, gravacoes: 0 }
  const deps: DepsCiclo = {
    db,
    cliente,
    lerEstado: () => estado.atual,
    gravarEstado: (e) => {
      estado.atual = e
      estado.gravacoes++
    },
    fingerprint: 'fp',
    agora: () => new Date('2026-01-01T00:00:00.000Z'),
    ...extra
  }
  return { deps, estado }
}

const contador = (db: DatabaseSync): number => (db.prepare('SELECT valor FROM sync_contador').get() as { valor: number }).valor
const novoCliente = (db: DatabaseSync, nome: string): void => {
  db.prepare('INSERT INTO cliente (nome) VALUES (?)').run(nome)
}
const upserts = (c: Chamada[], tabela?: string): Upsert[] =>
  c.filter((x): x is Upsert => x.tipo === 'upsert' && (!tabela || x.tabela === tabela))
const qtdExclusoes = (db: DatabaseSync): number => (db.prepare('SELECT COUNT(*) AS n FROM sync_exclusao').get() as { n: number }).n

describe('executarCiclo', () => {
  it('primeiro ciclo envia tudo, faz varredura e grava o cursor', async () => {
    const db = banco()
    novoCliente(db, 'Ana')
    const { cliente, chamadas } = clienteFalso()
    const { deps, estado } = montar(db, cliente, { fingerprint: 'fp', cursor: 0 })
    const r = await executarCiclo(deps)
    expect(r.varredura).toBe(true)
    expect(r.enviados).toBeGreaterThan(0)
    expect(r.cursor).toBe(contador(db))
    expect(estado.atual).toEqual({ fingerprint: 'fp', cursor: contador(db) })
    expect(upserts(chamadas, 'cliente')[0].linhas).toHaveLength(1)
    expect(chamadas.filter((c) => c.tipo === 'varrer')).toHaveLength(1)
  })

  it('ciclo sem mudanças não envia nada e não varre', async () => {
    const db = banco()
    novoCliente(db, 'Ana')
    const { deps, estado } = montar(db, clienteFalso().cliente, { fingerprint: 'fp', cursor: 0 })
    await executarCiclo(deps)
    const { cliente, chamadas } = clienteFalso()
    const r = await executarCiclo({ ...deps, cliente })
    expect(r).toMatchObject({ enviados: 0, excluidos: 0, varredura: false, cursor: estado.atual.cursor })
    expect(chamadas).toEqual([])
  })

  it('envia só o que mudou depois do cursor', async () => {
    const db = banco()
    novoCliente(db, 'Ana')
    novoCliente(db, 'Bia')
    const { deps } = montar(db, clienteFalso().cliente, { fingerprint: 'fp', cursor: 0 })
    await executarCiclo(deps)
    db.prepare("UPDATE cliente SET nome = 'Ana Maria' WHERE nome = 'Ana'").run()
    const { cliente, chamadas } = clienteFalso()
    const r = await executarCiclo({ ...deps, cliente })
    expect(r.varredura).toBe(false)
    const u = upserts(chamadas)
    expect(u).toHaveLength(1)
    expect(u[0].tabela).toBe('cliente')
    expect(u[0].linhas).toHaveLength(1)
    expect(u[0].linhas[0].nome).toBe('Ana Maria')
  })

  it('exclusão vira apagar e limpa sync_exclusao', async () => {
    const db = banco()
    novoCliente(db, 'Ana')
    const { deps } = montar(db, clienteFalso().cliente, { fingerprint: 'fp', cursor: 0 })
    await executarCiclo(deps)
    const { uuid } = db.prepare("SELECT uuid FROM cliente WHERE nome = 'Ana'").get() as { uuid: string }
    db.prepare("DELETE FROM cliente WHERE nome = 'Ana'").run()
    expect(qtdExclusoes(db)).toBeGreaterThan(0)
    const { cliente, chamadas } = clienteFalso()
    const r = await executarCiclo({ ...deps, cliente })
    expect(r.excluidos).toBe(1)
    expect(chamadas).toContainEqual({ tipo: 'apagar', tabela: 'cliente', uuids: [uuid] })
    expect(qtdExclusoes(db)).toBe(0)
  })

  it('internet cai no meio: cursor e exclusões ficam, e retomar não duplica', async () => {
    const db = banco()
    for (let i = 0; i < 5; i++) novoCliente(db, `C${i}`)
    const { deps, estado } = montar(db, clienteFalso().cliente, { fingerprint: 'fp', cursor: 0 }, { tamanhoLote: 2 })
    await executarCiclo(deps)
    db.prepare("DELETE FROM cliente WHERE nome = 'C0'").run()
    for (let i = 5; i < 10; i++) novoCliente(db, `C${i}`)
    const antes = { ...estado.atual }
    const exclusoesAntes = db.prepare('SELECT * FROM sync_exclusao').all()

    const ruim = clienteFalso(2)
    await expect(executarCiclo({ ...deps, cliente: ruim.cliente })).rejects.toThrow('sem internet')
    expect(estado.atual).toEqual(antes)
    expect(db.prepare('SELECT * FROM sync_exclusao').all()).toEqual(exclusoesAntes)

    const bom = clienteFalso()
    await executarCiclo({ ...deps, cliente: bom.cliente })
    const chaves = upserts(bom.chamadas).flatMap((c) => c.linhas.map((l) => `${c.tabela}/${String(l.uuid)}`))
    expect(new Set(chaves).size).toBe(chaves.length)
    const nomes = upserts(bom.chamadas, 'cliente').flatMap((c) => c.linhas.map((l) => String(l.nome)))
    expect(nomes.sort()).toEqual(['C5', 'C6', 'C7', 'C8', 'C9'])
    expect(bom.chamadas.filter((c) => c.tipo === 'apagar')).toHaveLength(1)
    expect(estado.atual.cursor).toBe(contador(db))
    expect(qtdExclusoes(db)).toBe(0)
  })

  it('backup restaurado (cursor maior que o contador): reenvia tudo com varredura', async () => {
    const db = banco()
    novoCliente(db, 'Ana')
    const { cliente, chamadas } = clienteFalso()
    const { deps, estado } = montar(db, cliente, { fingerprint: 'fp', cursor: contador(db) + 1000 })
    const r = await executarCiclo(deps)
    expect(r.varredura).toBe(true)
    expect(upserts(chamadas, 'cliente')[0].linhas).toHaveLength(1)
    expect(chamadas.some((c) => c.tipo === 'varrer')).toBe(true)
    expect(estado.atual.cursor).toBe(contador(db))
  })

  it('mais de 500 linhas viram vários lotes', async () => {
    const db = banco()
    db.exec('BEGIN')
    const ins = db.prepare('INSERT INTO cliente (nome) VALUES (?)')
    for (let i = 0; i < 1200; i++) ins.run(`C${i}`)
    db.exec('COMMIT')
    const { cliente, chamadas } = clienteFalso()
    const { deps } = montar(db, cliente, { fingerprint: 'fp', cursor: 0 })
    await executarCiclo(deps)
    expect(upserts(chamadas, 'cliente').map((l) => l.linhas.length)).toEqual([500, 500, 200])
  })

  it('nenhum corpo enviado contém segredo', async () => {
    const db = banco()
    db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('A', 'a', 'segredo-hash', 'admin')").run()
    const cfg = db.prepare('INSERT OR REPLACE INTO configuracao (chave, valor) VALUES (?, ?)')
    for (const k of ['licenca_local', 'sync_dispositivo_id', 'nuvem_ligada', 'nuvem_consentimento']) cfg.run(k, 'valor-local')
    novoCliente(db, 'Ana')
    const { cliente, chamadas } = clienteFalso()
    const { deps } = montar(db, cliente, { fingerprint: 'fp', cursor: 0 })
    await executarCiclo(deps)
    const texto = JSON.stringify(chamadas)
    expect(texto).toContain('"login"')
    for (const proibido of [
      'senha_hash',
      'segredo-hash',
      'tentativas_login',
      'bloqueado_ate',
      'ultimo_acesso',
      'licenca_local',
      'sync_dispositivo_id',
      'nuvem_ligada',
      'nuvem_consentimento'
    ]) {
      expect(texto, proibido).not.toContain(proibido)
    }
  })

  it('a varredura só roda depois de enviar tudo', async () => {
    const db = banco()
    novoCliente(db, 'Ana')
    const { cliente, chamadas } = clienteFalso()
    const { deps } = montar(db, cliente, { fingerprint: 'fp', cursor: 0 })
    await executarCiclo(deps)
    const iVarrer = chamadas.findIndex((c) => c.tipo === 'varrer')
    expect(iVarrer).toBe(chamadas.length - 1)
    expect(chamadas.slice(0, iVarrer).every((c) => c.tipo === 'upsert')).toBe(true)
  })
})
