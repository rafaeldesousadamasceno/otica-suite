import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'
import { receitaOpticaInputSchema } from '@shared/ipc'

// SQLite em memoria com as migracoes REAIS: o que se testa e que a 008 nao
// mexe nas receitas antigas e que o DP faz ida e volta pelo repositorio.
const { banco } = vi.hoisted(() => ({ banco: { db: null as DatabaseSync | null } }))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))

import { receitaOpticaRepository } from './receitaOpticaRepository'

function payload(extra: Record<string, unknown>): ReturnType<typeof receitaOpticaInputSchema.parse> {
  const base: Record<string, unknown> = { clienteId: 1, dataExame: '2026-11-07', adicao: '' }
  for (const lado of ['longeOd', 'longeOe', 'pertoOd', 'pertoOe']) {
    for (const campo of ['Esf', 'Cil', 'Eixo', 'Dnp']) base[`${lado}${campo}`] = ''
  }
  return receitaOpticaInputSchema.parse({ ...base, ...extra })
}

describe('receitaOpticaRepository + migracao 008 (DP)', () => {
  beforeEach(() => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    for (const m of MIGRATIONS.filter((m) => m.version < 8)) db.exec(m.sql)
    db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Ana', 'ana', 'x', 'admin')").run()
    db.prepare("INSERT INTO cliente (nome) VALUES ('Cliente')").run()
    banco.db = db
  })

  it('receita antiga com altura continua igual depois da migracao 008, com DP nulo', () => {
    const db = banco.db!
    db.prepare(
      `INSERT INTO receita_optica (cliente_id, data_exame, longe_od_esf, longe_od_dnp, altura, versao)
       VALUES (1, '2025-01-10', -1.25, 31.5, 18, 1)`
    ).run()

    for (const m of MIGRATIONS.filter((m) => m.version === 8)) db.exec(m.sql)

    const [r] = receitaOpticaRepository.listarPorCliente(1)
    expect(r.longeOdEsf).toBe(-1.25)
    expect(r.longeOdDnp).toBe(31.5)
    expect(r.altura).toBe(18)
    expect([r.longeOdDp, r.longeOeDp, r.pertoOdDp, r.pertoOeDp]).toEqual([null, null, null, null])
  })

  it('grava e le o DP de longe e perto, nos dois olhos', () => {
    for (const m of MIGRATIONS.filter((m) => m.version === 8)) banco.db!.exec(m.sql)

    const id = receitaOpticaRepository.criar(
      payload({ longeOdDnp: '31,5', longeOdDp: '32', longeOeDp: '31,5', pertoOdDp: '30', pertoOeDp: '29,5' }),
      null,
      1,
      1
    )
    const r = receitaOpticaRepository.buscarPorId(id)!
    expect([r.longeOdDp, r.longeOeDp, r.pertoOdDp, r.pertoOeDp]).toEqual([32, 31.5, 30, 29.5])
    expect(r.longeOdDnp).toBe(31.5)
    expect(r.altura).toBeNull()
  })

  it('payload sem DP grava DP nulo', () => {
    for (const m of MIGRATIONS.filter((m) => m.version === 8)) banco.db!.exec(m.sql)

    const id = receitaOpticaRepository.criar(payload({}), null, 1, 1)
    const r = receitaOpticaRepository.buscarPorId(id)!
    expect([r.longeOdDp, r.longeOeDp, r.pertoOdDp, r.pertoOeDp]).toEqual([null, null, null, null])
  })
})

describe('receitaOpticaRepository.atualizar', () => {
  beforeEach(() => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    for (const m of MIGRATIONS) db.exec(m.sql)
    db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Ana', 'ana', 'x', 'admin')").run()
    db.prepare("INSERT INTO cliente (nome) VALUES ('Cliente')").run()
    banco.db = db
  })

  it('corrige os campos no mesmo registro e mantem versao, cliente e altura legada', () => {
    banco.db!.prepare(
      `INSERT INTO receita_optica (cliente_id, data_exame, longe_od_esf, altura, versao) VALUES (1, '2025-01-10', -1.25, 18, 3)`
    ).run()
    const id = Number((banco.db!.prepare('SELECT last_insert_rowid() AS id').get() as { id: number }).id)

    const ok = receitaOpticaRepository.atualizar(
      { ...payload({ longeOdEsf: '-2,00', longeOdDp: '32', armacao: 'preta', observacao: 'corrigida' }), id },
      null
    )

    expect(ok).toBe(true)
    const r = receitaOpticaRepository.buscarPorId(id)!
    expect(r.longeOdEsf).toBe(-2)
    expect(r.longeOdDp).toBe(32)
    expect(r.armacao).toBe('PRETA')
    expect(r.observacao).toBe('corrigida')
    expect(r.dataExame).toBe('2026-11-07')
    expect(r.versao).toBe(3)
    expect(r.altura).toBe(18)
  })

  it('campo apagado vira nulo e id inexistente devolve false', () => {
    const id = receitaOpticaRepository.criar(payload({ longeOdEsf: '-1,00', tipoLente: 'X' }), null, 1, 1)
    receitaOpticaRepository.atualizar({ ...payload({}), id }, null)
    const r = receitaOpticaRepository.buscarPorId(id)!
    expect(r.longeOdEsf).toBeNull()
    expect(r.tipoLente).toBeNull()
    expect(receitaOpticaRepository.atualizar({ ...payload({}), id: 9999 }, null)).toBe(false)
  })
})
