import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'
import { registrarFuncoesSql } from '@main/db/funcoesSql'
import { AppError } from '@main/errors'
import { bandeiraInputSchema, formaPagamentoInputSchema } from '@shared/ipc'

const { banco, sessao } = vi.hoisted(() => ({
  banco: { db: null as DatabaseSync | null },
  sessao: { usuario: { id: 1, login: 'ana', perfil: 'admin' as 'admin' | 'vendedor' } }
}))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))
vi.mock('@main/auth/session', async () => {
  const { possuiPermissao } = await import('@shared/permissions')
  const { Errors } = await import('@main/errors')
  return {
    requirePermissao: (recurso: Parameters<typeof possuiPermissao>[1], acao: Parameters<typeof possuiPermissao>[2]) => {
      if (!possuiPermissao(sessao.usuario.perfil, recurso, acao)) throw Errors.semPermissao()
      return sessao
    }
  }
})

import { formaPagamentoService } from './formaPagamentoService'
import { bandeiraService } from './bandeiraService'

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

const forma = (extra: Record<string, unknown> = {}) => formaPagamentoInputSchema.parse({ nome: 'Crediário', tipo: 'PROMISSORIA', maxParcelas: 10, ...extra })
const bandeira = (extra: Record<string, unknown> = {}) =>
  bandeiraInputSchema.parse({
    nome: 'Visa',
    aceitaDebito: true,
    aceitaCredito: true,
    debitoTaxaBp: 199,
    debitoPrazoDias: 1,
    faixas: [
      { parcelas: 1, taxaBp: 349, prazoDias: 30 },
      { parcelas: 6, taxaBp: 899, prazoDias: 180, descontoClienteBp: 300 }
    ],
    ...extra
  })

beforeEach(() => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  registrarFuncoesSql(db)
  for (const m of MIGRATIONS) db.exec(m.sql)
  db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Ana', 'ana', 'x', 'admin')").run()
  db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Beto', 'beto', 'x', 'vendedor')").run()
  db.prepare("INSERT INTO cliente (nome) VALUES ('MARIA')").run()
  banco.db = db
  sessao.usuario = { id: 1, login: 'ana', perfil: 'admin' }
})

describe('schema da forma de pagamento', () => {
  it('só a forma parcelada pelo cliente guarda parcelas, intervalo e acréscimo', () => {
    expect(formaPagamentoInputSchema.parse({ nome: 'Pix', tipo: 'PIX', maxParcelas: 5, intervaloDias: 10, acrescimoTipo: 'PERCENTUAL', acrescimoValor: 500 })).toEqual({
      nome: 'Pix', tipo: 'PIX', ordem: 0, maxParcelas: null, intervaloDias: 30, acrescimoTipo: null, acrescimoValor: 0
    })
    expect(formaPagamentoInputSchema.parse({ nome: 'Promissória', tipo: 'PROMISSORIA', maxParcelas: '6', acrescimoTipo: 'PERCENTUAL', acrescimoValor: 899 })).toEqual({
      nome: 'Promissória', tipo: 'PROMISSORIA', ordem: 0, maxParcelas: 6, intervaloDias: 30, acrescimoTipo: 'PERCENTUAL', acrescimoValor: 899
    })
  })

  it('exige nome, tipo válido, máximo de parcelas e acréscimo em % de 0 a 100', () => {
    expect(() => formaPagamentoInputSchema.parse({ nome: '  ', tipo: 'PIX' })).toThrow()
    expect(() => formaPagamentoInputSchema.parse({ nome: 'X', tipo: 'CREDIARIO' })).toThrow()
    expect(() => formaPagamentoInputSchema.parse({ nome: 'X', tipo: 'BOLETO' })).toThrow() // sem maximo de parcelas
    expect(() => formaPagamentoInputSchema.parse({ nome: 'X', tipo: 'BOLETO', maxParcelas: 61 })).toThrow()
    expect(() => formaPagamentoInputSchema.parse({ nome: 'X', tipo: 'BOLETO', maxParcelas: 3, intervaloDias: 0 })).toThrow()
    expect(() => formaPagamentoInputSchema.parse({ nome: 'X', tipo: 'BOLETO', maxParcelas: 3, acrescimoTipo: 'PERCENTUAL', acrescimoValor: 10001 })).toThrow()
  })
})

