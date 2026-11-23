import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'
import { AppError } from '@main/errors'
import { receitaExcluirSchema, receitaOpticaAtualizarSchema, receitaOpticaInputSchema } from '@shared/ipc'

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

/** Uma prescricao valida (OD com cilindro, OE sem), com o que o teste quiser trocar. */
function dados(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    clienteId: 1,
    dataExame: '2026-11-07',
    longeOdEsf: -1, longeOdCil: -0.5, longeOdEixo: 90, longeOdDnp: 31.5, longeOdAlt: '', longeOdPrisma: 0, longeOdBasePrisma: 'NENHUM', adicaoOd: 2, pertoOdDnp: '',
    longeOeEsf: 0, longeOeCil: 0, longeOeEixo: '', longeOeDnp: 32, longeOeAlt: '', longeOePrisma: 0, longeOeBasePrisma: 'NENHUM', adicaoOe: 2, pertoOeDnp: '',
    ponte: '', horizontal: '', vertical: '', diagonalMaior: '',
    ...extra
  }
}
const nova = (extra: Record<string, unknown> = {}) => receitaOpticaInputSchema.parse(dados(extra))
const edicao = (id: number, extra: Record<string, unknown> = {}) => receitaOpticaAtualizarSchema.parse({ ...dados(extra), id })

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

