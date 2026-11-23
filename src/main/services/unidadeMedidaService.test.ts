import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'
import { AppError } from '@main/errors'
import { produtoInputSchema, unidadeMedidaInputSchema, unidadeMedidaUpdateSchema } from '@shared/ipc'

const { banco, permissao } = vi.hoisted(() => ({ banco: { db: null as DatabaseSync | null }, permissao: { negar: false } }))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))
vi.mock('@main/auth/session', async () => {
  const { Errors } = await import('@main/errors')
  const sessao = { usuario: { id: 1, perfil: 'admin' } }
  return {
    requireSessao: () => sessao,
    requirePermissao: () => {
      if (permissao.negar) throw Errors.semPermissao()
      return sessao
    }
  }
})

import { unidadeMedidaService } from './unidadeMedidaService'
import { produtoService } from './produtoService'

const nova = (sigla: string, descricao: string) => unidadeMedidaInputSchema.parse({ sigla, descricao })

function codigo(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (e) {
    return e instanceof AppError ? e.code : 'OUTRO'
  }
  return undefined
}

const idDe = (sigla: string): number => unidadeMedidaService.listar().find((u) => u.sigla === sigla)!.id

const produto = (unidade: string) =>
  produtoInputSchema.parse({ descricao: 'Estojo', categoria: 'acessorio', unidade, custoCentavos: '0', margem: '0', precoVendaCentavos: '10' })

describe('unidadeMedidaService', () => {
  beforeEach(() => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    for (const m of MIGRATIONS) db.exec(m.sql)
    db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Ana', 'ana', 'x', 'admin')").run()
    banco.db = db
    permissao.negar = false
  })

  it('cadastra no fim da lista, em maiúsculas, e registra na auditoria', () => {
    const u = unidadeMedidaService.criar(nova('fr', 'frasco'))
    expect(u).toMatchObject({ sigla: 'FR', descricao: 'FRASCO', ativo: true, produtos: 0 })
    expect(unidadeMedidaService.listar().map((x) => x.sigla)).toEqual(['UN', 'PAR', 'CX', 'KIT', 'FR'])

    const aud = banco.db!.prepare("SELECT acao FROM auditoria WHERE entidade = 'unidade_medida'").get() as { acao: string }
    expect(aud.acao).toBe('CRIAR')
  })

  it('não repete sigla já cadastrada, nem com outra caixa', () => {
    expect(codigo(() => unidadeMedidaService.criar(nova('cx', 'caixinha')))).toBe('CONFLITO')
  })

  it('sigla desativada volta a ficar ativa com a descrição nova, sem duplicar', () => {
    unidadeMedidaService.setAtivo(idDe('KIT'), false)
    const u = unidadeMedidaService.criar(nova('kit', 'kit limpeza'))
    expect(u).toMatchObject({ sigla: 'KIT', descricao: 'KIT LIMPEZA', ativo: true })
    expect(unidadeMedidaService.listar().filter((x) => x.sigla === 'KIT')).toHaveLength(1)
  })

  it('sigla só com letras e números, até 6 caracteres', () => {
    expect(unidadeMedidaInputSchema.safeParse({ sigla: 'C X', descricao: 'Caixa' }).success).toBe(false)
    expect(unidadeMedidaInputSchema.safeParse({ sigla: 'UN.', descricao: 'Unidade' }).success).toBe(false)
    expect(unidadeMedidaInputSchema.safeParse({ sigla: 'ABCDEFG', descricao: 'Longa' }).success).toBe(false)
    expect(unidadeMedidaInputSchema.safeParse({ sigla: 'FR', descricao: '' }).success).toBe(false)
    expect(unidadeMedidaInputSchema.parse({ sigla: 'pç', descricao: 'peça' })).toEqual({ sigla: 'PÇ', descricao: 'PEÇA' })
  })

  it('edita só a descrição; id de outra lista não é unidade', () => {
    const u = unidadeMedidaService.atualizar(unidadeMedidaUpdateSchema.parse({ id: idDe('CX'), descricao: 'caixa com 6' }))
    expect(u).toMatchObject({ sigla: 'CX', descricao: 'CAIXA COM 6' })

    const outra = banco.db!.prepare("SELECT id FROM lista_valor WHERE tipo = 'forma_pagamento' LIMIT 1").get() as { id: number }
    expect(codigo(() => unidadeMedidaService.atualizar({ id: outra.id, descricao: 'X' }))).toBe('NAO_ENCONTRADO')
  })

  it('UN não pode ser desativada; as outras sim', () => {
    expect(codigo(() => unidadeMedidaService.setAtivo(idDe('UN'), false))).toBe('VALIDACAO')
    unidadeMedidaService.setAtivo(idDe('CX'), false)
    expect(unidadeMedidaService.listar().find((u) => u.sigla === 'CX')?.ativo).toBe(false)
  })

  it('a lista traz quantos produtos usam cada unidade', () => {
    produtoService.criar(produto('PAR'))
    produtoService.criar(produto('PAR'))
    const lista = unidadeMedidaService.listar()
    expect(lista.find((u) => u.sigla === 'PAR')?.produtos).toBe(2)
    expect(lista.find((u) => u.sigla === 'UN')?.produtos).toBe(0)
  })

  it('sem permissão não cadastra', () => {
    permissao.negar = true
    expect(codigo(() => unidadeMedidaService.criar(nova('FR', 'Frasco')))).toBe('SEM_PERMISSAO')
  })
})

describe('produto só usa unidade da lista', () => {
  beforeEach(() => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    for (const m of MIGRATIONS) db.exec(m.sql)
    db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Ana', 'ana', 'x', 'admin')").run()
    banco.db = db
    permissao.negar = false
  })

  it('aceita unidade cadastrada (gravada em maiúsculas) e recusa a que não está na lista', () => {
    expect(produtoService.criar(produto('cx')).unidade).toBe('CX')
    expect(codigo(() => produtoService.criar(produto('GARRAFA')))).toBe('VALIDACAO')
  })

  it('recusa unidade desativada em produto novo', () => {
    unidadeMedidaService.setAtivo(idDe('KIT'), false)
    expect(codigo(() => produtoService.criar(produto('KIT')))).toBe('VALIDACAO')
  })

  it('produto antigo com unidade desativada continua podendo ser editado, mas não troca para outra desativada', () => {
    const p = produtoService.criar(produto('KIT'))
    unidadeMedidaService.setAtivo(idDe('KIT'), false)
    unidadeMedidaService.setAtivo(idDe('CX'), false)

    expect(produtoService.atualizar(p.id, { ...produto('KIT'), descricao: 'ESTOJO NOVO' }).unidade).toBe('KIT')
    expect(codigo(() => produtoService.atualizar(p.id, produto('CX')))).toBe('VALIDACAO')
    expect(produtoService.atualizar(p.id, produto('PAR')).unidade).toBe('PAR')
  })
})