describe('schema da bandeira', () => {
  it('débito exige taxa e prazo; crédito exige ao menos uma faixa; sem faixa repetida', () => {
    expect(() => bandeiraInputSchema.parse({ nome: 'Elo', aceitaDebito: false, aceitaCredito: false })).toThrow()
    expect(() => bandeiraInputSchema.parse({ nome: 'Elo', aceitaDebito: true, aceitaCredito: false })).toThrow()
    expect(() => bandeiraInputSchema.parse({ nome: 'Elo', aceitaDebito: false, aceitaCredito: true, faixas: [] })).toThrow()
    expect(() =>
      bandeiraInputSchema.parse({ nome: 'Elo', aceitaDebito: false, aceitaCredito: true, faixas: [{ parcelas: 2, taxaBp: 1, prazoDias: 1 }, { parcelas: 2, taxaBp: 2, prazoDias: 2 }] })
    ).toThrow()
    expect(() => bandeiraInputSchema.parse({ nome: 'Elo', aceitaDebito: false, aceitaCredito: true, faixas: [{ parcelas: 25, taxaBp: 1, prazoDias: 1 }] })).toThrow()
  })

  it('o desconto ao cliente da faixa começa em 0 (sem efeito) e o que não é aceito fica limpo', () => {
    const b = bandeiraInputSchema.parse({ nome: 'Elo', aceitaDebito: false, aceitaCredito: true, debitoTaxaBp: 100, debitoPrazoDias: 3, faixas: [{ parcelas: 1, taxaBp: 349, prazoDias: 30 }] })
    expect(b.faixas[0].descontoClienteBp).toBe(0)
    expect(b.debitoTaxaBp).toBeNull()
    expect(b.debitoPrazoDias).toBeNull()
  })
})