describe('receitaOpticaService', () => {
  beforeEach(() => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    for (const m of MIGRATIONS) db.exec(m.sql)
    db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Ana', 'ana', 'x', 'admin')").run()
    db.prepare("INSERT INTO cliente (nome) VALUES ('Ana'), ('Bia')").run()
    banco.db = db
    permissao.negar = false
  })

  describe('criar', () => {
    it('grava e devolve com o Perto calculado e a DP somada', () => {
      const r = receitaOpticaService.criar(nova({ profissionalNome: 'Dra. Lima' }))
      expect(r.versao).toBe(1)
      expect(r.profissionalNome).toBe('DRA. LIMA')
      expect([r.pertoOdEsf, r.pertoOdCil, r.pertoOdEixo]).toEqual([1, -0.5, 90])
      expect(r.dpLonge).toBe(63.5)
      expect(banco.db!.prepare("SELECT acao FROM auditoria WHERE entidade = 'receita_optica'").get()).toEqual({ acao: 'CRIAR' })
    })

    it('a DNP é obrigatória nos dois olhos', () => {
      expect(codigo(() => receitaOpticaService.criar(nova({ longeOdDnp: '' })))).toBe('VALIDACAO')
      expect(mensagem(() => receitaOpticaService.criar(nova({ longeOeDnp: '' })))).toBe('Esquerdo: informe a DNP (obrigatória)')
    })

    it('eixo é obrigatório com cilindro; sem cilindro o eixo é descartado', () => {
      expect(mensagem(() => receitaOpticaService.criar(nova({ longeOdEixo: '' })))).toContain('o eixo, ele é obrigatório')
      const r = receitaOpticaService.criar(nova({ longeOeCil: 0, longeOeEixo: 120 }))
      expect(r.longeOeEixo).toBeNull()
    })

    it('prisma exige a base; sem prisma a base volta para "Nenhum"', () => {
      expect(mensagem(() => receitaOpticaService.criar(nova({ longeOdPrisma: 2, longeOdBasePrisma: 'NENHUM' })))).toBe('Direito: escolha a base do prisma')
      expect(receitaOpticaService.criar(nova({ longeOdPrisma: 2, longeOdBasePrisma: 'NASAL' })).longeOdBasePrisma).toBe('NASAL')
      expect(receitaOpticaService.criar(nova({ longeOdPrisma: 0, longeOdBasePrisma: 'NASAL' })).longeOdBasePrisma).toBe('NENHUM')
    })

    it('medida da armação fora da grade impede salvar; vazia é permitida', () => {
      expect(mensagem(() => receitaOpticaService.criar(nova({ ponte: 9 })))).toBe('⚠ Valor fora da grade — Ponte: a grade permitida é de 10 a 35')
      expect(receitaOpticaService.criar(nova({ ponte: 18 })).ponte).toBe(18)
    })

    it('cliente que não existe', () => {
      expect(codigo(() => receitaOpticaService.criar(nova({ clienteId: 99 })))).toBe('NAO_ENCONTRADO')
    })

    it('exige permissão de criação', () => {
      permissao.negar = true
      expect(codigo(() => receitaOpticaService.criar(nova()))).toBe('SEM_PERMISSAO')
    })
  })

  describe('atualizar', () => {
    it('corrige a prescrição e guarda o valor de antes na auditoria', () => {
      const criada = receitaOpticaService.criar(nova())
      const r = receitaOpticaService.atualizar(edicao(criada.id, { longeOdEsf: -1.75, adicaoOd: 1.5 }))
      expect(r.longeOdEsf).toBe(-1.75)
      expect(r.pertoOdEsf).toBe(-0.25) // -1,75 + 1,50
      expect(r.versao).toBe(1)

      const aud = banco.db!.prepare("SELECT acao, valor_anterior, valor_novo FROM auditoria WHERE entidade = 'receita_optica' AND acao = 'ATUALIZAR'").get() as {
        valor_anterior: string
        valor_novo: string
      }
      expect(JSON.parse(aud.valor_anterior).longeOdEsf).toBe(-1)
      expect(JSON.parse(aud.valor_novo).longeOdEsf).toBe(-1.75)
    })

    it('a adição de cada olho é independente e só mexe no esférico de perto', () => {
      const criada = receitaOpticaService.criar(nova({ longeOeEsf: -2, adicaoOd: 2, adicaoOe: 1 }))
      expect([criada.pertoOdEsf, criada.pertoOeEsf]).toEqual([1, -1])
      expect([criada.pertoOdCil, criada.pertoOdEixo]).toEqual([-0.5, 90])
    })

    it('não passa a prescrição para outro cliente, nem edita o que não existe', () => {
      const criada = receitaOpticaService.criar(nova())
      expect(codigo(() => receitaOpticaService.atualizar(edicao(criada.id, { clienteId: 2 })))).toBe('VALIDACAO')
      expect(codigo(() => receitaOpticaService.atualizar(edicao(99)))).toBe('NAO_ENCONTRADO')
    })

    it('valida do mesmo jeito que ao criar', () => {
      const criada = receitaOpticaService.criar(nova())
      expect(codigo(() => receitaOpticaService.atualizar(edicao(criada.id, { longeOdDnp: '' })))).toBe('VALIDACAO')
    })

    it('exige permissão de edição', () => {
      const criada = receitaOpticaService.criar(nova())
      permissao.negar = true
      expect(codigo(() => receitaOpticaService.atualizar(edicao(criada.id)))).toBe('SEM_PERMISSAO')
    })
  })

  describe('excluir', () => {
    it('exclui de forma lógica, registra na auditoria e some da lista', () => {
      const criada = receitaOpticaService.criar(nova())
      receitaOpticaService.excluir(receitaExcluirSchema.parse({ id: criada.id, motivo: ' lançada por engano ' }))

      expect(receitaOpticaService.listarPorCliente(1)).toEqual([])
      const aud = banco.db!.prepare("SELECT valor_novo FROM auditoria WHERE acao = 'EXCLUIR'").get() as { valor_novo: string }
      expect(JSON.parse(aud.valor_novo)).toEqual({ motivo: 'lançada por engano' })
      expect(codigo(() => receitaOpticaService.excluir({ id: criada.id }))).toBe('NAO_ENCONTRADO')
    })

    it('bloqueia se há OS ou venda vinculada e diz quais são', () => {
      const criada = receitaOpticaService.criar(nova())
      const db = banco.db!
      db.prepare("INSERT INTO ordem_servico (numero, cliente_id, receita_optica_id, situacao) VALUES ('2026-00012', 1, ?, 'EM ABERTO')").run(criada.id)
      db.prepare("INSERT INTO venda (numero, cliente_id, vendedor_id, receita_optica_id, total_centavos) VALUES ('2026-00034', 1, 1, ?, 100)").run(criada.id)

      const texto = mensagem(() => receitaOpticaService.excluir({ id: criada.id }))
      expect(codigo(() => receitaOpticaService.excluir({ id: criada.id }))).toBe('CONFLITO')
      expect(texto).toContain('OS 2026-00012 (em aberto)')
      expect(texto).toContain('Venda 2026-00034 (concluida)')
      expect(receitaOpticaService.listarPorCliente(1)).toHaveLength(1)
    })

    it('com a OS cancelada, a exclusão é permitida', () => {
      const criada = receitaOpticaService.criar(nova())
      banco.db!.prepare("INSERT INTO ordem_servico (numero, cliente_id, receita_optica_id, situacao) VALUES ('OS-1', 1, ?, 'CANCELADA')").run(criada.id)
      receitaOpticaService.excluir({ id: criada.id })
      expect(receitaOpticaService.listarPorCliente(1)).toEqual([])
    })

    it('exige permissão de exclusão', () => {
      const criada = receitaOpticaService.criar(nova())
      permissao.negar = true
      expect(codigo(() => receitaOpticaService.excluir({ id: criada.id }))).toBe('SEM_PERMISSAO')
    })
  })
})
