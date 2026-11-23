import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'
import { produtoInputSchema } from '@shared/ipc'

const { banco } = vi.hoisted(() => ({ banco: { db: null as DatabaseSync | null } }))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))
vi.mock('@main/auth/session', () => {
  const sessao = { usuario: { id: 1, perfil: 'admin' } }
  return { requireSessao: () => sessao, requirePermissao: () => sessao }
})

import { produtoService } from './produtoService'

const lente = (extra: Record<string, unknown> = {}) =>
  produtoInputSchema.parse({
    descricao: 'Lente CR-39 1.56', categoria: 'lente', unidade: 'PAR', custoCentavos: '0', margem: '0', precoVendaCentavos: '100',
    lenteMaterial: 'resina', lenteIndice: '1,56', lenteTipo: 'visão simples', ...extra
  })

describe('produto lente: grau mínimo e máximo gravados', () => {
  beforeEach(() => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    for (const m of MIGRATIONS) db.exec(m.sql)
    db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Ana', 'ana', 'x', 'admin')").run()
    banco.db = db
  })

  it('grava e lê a faixa de grau da lente', () => {
    const p = produtoService.criar(lente({ lenteGrauMin: '-6,00', lenteGrauMax: 4 }))
    expect([p.lenteGrauMin, p.lenteGrauMax]).toEqual([-6, 4])
  })

  it('edita a faixa e permite esvaziar um dos lados', () => {
    const p = produtoService.criar(lente({ lenteGrauMin: -6, lenteGrauMax: 4 }))
    const e = produtoService.atualizar(p.id, lente({ lenteGrauMin: -8, lenteGrauMax: '' }))
    expect([e.lenteGrauMin, e.lenteGrauMax]).toEqual([-8, null])
  })

  it('só lente guarda grau: ao mudar a categoria os dados da lente são retirados', () => {
    const p = produtoService.criar(lente({ lenteGrauMin: -6, lenteGrauMax: 4 }))
    const e = produtoService.atualizar(p.id, produtoInputSchema.parse({ descricao: 'Estojo', categoria: 'acessorio', unidade: 'UN', custoCentavos: '0', margem: '0', precoVendaCentavos: '10', lenteGrauMin: -6, lenteGrauMax: 4 }))
    expect([e.lenteGrauMin, e.lenteGrauMax]).toEqual([null, null])
  })
})