describe('formaPagamentoService', () => {
  it('cria em maiúsculas, com auditoria, e lista as ativas ordenadas', () => {
    const f = formaPagamentoService.criar(forma({ acrescimoTipo: 'PERCENTUAL', acrescimoValor: 899, intervaloDias: 15, ordem: 3 }))
    expect(f).toMatchObject({ nome: 'CREDIÁRIO', tipo: 'PROMISSORIA', comportamento: 'PARCELADO_CLIENTE', maxParcelas: 10, intervaloDias: 15, acrescimoTipo: 'PERCENTUAL', acrescimoValor: 899, ativo: true, vendasVinculadas: 0 })
    expect(banco.db!.prepare("SELECT acao FROM auditoria WHERE entidade = 'forma_pagamento'").get()).toEqual({ acao: 'CRIAR' })
    const nomes = formaPagamentoService.listar({}).map((x) => x.nome)
    expect(nomes[0]).toBe('DINHEIRO')
    expect(nomes).toContain('CREDIÁRIO')
    expect(nomes).not.toContain('ENTRADA') // as legadas inativas ficam fora do que a venda oferece
    expect(formaPagamentoService.listar({ apenasAtivos: false }).map((x) => x.nome)).toContain('ENTRADA')
  })

  it('nome repetido é recusado, mesmo com outra caixa; editar o próprio nome pode', () => {
    const f = formaPagamentoService.criar(forma())
    expect(codigo(() => formaPagamentoService.criar(forma({ nome: 'CREDIARIO' })))).toBeUndefined() // outra grafia (sem acento) e outro nome
    expect(codigo(() => formaPagamentoService.criar(forma({ nome: 'crediário' })))).toBe('CONFLITO')
    expect(() => formaPagamentoService.atualizar(f.id, forma({ nome: 'Crediário', maxParcelas: 4 }))).not.toThrow()
    expect(formaPagamentoService.listar({ apenasAtivos: false }).find((x) => x.id === f.id)?.maxParcelas).toBe(4)
  })

  it('inativar tira da venda e reativar traz de volta', () => {
    const f = formaPagamentoService.criar(forma())
    formaPagamentoService.setAtivo(f.id, false)
    expect(formaPagamentoService.listar({}).map((x) => x.id)).not.toContain(f.id)
    formaPagamentoService.setAtivo(f.id, true)
    expect(formaPagamentoService.listar({}).map((x) => x.id)).toContain(f.id)
    expect(banco.db!.prepare("SELECT acao FROM auditoria WHERE acao IN ('INATIVAR', 'ATIVAR') ORDER BY id").all()).toEqual([{ acao: 'INATIVAR' }, { acao: 'ATIVAR' }])
  })

  it('RG-02: com venda vinculada não exclui (só inativa); sem vínculo exclui logicamente e libera o nome', () => {
    const usada = formaPagamentoService.criar(forma({ nome: 'Carnê da casa' }))
    banco.db!.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('X', 'x', 'x', 'admin')").run()
    banco.db!.prepare("INSERT INTO venda (numero, cliente_id, vendedor_id) VALUES ('V-1', 1, 1)").run()
    banco.db!.prepare('INSERT INTO venda_pagamento (venda_id, forma_pagamento, valor_centavos, parcelas, forma_pagamento_id) VALUES (1, ?, 1000, 3, ?)').run(usada.nome, usada.id)

    expect(formaPagamentoService.listar({ apenasAtivos: false }).find((x) => x.id === usada.id)?.vendasVinculadas).toBe(1)
    expect(mensagem(() => formaPagamentoService.excluir({ id: usada.id }))).toContain('Use "Inativar"')
    expect(formaPagamentoService.listar({ apenasAtivos: false }).map((x) => x.id)).toContain(usada.id)

    const livre = formaPagamentoService.criar(forma({ nome: 'Vale compras', tipo: 'OUTRO', maxParcelas: null }))
    formaPagamentoService.excluir({ id: livre.id, motivo: 'criada por engano' })
    expect(formaPagamentoService.listar({ apenasAtivos: false }).map((x) => x.id)).not.toContain(livre.id)
    expect(banco.db!.prepare('SELECT excluido_motivo FROM forma_pagamento WHERE id = ?').get(livre.id)).toEqual({ excluido_motivo: 'criada por engano' })
    expect(() => formaPagamentoService.criar(forma({ nome: 'Vale compras', tipo: 'OUTRO', maxParcelas: null }))).not.toThrow() // nome liberado
    expect(banco.db!.prepare("SELECT acao FROM auditoria WHERE acao = 'EXCLUIR'").all()).toHaveLength(1)
  })

  it('só o Administrador cadastra, edita e exclui; o vendedor só vê as ativas', () => {
    const f = formaPagamentoService.criar(forma())
    formaPagamentoService.setAtivo(f.id, false)
    sessao.usuario = { id: 2, login: 'beto', perfil: 'vendedor' }
    expect(codigo(() => formaPagamentoService.criar(forma({ nome: 'Outra' })))).toBe('SEM_PERMISSAO')
    expect(codigo(() => formaPagamentoService.atualizar(f.id, forma()))).toBe('SEM_PERMISSAO')
    expect(codigo(() => formaPagamentoService.setAtivo(f.id, true))).toBe('SEM_PERMISSAO')
    expect(codigo(() => formaPagamentoService.excluir({ id: f.id }))).toBe('SEM_PERMISSAO')
    // mesmo pedindo as inativas, o servidor responde so as ativas
    const nomes = formaPagamentoService.listar({ apenasAtivos: false }).map((x) => x.nome)
    expect(nomes).toContain('DINHEIRO')
    expect(nomes).not.toContain('CREDIÁRIO')
    expect(nomes).not.toContain('ENTRADA')
  })
})

