import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'
import { registrarFuncoesSql } from '@main/db/funcoesSql'
import { AppError } from '@main/errors'
import {
  laboratorioInputSchema,
  ordemServicoAtualizarDatasSchema,
  ordemServicoCreateSchema
} from '@shared/ipc'

const { banco, permissao } = vi.hoisted(() => ({ banco: { db: null as DatabaseSync | null }, permissao: { negar: new Set<string>() } }))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))
vi.mock('@main/auth/session', async () => {
  const { Errors } = await import('@main/errors')
  return {
    requirePermissao: (recurso: string) => {
      if (permissao.negar.has(recurso)) throw Errors.semPermissao()
      return { usuario: { id: 1, perfil: 'admin' } }
    }
  }
})

import { laboratorioService } from './laboratorioService'
import { ordemServicoService } from './ordemServicoService'

const lab = (extra: Record<string, unknown> = {}) => laboratorioInputSchema.parse({ nome: 'Lab Visão', ...extra })

function codigo(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (e) {
    return e instanceof AppError ? e.code : 'OUTRO'
  }
  return undefined
}

function mensagem(fn: () => unknown): string {
  try {
    fn()
  } catch (e) {
    return e instanceof AppError ? e.message : 'OUTRO'
  }
  return ''
}

describe('laboratorioService', () => {
  beforeEach(() => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    registrarFuncoesSql(db)
    for (const m of MIGRATIONS) db.exec(m.sql)
    db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Ana', 'ana', 'x', 'admin')").run()
    db.prepare("INSERT INTO cliente (nome) VALUES ('Maria')").run()
    banco.db = db
    permissao.negar.clear()
  })

  describe('cadastro', () => {
    it('cria com todos os campos, em maiúsculas, com CNPJ e telefones só em dígitos', () => {
      const l = laboratorioService.criar(
        lab({
          nome: 'Lab Visão',
          razaoSocial: 'Visão Óptica Ltda',
          cnpj: '11.222.333/0001-81',
          telefone: '(85) 3333-4444',
          whatsapp: '(85) 9 9999-8888',
          email: 'contato@visao.com.br',
          endereco: 'Rua A, 10',
          contatoResponsavel: 'joão',
          prazoMedioDias: '7',
          observacoes: 'Entrega às terças'
        })
      )
      expect(l).toMatchObject({
        nome: 'LAB VISÃO', razaoSocial: 'VISÃO ÓPTICA LTDA', cnpj: '11222333000181', telefone: '8533334444', whatsapp: '85999998888',
        email: 'contato@visao.com.br', endereco: 'RUA A, 10', contatoResponsavel: 'JOÃO', prazoMedioDias: 7,
        observacoes: 'Entrega às terças', ativo: true, osVinculadas: 0
      })
      expect(banco.db!.prepare("SELECT acao FROM auditoria WHERE entidade = 'laboratorio'").get()).toEqual({ acao: 'CRIAR' })
    })

    it('só o nome é obrigatório', () => {
      expect(laboratorioInputSchema.safeParse({ nome: '' }).success).toBe(false)
      expect(laboratorioService.criar(lab({ nome: 'Lab Mínimo' })).cnpj).toBeNull()
    })

    it('valida CNPJ, telefone, e-mail e prazo', () => {
      const erro = (extra: Record<string, unknown>): string | undefined => {
        const r = laboratorioInputSchema.safeParse({ nome: 'X', ...extra })
        return r.success ? undefined : r.error.issues[0].message
      }
      expect(erro({ cnpj: '11.222.333/0001-82' })).toBe('CNPJ inválido')
      expect(erro({ telefone: '85999' })).toContain('Telefone')
      expect(erro({ whatsapp: '123' })).toContain('WhatsApp')
      expect(erro({ email: 'sem-arroba' })).toBe('E-mail inválido')
      expect(erro({ prazoMedioDias: '-1' })).toBe('O prazo vai de 0 a 365 dias')
      expect(erro({ prazoMedioDias: '1,5' })).toBe('O prazo vai de 0 a 365 dias')
      expect(erro({ cnpj: '', telefone: '', whatsapp: '', email: '', prazoMedioDias: '' })).toBeUndefined()
    })

    it('não repete o nome, nem com outra caixa', () => {
      laboratorioService.criar(lab())
      expect(codigo(() => laboratorioService.criar(lab({ nome: 'LAB VISÃO' })))).toBe('CONFLITO')
    })

    it('edita sem bater no próprio nome e guarda o valor de antes na auditoria', () => {
      const criado = laboratorioService.criar(lab())
      const l = laboratorioService.atualizar(criado.id, lab({ nome: 'Lab Visão', prazoMedioDias: 5 }))
      expect(l.prazoMedioDias).toBe(5)
      const aud = banco.db!.prepare("SELECT valor_anterior FROM auditoria WHERE acao = 'ATUALIZAR'").get() as { valor_anterior: string }
      expect(JSON.parse(aud.valor_anterior).prazoMedioDias).toBeNull()
      laboratorioService.criar(lab({ nome: 'Outro' }))
      expect(codigo(() => laboratorioService.atualizar(criado.id, lab({ nome: 'outro' })))).toBe('CONFLITO')
    })

    it('a lista acha por nome, razão social ou CNPJ, sem acento, e esconde inativos por padrão', () => {
      const a = laboratorioService.criar(lab({ nome: 'Lab Visão', razaoSocial: 'Visão Óptica', cnpj: '11222333000181' }))
      laboratorioService.criar(lab({ nome: 'Lab Zoom' }))
      laboratorioService.setAtivo(a.id, false)

      expect(laboratorioService.listar({}).map((x) => x.nome)).toEqual(['LAB ZOOM', 'LABORATÓRIO PRÓPRIO'])
      expect(laboratorioService.listar({ apenasAtivos: false, busca: 'visao' }).map((x) => x.nome)).toEqual(['LAB VISÃO'])
      expect(laboratorioService.listar({ apenasAtivos: false, busca: '11222333' }).map((x) => x.nome)).toEqual(['LAB VISÃO'])
      expect(laboratorioService.listar({ apenasAtivos: false, busca: 'optica' }).map((x) => x.nome)).toEqual(['LAB VISÃO'])
    })

    it('só o Administrador cadastra, edita, inativa e exclui; quem abre OS só vê a lista', () => {
      const l = laboratorioService.criar(lab())
      permissao.negar.add('laboratorios')
      expect(codigo(() => laboratorioService.criar(lab({ nome: 'Novo' })))).toBe('SEM_PERMISSAO')
      expect(codigo(() => laboratorioService.atualizar(l.id, lab()))).toBe('SEM_PERMISSAO')
      expect(codigo(() => laboratorioService.setAtivo(l.id, false))).toBe('SEM_PERMISSAO')
      expect(codigo(() => laboratorioService.excluir({ id: l.id }))).toBe('SEM_PERMISSAO')
      expect(laboratorioService.listar({}).length).toBeGreaterThan(0)
      permissao.negar.add('ordens_servico')
      expect(codigo(() => laboratorioService.listar({}))).toBe('SEM_PERMISSAO')
    })
  })

  describe('exclusão e inativação (RG-02)', () => {
    it('sem nenhuma OS, exclui de forma lógica e libera o nome', () => {
      const l = laboratorioService.criar(lab())
      laboratorioService.excluir({ id: l.id, motivo: 'cadastrado por engano' })
      expect(laboratorioService.listar({ apenasAtivos: false }).map((x) => x.nome)).not.toContain('LAB VISÃO')
      expect(banco.db!.prepare('SELECT excluido_em, excluido_motivo FROM laboratorio WHERE id = ?').get(l.id)).toMatchObject({ excluido_motivo: 'cadastrado por engano' })
      expect(laboratorioService.criar(lab()).nome).toBe('LAB VISÃO')
      expect(codigo(() => laboratorioService.excluir({ id: l.id }))).toBe('NAO_ENCONTRADO')
    })

    it('com OS (de qualquer situação, até cancelada), bloqueia e oferece inativar', () => {
      const l = laboratorioService.criar(lab())
      ordemServicoService.criar(ordemServicoCreateSchema.parse({ clienteId: 1, laboratorioId: l.id }))
      const os = ordemServicoService.listar({})[0]
      banco.db!.prepare("UPDATE ordem_servico SET situacao = 'CANCELADA' WHERE id = ?").run(os.id)

      expect(codigo(() => laboratorioService.excluir({ id: l.id }))).toBe('CONFLITO')
      const texto = mensagem(() => laboratorioService.excluir({ id: l.id }))
      expect(texto).toContain('1 ordem de serviço')
      expect(texto).toContain('Inativar')
      expect(laboratorioService.listar({ busca: 'visao' })).toHaveLength(1)
    })

    it('inativar tira das opções de OS nova mas a OS antiga continua mostrando o laboratório', () => {
      const l = laboratorioService.criar(lab())
      const os = ordemServicoService.criar(ordemServicoCreateSchema.parse({ clienteId: 1, laboratorioId: l.id }))
      laboratorioService.setAtivo(l.id, false)

      expect(laboratorioService.listar({}).map((x) => x.nome)).not.toContain('LAB VISÃO')
      expect(ordemServicoService.buscarPorId(os.id).laboratorio).toBe('LAB VISÃO')
      // OS nova com laboratorio inativo: recusa. Reativar volta a aceitar.
      expect(codigo(() => ordemServicoService.criar(ordemServicoCreateSchema.parse({ clienteId: 1, laboratorioId: l.id })))).toBe('VALIDACAO')
      laboratorioService.setAtivo(l.id, true)
      expect(ordemServicoService.criar(ordemServicoCreateSchema.parse({ clienteId: 1, laboratorioId: l.id })).laboratorioId).toBe(l.id)
    })
  })

  describe('na ordem de serviço', () => {
    const nova = (extra: Record<string, unknown> = {}) => ordemServicoCreateSchema.parse({ clienteId: 1, ...extra })

    it('grava o laboratório e o entregador (nome em maiúsculas, contato só dígitos)', () => {
      const l = laboratorioService.criar(lab())
      const os = ordemServicoService.criar(nova({ laboratorioId: l.id, entregadorNome: 'carlos moto', entregadorContato: '(85) 9 9999-8888' }))
      expect(os).toMatchObject({ laboratorio: 'LAB VISÃO', laboratorioId: l.id, entregadorNome: 'CARLOS MOTO', entregadorContato: '85999998888' })
    })

    it('laboratório e entregador são opcionais', () => {
      expect(ordemServicoService.criar(nova())).toMatchObject({ laboratorio: null, laboratorioId: null, entregadorNome: null, entregadorContato: null })
    })

    it('contato do entregador precisa de DDD e número', () => {
      expect(ordemServicoCreateSchema.safeParse({ clienteId: 1, entregadorContato: '12345' }).success).toBe(false)
    })

    it('laboratório que não existe', () => {
      expect(codigo(() => ordemServicoService.criar(nova({ laboratorioId: 999 })))).toBe('NAO_ENCONTRADO')
    })

    it('renomear o laboratório muda o nome mostrado nas OS dele', () => {
      const l = laboratorioService.criar(lab())
      const os = ordemServicoService.criar(nova({ laboratorioId: l.id }))
      laboratorioService.atualizar(l.id, lab({ nome: 'Lab Visão Nova' }))
      expect(ordemServicoService.buscarPorId(os.id).laboratorio).toBe('LAB VISÃO NOVA')
    })

    it('editar a OS: troca, mantém (campo ausente) ou tira o laboratório; mexe só no entregador', () => {
      const a = laboratorioService.criar(lab({ nome: 'Lab A' }))
      const b = laboratorioService.criar(lab({ nome: 'Lab B' }))
      const os = ordemServicoService.criar(nova({ laboratorioId: a.id }))
      const edicao = (extra: Record<string, unknown>) => ordemServicoAtualizarDatasSchema.parse({ id: os.id, ...extra })

      expect(ordemServicoService.atualizarDados(edicao({ laboratorioId: b.id })).laboratorio).toBe('LAB B')
      const soEntregador = ordemServicoService.atualizarDados(edicao({ entregadorNome: 'Zé', entregadorContato: '8533334444' }))
      expect(soEntregador).toMatchObject({ laboratorio: 'LAB B', entregadorNome: 'ZÉ', entregadorContato: '8533334444' })
      // Sem informar entregador, ele continua.
      expect(ordemServicoService.atualizarDados(edicao({ observacao: 'x' }))).toMatchObject({ entregadorNome: 'ZÉ', laboratorio: 'LAB B' })
      // Apagar o nome do entregador limpa; null no laboratorio tira.
      expect(ordemServicoService.atualizarDados(edicao({ laboratorioId: null, entregadorNome: '', entregadorContato: '' }))).toMatchObject({
        laboratorio: null, laboratorioId: null, entregadorNome: null, entregadorContato: null
      })
    })

    it('uma OS pode manter o laboratório que foi inativado depois, mas não trocar para outro inativo', () => {
      const a = laboratorioService.criar(lab({ nome: 'Lab A' }))
      const b = laboratorioService.criar(lab({ nome: 'Lab B' }))
      const os = ordemServicoService.criar(nova({ laboratorioId: a.id }))
      laboratorioService.setAtivo(a.id, false)
      laboratorioService.setAtivo(b.id, false)
      const edicao = (extra: Record<string, unknown>) => ordemServicoAtualizarDatasSchema.parse({ id: os.id, ...extra })

      expect(ordemServicoService.atualizarDados(edicao({ laboratorioId: a.id, observacao: 'ok' })).laboratorioId).toBe(a.id)
      expect(codigo(() => ordemServicoService.atualizarDados(edicao({ laboratorioId: b.id })))).toBe('VALIDACAO')
    })

    it('OS antiga só com o texto do laboratório continua mostrando o texto', () => {
      banco.db!.prepare("INSERT INTO ordem_servico (numero, cliente_id, laboratorio) VALUES ('OS-X', 1, 'Lab de Antes')").run()
      const os = ordemServicoService.listar({}).find((o) => o.numero === 'OS-X')!
      expect(os).toMatchObject({ laboratorio: 'Lab de Antes', laboratorioId: null })
    })
  })
})
