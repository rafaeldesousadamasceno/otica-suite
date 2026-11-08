import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'
import { AppError } from '@main/errors'
import { receitaOpticaAtualizarSchema } from '@shared/ipc'

const { banco, permissao } = vi.hoisted(() => ({ banco: { db: null as DatabaseSync | null }, permissao: { negar: false } }))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))
vi.mock('@main/auth/session', async () => {
  const { Errors } = await import('@main/errors')
  return {
    requirePermissao: () => {
      if (permissao.negar) throw Errors.semPermissao()
      return { usuario: { id: 1, perfil: 'admin' } }
    }
  }
})

import { receitaOpticaService } from './receitaOpticaService'

function entrada(extra: Record<string, unknown> & { id: number; clienteId?: number }) {
  const base: Record<string, unknown> = { clienteId: 1, dataExame: '2026-11-07', adicao: '' }
  for (const lado of ['longeOd', 'longeOe', 'pertoOd', 'pertoOe']) {
    for (const campo of ['Esf', 'Cil', 'Eixo', 'Dnp']) base[`${lado}${campo}`] = ''
  }
  return receitaOpticaAtualizarSchema.parse({ ...base, ...extra })
}

function codigo(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (e) {
    return e instanceof AppError ? e.code : 'OUTRO'
  }
  return undefined
}

describe('receitaOpticaService.atualizar', () => {
  beforeEach(() => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    for (const m of MIGRATIONS) db.exec(m.sql)
    db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Ana', 'ana', 'x', 'admin')").run()
    db.prepare("INSERT INTO cliente (nome) VALUES ('Ana'), ('Bia')").run()
    db.prepare("INSERT INTO receita_optica (cliente_id, data_exame, longe_od_esf, versao) VALUES (1, '2026-11-01', -1, 1)").run()
    banco.db = db
    permissao.negar = false
  })

  it('corrige a receita e guarda o valor de antes na auditoria', () => {
    const r = receitaOpticaService.atualizar(entrada({ id: 1, longeOdEsf: '-1,75', profissionalNome: 'Dra. Lima' }))
    expect(r.longeOdEsf).toBe(-1.75)
    expect(r.profissionalNome).toBe('DRA. LIMA')
    expect(r.versao).toBe(1)

    const aud = banco.db!.prepare("SELECT acao, valor_anterior, valor_novo FROM auditoria WHERE entidade = 'receita_optica'").get() as {
      acao: string
      valor_anterior: string
      valor_novo: string
    }
    expect(aud.acao).toBe('ATUALIZAR')
    expect(JSON.parse(aud.valor_anterior).longeOdEsf).toBe(-1)
    expect(JSON.parse(aud.valor_novo).longeOdEsf).toBe(-1.75)
  })

  it('a adicao continua preenchendo o Perto em branco', () => {
    const r = receitaOpticaService.atualizar(entrada({ id: 1, longeOdEsf: '-1,00', adicao: '2' }))
    expect(r.pertoOdEsf).toBe(1)
  })

  it('nao deixa passar uma receita para outro cliente, nem editar o que nao existe', () => {
    expect(codigo(() => receitaOpticaService.atualizar(entrada({ id: 1, clienteId: 2 })))).toBe('VALIDACAO')
    expect(codigo(() => receitaOpticaService.atualizar(entrada({ id: 99 })))).toBe('NAO_ENCONTRADO')
  })

  it('exige permissao de edicao', () => {
    permissao.negar = true
    expect(codigo(() => receitaOpticaService.atualizar(entrada({ id: 1 })))).toBe('SEM_PERMISSAO')
  })
})