describe('bandeiraService', () => {
  it('cria com as faixas do crédito e lista ordenado', () => {
    const b = bandeiraService.criar(bandeira())
    expect(b).toMatchObject({ nome: 'VISA', adquirente: null, aceitaDebito: true, aceitaCredito: true, debitoTaxaBp: 199, debitoPrazoDias: 1, ativo: true, vendasVinculadas: 0 })
    expect(b.faixas).toEqual([
      { parcelas: 1, taxaBp: 349, prazoDias: 30, descontoClienteBp: 0 },
      { parcelas: 6, taxaBp: 899, prazoDias: 180, descontoClienteBp: 300 }
    ])
    expect(banco.db!.prepare("SELECT acao FROM auditoria WHERE entidade = 'bandeira'").get()).toEqual({ acao: 'CRIAR' })
  })

  it('a mesma bandeira convive em maquininhas diferentes, mas não na mesma', () => {
    bandeiraService.criar(bandeira({ adquirente: 'Stone' }))
    expect(() => bandeiraService.criar(bandeira({ adquirente: 'Cielo' }))).not.toThrow()
    expect(codigo(() => bandeiraService.criar(bandeira({ adquirente: 'STONE' })))).toBe('CONFLITO')
    expect(codigo(() => bandeiraService.criar(bandeira()))).toBeUndefined() // sem maquininha e outra "linha"
    expect(codigo(() => bandeiraService.criar(bandeira()))).toBe('CONFLITO')
  })

  it('editar atualiza as faixas no lugar: muda, cria e remove, sem mexer no que ficou', () => {
    const b = bandeiraService.criar(bandeira())
    const antes = banco.db!.prepare('SELECT id, uuid FROM bandeira_faixa WHERE parcelas = 1').get() as { id: number; uuid: string }
    const editada = bandeiraService.atualizar(
      b.id,
      bandeira({ faixas: [{ parcelas: 1, taxaBp: 400, prazoDias: 30 }, { parcelas: 3, taxaBp: 600, prazoDias: 90 }] })
    )
    expect(editada.faixas.map((f) => [f.parcelas, f.taxaBp])).toEqual([[1, 400], [3, 600]]) // 6x saiu
    const depois = banco.db!.prepare('SELECT id, uuid FROM bandeira_faixa WHERE parcelas = 1').get() as { id: number; uuid: string }
    expect(depois).toEqual(antes) // a faixa de 1x foi atualizada no lugar (mesmo registro)
    // desmarcar credito limpa as faixas
    expect(bandeiraService.atualizar(b.id, bandeira({ aceitaCredito: false, faixas: [] })).faixas).toEqual([])
  })

  it('RG-02: com venda vinculada não exclui (só inativa); sem vínculo exclui logicamente', () => {
    const usada = bandeiraService.criar(bandeira())
    banco.db!.prepare("INSERT INTO venda (numero, cliente_id, vendedor_id) VALUES ('V-1', 1, 1)").run()
    banco.db!.prepare("INSERT INTO venda_pagamento (venda_id, forma_pagamento, valor_centavos, parcelas, bandeira_id, bandeira_nome) VALUES (1, 'CARTÃO DE CRÉDITO', 1000, 6, ?, 'VISA')").run(usada.id)
    expect(mensagem(() => bandeiraService.excluir({ id: usada.id }))).toContain('Use "Inativar"')
    bandeiraService.setAtivo(usada.id, false)
    expect(bandeiraService.listar({}).map((x) => x.id)).not.toContain(usada.id)
    expect(bandeiraService.listar({ apenasAtivos: false }).find((x) => x.id === usada.id)?.vendasVinculadas).toBe(1)

    const livre = bandeiraService.criar(bandeira({ nome: 'Hipercard' }))
    bandeiraService.excluir({ id: livre.id })
    expect(bandeiraService.listar({ apenasAtivos: false }).map((x) => x.id)).not.toContain(livre.id)
  })

  it('só o Administrador mexe no cadastro; o vendedor só vê as ativas (com as faixas)', () => {
    const b = bandeiraService.criar(bandeira())
    bandeiraService.criar(bandeira({ nome: 'Elo' }))
    bandeiraService.setAtivo(b.id, false)
    sessao.usuario = { id: 2, login: 'beto', perfil: 'vendedor' }
    expect(codigo(() => bandeiraService.criar(bandeira({ nome: 'Amex' })))).toBe('SEM_PERMISSAO')
    expect(codigo(() => bandeiraService.excluir({ id: b.id }))).toBe('SEM_PERMISSAO')
    const lista = bandeiraService.listar({ apenasAtivos: false })
    expect(lista.map((x) => x.nome)).toEqual(['ELO'])
    expect(lista[0].faixas).toHaveLength(2)
  })
})
