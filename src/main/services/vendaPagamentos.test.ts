import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'
import { registrarFuncoesSql } from '@main/db/funcoesSql'
import { hashPassword } from '@main/auth/password'
import { AppError } from '@main/errors'
import { vendaCreateSchema, vendaExcluirSchema } from '@shared/ipc'
import { hojeLocal } from '@shared/data'
import { somarDiasISO } from '@shared/vendaCalculo'

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

import { vendaService } from './vendaService'
import { contaReceberRepository } from '@main/repositories/contaReceberRepository'
import { dashboardRepository } from '@main/repositories/dashboardRepository'
import { financeiroRepository } from '@main/repositories/financeiroRepository'
import { relatorioRepository } from '@main/repositories/relatorioRepository'
import { relacionamentoRepository } from '@main/repositories/relacionamentoRepository'

const um = <T>(sql: string, ...params: (string | number)[]): T => banco.db!.prepare(sql).get(...params) as T
const todos = <T>(sql: string, ...params: (string | number)[]): T[] => banco.db!.prepare(sql).all(...params) as T[]
const formaId = (nome: string): number => um<{ id: number }>('SELECT id FROM forma_pagamento WHERE nome = ?', nome).id

async function codigo(fn: () => unknown): Promise<string | undefined> {
  try {
    await fn()
  } catch (e) {
    return e instanceof AppError ? e.code : `OUTRO: ${String(e)}`
  }
  return undefined
}

async function mensagem(fn: () => unknown): Promise<string> {
  try {
    await fn()
  } catch (e) {
    return e instanceof AppError ? e.message : `OUTRO: ${String(e)}`
  }
  return ''
}

interface LinhaPagamento {
  forma: string
  valor: number
  parcelas?: number
  bandeiraId?: number
}

/** 1 armação de R$ 1.000,00 (preço) por padrão. */
function entrada(pagamentos: LinhaPagamento[], extra: Record<string, unknown> = {}, preco = 100000) {
  return vendaCreateSchema.parse({
    clienteId: 1,
    itens: [{ produtoId: 1, quantidade: 1, precoUnitarioCentavos: preco, descontoCentavos: 0 }],
    pagamentos: pagamentos.map((p) => ({
      formaPagamentoId: formaId(p.forma),
      valorCentavos: p.valor,
      parcelas: p.parcelas ?? 1,
      bandeiraId: p.bandeiraId ?? null
    })),
    ...extra
  })
}

let visaId: number

beforeEach(async () => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  registrarFuncoesSql(db)
  for (const m of MIGRATIONS) db.exec(m.sql)
  banco.db = db
  sessao.usuario = { id: 1, login: 'ana', perfil: 'admin' }

  db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Ana', 'ana', ?, 'admin')").run(await hashPassword('senha-da-ana-1'))
  db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Beto', 'beto', 'x', 'vendedor')").run()
  db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Carla', 'carla', ?, 'admin')").run(await hashPassword('senha-da-carla-1'))
  db.prepare("INSERT INTO cliente (nome) VALUES ('MARIA')").run()
  db.prepare(
    `INSERT INTO produto (descricao, categoria, unidade, custo_centavos, margem, preco_venda_centavos, estoque_minimo)
     VALUES ('ARMAÇÃO', 'armacao', 'UN', 30000, 100, 100000, 0)`
  ).run()
  db.prepare(
    `INSERT INTO estoque_movimento (produto_id, tipo, quantidade, saldo_apos, documento_tipo, documento_id, usuario_id)
     VALUES (1, 'compra', 10, 10, 'compra', 1, 1)`
  ).run()

  // Visa: debito 1,99% em 1 dia; credito 1x 3,49% (30 dias), 6x 8,99% (180 dias), 12x 12,99% (360 dias, 5% de desconto ao cliente)
  visaId = Number(db.prepare("INSERT INTO bandeira (nome, aceita_debito, aceita_credito, debito_taxa_bp, debito_prazo_dias) VALUES ('VISA', 1, 1, 199, 1)").run().lastInsertRowid)
  for (const [parcelas, taxa, prazo, desc] of [[1, 349, 30, 0], [6, 899, 180, 0], [12, 1299, 360, 500]]) {
    db.prepare('INSERT INTO bandeira_faixa (bandeira_id, parcelas, taxa_bp, prazo_dias, desconto_cliente_bp) VALUES (?, ?, ?, ?, ?)').run(visaId, parcelas, taxa, prazo, desc)
  }
  // Promissória: até 6x a cada 30 dias, com 5% de acréscimo
  db.prepare("UPDATE forma_pagamento SET max_parcelas = 6, acrescimo_tipo = 'PERCENTUAL', acrescimo_valor = 500 WHERE nome = 'PROMISSÓRIA'").run()
  db.prepare("UPDATE forma_pagamento SET max_parcelas = 6 WHERE nome = 'BOLETO'").run()
})

describe('venda no cartão (9.4)', () => {
  it('R$ 900,00 no crédito em 6x com taxa de 8,99% gera 1 recebível líquido de R$ 819,09 e nenhuma parcela do cliente', async () => {
    const v = await vendaService.criar(entrada([{ forma: 'CARTÃO DE CRÉDITO', valor: 90000, parcelas: 6, bandeiraId: visaId }], {}, 90000))

    expect(v.parcelas).toEqual([]) // nada de parcela do cliente, nada de carne
    expect(v.recebiveisOperadora).toHaveLength(1)
    expect(v.recebiveisOperadora[0]).toMatchObject({
      tipo: 'OPERADORA',
      valorCentavos: 81909,
      parcela: 1,
      totalParcelas: 1,
      bandeiraNome: 'VISA',
      operadoraParcelas: 6,
      taxaBp: 899,
      brutoCentavos: 90000,
      vencimento: somarDiasISO(hojeLocal(), 180),
      vencida: false
    })
    expect(v.pagamentos[0]).toMatchObject({
      formaPagamento: 'CARTÃO DE CRÉDITO',
      formaTipo: 'CARTAO_CREDITO',
      comportamento: 'OPERADORA',
      parcelas: 6,
      bandeiraNome: 'VISA',
      taxaBp: 899,
      brutoCentavos: 90000,
      liquidoCentavos: 81909,
      dataPrevista: somarDiasISO(hojeLocal(), 180)
    })
    // nada entra no caixa agora: o dinheiro so entra quando a operadora depositar
    expect(um<{ n: number }>('SELECT COUNT(*) AS n FROM lancamento').n).toBe(0)
    expect(um<{ n: number }>("SELECT COUNT(*) AS n FROM conta_receber WHERE tipo = 'CLIENTE'").n).toBe(0)
    expect(v.totalCentavos).toBe(90000)
    expect(v.totalClienteCentavos).toBe(90000)
  })

  it('débito: taxa e prazo do débito, sempre 1x', async () => {
    const v = await vendaService.criar(entrada([{ forma: 'CARTÃO DE DÉBITO', valor: 100000, bandeiraId: visaId }]))
    expect(v.recebiveisOperadora[0]).toMatchObject({ valorCentavos: 98010, operadoraParcelas: 1, taxaBp: 199, vencimento: somarDiasISO(hojeLocal(), 1) })
  })

  it('o snapshot não muda quando a taxa da bandeira muda depois', async () => {
    const v = await vendaService.criar(entrada([{ forma: 'CARTÃO DE CRÉDITO', valor: 100000, parcelas: 6, bandeiraId: visaId }]))
    banco.db!.prepare('UPDATE bandeira_faixa SET taxa_bp = 2000 WHERE bandeira_id = ? AND parcelas = 6').run(visaId)
    const depois = vendaService.buscarPorId(v.id)
    expect(depois.pagamentos[0].taxaBp).toBe(899)
    expect(depois.pagamentos[0].liquidoCentavos).toBe(91010)
    expect(depois.recebiveisOperadora[0].valorCentavos).toBe(91010)
    // e uma venda nova ja usa a taxa nova
    const nova = await vendaService.criar(entrada([{ forma: 'CARTÃO DE CRÉDITO', valor: 100000, parcelas: 6, bandeiraId: visaId }]))
    expect(nova.recebiveisOperadora[0].valorCentavos).toBe(80000)
  })

  it('exige a bandeira, a faixa cadastrada e uma bandeira ativa', async () => {
    expect(await mensagem(() => vendaService.criar(entrada([{ forma: 'CARTÃO DE CRÉDITO', valor: 100000, parcelas: 6 }])))).toContain('bandeira')
    expect(await mensagem(() => vendaService.criar(entrada([{ forma: 'CARTÃO DE CRÉDITO', valor: 100000, parcelas: 5, bandeiraId: visaId }])))).toContain('5x')
    banco.db!.prepare('UPDATE bandeira SET ativo = 0 WHERE id = ?').run(visaId)
    expect(await mensagem(() => vendaService.criar(entrada([{ forma: 'CARTÃO DE CRÉDITO', valor: 100000, parcelas: 1, bandeiraId: visaId }])))).toContain('inativa')
    expect(um<{ n: number }>('SELECT COUNT(*) AS n FROM venda').n).toBe(0)
  })

  it('a venda no cartão libera a comissão na hora (o cliente já pagou) e a operadora nunca é inadimplência', async () => {
    banco.db!.prepare("INSERT INTO configuracao (chave, valor) VALUES ('comissao_padrao_pct', '5') ON CONFLICT(chave) DO UPDATE SET valor = '5'").run()
    const v = await vendaService.criar(entrada([{ forma: 'CARTÃO DE CRÉDITO', valor: 100000, parcelas: 6, bandeiraId: visaId }]))
    expect(v.comissao).toMatchObject({ valorCentavos: 5000, situacao: 'LIBERADA' })

    // a maquininha "atrasou": o recebivel vence ontem, mas isso nao e divida do cliente
    banco.db!.prepare("UPDATE conta_receber SET vencimento = '2020-01-01' WHERE tipo = 'OPERADORA'").run()
    expect(contaReceberRepository.listar({ apenasVencidas: true })).toEqual([])
    const todas = contaReceberRepository.listar({})
    expect(todas).toHaveLength(1)
    expect(todas[0]).toMatchObject({ tipo: 'OPERADORA', vencida: false })
    expect(contaReceberRepository.listar({ tipo: 'CLIENTE' })).toEqual([])
    expect(contaReceberRepository.listar({ tipo: 'OPERADORA' })).toHaveLength(1)
    // nem no Relacionamento (cobranca), nem no painel
    expect(relacionamentoRepository.listarPendentes(hojeLocal()).filter((p) => p.motivo === 'COBRANCA')).toEqual([])
    const posicao = dashboardRepository.posicao(null, false)
    expect(posicao.receber).toMatchObject({ abertoQtd: 0, vencidasQtd: 0 })
  })

  it('a baixa do recebível da operadora continua possível e entra no caixa', async () => {
    const v = await vendaService.criar(entrada([{ forma: 'CARTÃO DE CRÉDITO', valor: 100000, parcelas: 1, bandeiraId: visaId }]))
    const recebivel = v.recebiveisOperadora[0]
    contaReceberRepository.baixar(recebivel.id, { valorCentavos: recebivel.valorCentavos, data: null, formaPagamento: 'TRANSFERÊNCIA', usuarioId: 1 })
    expect(contaReceberRepository.buscarPorId(recebivel.id)?.situacao).toBe('PAGA')
    expect(um<{ descricao: string; valor_centavos: number }>("SELECT descricao, valor_centavos FROM lancamento WHERE origem_tipo = 'conta_receber'")).toEqual({
      descricao: 'Recebimento da operadora (VISA) - TRANSFERÊNCIA',
      valor_centavos: 96510
    })
  })

  it('desconto ao cliente da faixa (12x = 5%): fica gravado e entra no total do cliente', async () => {
    const v = await vendaService.criar(entrada([{ forma: 'CARTÃO DE CRÉDITO', valor: 100000, parcelas: 12, bandeiraId: visaId }]))
    expect(v.pagamentos[0]).toMatchObject({ descontoClienteBp: 500, descontoClienteCentavos: 5000, brutoCentavos: 95000, liquidoCentavos: 82659 })
    expect(v.totalCentavos).toBe(100000)
    expect(v.descontoClienteCentavos).toBe(5000)
    expect(v.totalClienteCentavos).toBe(95000)
  })
})

describe('venda na promissória (9.3)', () => {
  it('R$ 900,00 com acréscimo de 5% em 3x gera 3 parcelas de R$ 315,00, e o acréscimo fica gravado', async () => {
    const v = await vendaService.criar(entrada([{ forma: 'PROMISSÓRIA', valor: 90000, parcelas: 3 }], {}, 90000))
    expect(v.parcelas.map((p) => p.valorCentavos)).toEqual([31500, 31500, 31500])
    expect(v.parcelas.map((p) => p.vencimento)).toEqual([30, 60, 90].map((d) => somarDiasISO(hojeLocal(), d)))
    expect(v.parcelas.every((p) => p.tipo === 'CLIENTE' && p.totalParcelas === 3)).toBe(true)
    expect(v.pagamentos[0]).toMatchObject({ comportamento: 'PARCELADO_CLIENTE', acrescimoTipo: 'PERCENTUAL', acrescimoValor: 500, acrescimoCentavos: 4500, intervaloDias: 30 })
    expect(v.totalCentavos).toBe(90000) // o total da venda e dos itens; o acrescimo e a parte
    expect(v.acrescimoCentavos).toBe(4500)
    expect(v.totalClienteCentavos).toBe(94500)
  })

  it('R$ 1.000,00 em 3x sem acréscimo gera 333,34 + 333,33 + 333,33', async () => {
    banco.db!.prepare("UPDATE forma_pagamento SET acrescimo_tipo = NULL, acrescimo_valor = 0 WHERE nome = 'PROMISSÓRIA'").run()
    const v = await vendaService.criar(entrada([{ forma: 'PROMISSÓRIA', valor: 100000, parcelas: 3 }]))
    expect(v.parcelas.map((p) => p.valorCentavos)).toEqual([33334, 33333, 33333])
    expect(v.acrescimoCentavos).toBe(0)
  })

  it('a entrada vira uma linha comum e a promissória calcula sobre o valor da PRÓPRIA linha', async () => {
    const v = await vendaService.criar(entrada([{ forma: 'DINHEIRO', valor: 40000 }, { forma: 'PROMISSÓRIA', valor: 60000, parcelas: 2 }]))
    expect(v.parcelas.map((p) => p.valorCentavos)).toEqual([31500, 31500]) // 600,00 + 5% = 630,00 em 2x
    expect(v.acrescimoCentavos).toBe(3000)
    expect(um<{ valor_centavos: number }>("SELECT valor_centavos FROM lancamento WHERE origem_tipo = 'venda'").valor_centavos).toBe(40000)
    expect(v.totalClienteCentavos).toBe(103000)
  })

  it('respeita o máximo de parcelas da forma', async () => {
    expect(await mensagem(() => vendaService.criar(entrada([{ forma: 'PROMISSÓRIA', valor: 100000, parcelas: 7 }])))).toContain('no máximo 6')
    expect(await mensagem(() => vendaService.criar(entrada([{ forma: 'BOLETO', valor: 100000, parcelas: 7 }])))).toContain('no máximo 6')
    const ok = await vendaService.criar(entrada([{ forma: 'BOLETO', valor: 100000, parcelas: 6 }]))
    expect(ok.parcelas).toHaveLength(6)
  })

  it('a comissão continua sobre o valor da venda, sem o acréscimo, e só libera quando as parcelas forem pagas', async () => {
    banco.db!.prepare("INSERT INTO configuracao (chave, valor) VALUES ('comissao_padrao_pct', '10') ON CONFLICT(chave) DO UPDATE SET valor = '10'").run()
    const v = await vendaService.criar(entrada([{ forma: 'PROMISSÓRIA', valor: 100000, parcelas: 2 }]))
    expect(v.acrescimoCentavos).toBe(5000)
    expect(v.comissao).toMatchObject({ valorCentavos: 10000, situacao: 'PROVISIONADA' })
    for (const p of v.parcelas) contaReceberRepository.baixar(p.id, { valorCentavos: p.valorCentavos, data: null, formaPagamento: 'PIX', usuarioId: 1 })
    expect(vendaService.buscarPorId(v.id).comissao?.situacao).toBe('LIBERADA')
  })

  it('uma forma inativa ou excluída não serve para venda nova', async () => {
    banco.db!.prepare("UPDATE forma_pagamento SET ativo = 0 WHERE nome = 'PIX'").run()
    expect(await codigo(() => vendaService.criar(entrada([{ forma: 'PIX', valor: 100000 }])))).toBe('VALIDACAO')
  })
})

describe('desconto da venda (9.1)', () => {
  const comDesconto = (tipo: 'VALOR' | 'PERCENTUAL', valor: number, preco = 100000) =>
    entrada([{ forma: 'PIX', valor: 0 }], { descontoAdicional: { tipo, valor } }, preco)

  it('10% sobre R$ 1.000,00 -> R$ 900,00, com tipo, valor informado e desconto em centavos gravados', async () => {
    const input = vendaCreateSchema.parse({ ...comDesconto('PERCENTUAL', 1000), pagamentos: [{ formaPagamentoId: formaId('PIX'), valorCentavos: 90000 }] })
    const v = await vendaService.criar(input)
    expect(v).toMatchObject({ totalCentavos: 90000, descontoCentavos: 10000, descontoAdicionalTipo: 'PERCENTUAL', descontoAdicionalValor: 1000, descontoAdicionalCentavos: 10000 })
  })

  it('R$ 50,00 sobre R$ 500,00 -> R$ 450,00', async () => {
    const input = vendaCreateSchema.parse({ ...comDesconto('VALOR', 5000, 50000), pagamentos: [{ formaPagamentoId: formaId('PIX'), valorCentavos: 45000 }] })
    const v = await vendaService.criar(input)
    expect(v).toMatchObject({ totalCentavos: 45000, descontoAdicionalTipo: 'VALOR', descontoAdicionalValor: 5000, descontoAdicionalCentavos: 5000 })
  })

  it('R$ 600,00 sobre R$ 500,00 e % acima de 100 são recusados', async () => {
    const a = vendaCreateSchema.parse({ ...comDesconto('VALOR', 60000, 50000), pagamentos: [{ formaPagamentoId: formaId('PIX'), valorCentavos: 1 }] })
    expect(await mensagem(() => vendaService.criar(a))).toContain('não pode ser maior que o subtotal')
    const b = vendaCreateSchema.parse({ ...comDesconto('PERCENTUAL', 10001), pagamentos: [{ formaPagamentoId: formaId('PIX'), valorCentavos: 1 }] })
    expect(await mensagem(() => vendaService.criar(b))).toContain('0 a 100')
  })

  it('o servidor ignora o total da tela: a soma dos pagamentos precisa bater com o total calculado por ele', async () => {
    const input = vendaCreateSchema.parse({ ...comDesconto('PERCENTUAL', 1000), pagamentos: [{ formaPagamentoId: formaId('PIX'), valorCentavos: 100000 }] })
    expect(await codigo(() => vendaService.criar(input))).toBe('VALIDACAO')
  })

  it('o vendedor continua precisando de autorização do Administrador acima do limite de desconto', async () => {
    sessao.usuario = { id: 2, login: 'beto', perfil: 'vendedor' }
    // 20% > limite padrao de 10%
    const input = vendaCreateSchema.parse({ ...comDesconto('PERCENTUAL', 2000), pagamentos: [{ formaPagamentoId: formaId('PIX'), valorCentavos: 80000 }] })
    expect(await codigo(() => vendaService.criar(input))).toBe('AUTORIZACAO_ADMIN_NECESSARIA')
    const ok = vendaCreateSchema.parse({ ...comDesconto('PERCENTUAL', 1000), pagamentos: [{ formaPagamentoId: formaId('PIX'), valorCentavos: 90000 }] })
    expect((await vendaService.criar(ok)).totalCentavos).toBe(90000)
  })
})

describe('excluir venda (9.6)', () => {
  const senhaAna = { loginAdmin: 'ana', senhaAdmin: 'senha-da-ana-1' }

  it('sem bloqueio: exclui de verdade (estoque volta, parcelas e comissão saem) e some de tudo', async () => {
    banco.db!.prepare("INSERT INTO configuracao (chave, valor) VALUES ('comissao_padrao_pct', '10') ON CONFLICT(chave) DO UPDATE SET valor = '10'").run()
    const v = await vendaService.criar(entrada([{ forma: 'PROMISSÓRIA', valor: 100000, parcelas: 3 }]))
    expect(um<{ saldo_apos: number }>('SELECT saldo_apos FROM estoque_movimento ORDER BY id DESC LIMIT 1').saldo_apos).toBe(9)

    const previa = vendaService.exclusaoPrevia(v.id)
    expect(previa.bloqueios).toEqual([])

    await vendaService.excluir({ id: v.id, motivo: 'Lançada em duplicidade' })

    expect(um<{ excluido_em: string | null; excluido_motivo: string; situacao: string }>('SELECT excluido_em, excluido_motivo, situacao FROM venda WHERE id = ?', v.id)).toMatchObject({
      situacao: 'CANCELADA',
      excluido_motivo: 'Lançada em duplicidade'
    })
    expect(um<{ excluido_em: string | null }>('SELECT excluido_em FROM venda WHERE id = ?', v.id).excluido_em).not.toBeNull()
    expect(um<{ saldo_apos: number }>('SELECT saldo_apos FROM estoque_movimento ORDER BY id DESC LIMIT 1').saldo_apos).toBe(10)
    expect(um<{ n: number }>("SELECT COUNT(*) AS n FROM conta_receber WHERE situacao <> 'CANCELADA'").n).toBe(0)
    expect(um<{ situacao: string }>('SELECT situacao FROM comissao').situacao).toBe('CANCELADA')
    expect(um<{ n: number }>("SELECT COUNT(*) AS n FROM lancamento WHERE categoria = 'ESTORNO_VENDA'").n).toBe(0) // nada tinha entrado

    // some de todas as listas, relatorios, painel, comissoes e relacionamento
    expect(vendaService.listar({})).toEqual([])
    expect(vendaService.listarPorCliente(1)).toEqual([])
    expect(await codigo(() => vendaService.buscarPorId(v.id))).toBe('NAO_ENCONTRADO')
    expect(contaReceberRepository.listar({})).toHaveLength(3) // as parcelas canceladas seguem como historico do financeiro...
    expect(contaReceberRepository.listar({ situacao: 'ABERTA' })).toEqual([]) // ...mas nenhuma em aberto
    const periodo = { inicio: '2000-01-01', fim: '2099-12-31' }
    expect(dashboardRepository.resumoVendas(periodo, null)).toEqual({ quantidade: 0, totalCentavos: 0 })
    expect(financeiroRepository.receitaVendasPorPeriodo(periodo.inicio, periodo.fim)).toBe(0)
    expect(relatorioRepository.vendasPorVendedor(periodo.inicio, periodo.fim)).toEqual([])
    expect(relatorioRepository.rankingVendedores(periodo.inicio, periodo.fim)).toEqual([])
    expect(relatorioRepository.comissoes(periodo.inicio, periodo.fim, null)).toEqual([])
    expect(dashboardRepository.comissao(periodo, 1)).toBe(0)
    expect(await codigo(() => vendaService.cancelar({ id: v.id }))).toBe('NAO_ENCONTRADO')
  })

  it('o número da venda nunca é reutilizado', async () => {
    const a = await vendaService.criar(entrada([{ forma: 'PROMISSÓRIA', valor: 100000, parcelas: 2 }]))
    const b = await vendaService.criar(entrada([{ forma: 'PROMISSÓRIA', valor: 100000, parcelas: 2 }]))
    await vendaService.excluir({ id: b.id })
    const c = await vendaService.criar(entrada([{ forma: 'PROMISSÓRIA', valor: 100000, parcelas: 2 }]))
    expect(new Set([a.numero, b.numero, c.numero]).size).toBe(3)
    expect(Number(c.numero.split('-')[1])).toBe(Number(b.numero.split('-')[1]) + 1)
  })

  it('promissória com parcela paga: bloqueia e lista; sem a senha do Administrador não exclui', async () => {
    const v = await vendaService.criar(entrada([{ forma: 'PROMISSÓRIA', valor: 90000, parcelas: 3 }], {}, 90000))
    contaReceberRepository.baixar(v.parcelas[0].id, { valorCentavos: 31500, data: null, formaPagamento: 'PIX', usuarioId: 1 })

    const previa = vendaService.exclusaoPrevia(v.id)
    expect(previa.bloqueios).toHaveLength(1)
    expect(previa.bloqueios[0]).toMatchObject({ tipo: 'PARCELA_PAGA' })
    expect(previa.bloqueios[0].descricao).toContain('Parcela 1/3')

    expect(await codigo(() => vendaService.excluir({ id: v.id }))).toBe('AUTORIZACAO_ADMIN_NECESSARIA')
    // mesmo logado como Administrador, um clique nao basta; senha errada tambem nao
    expect(await codigo(() => vendaService.excluir({ id: v.id, autorizacaoAdmin: { loginAdmin: 'ana', senhaAdmin: 'errada' } }))).toBe('CREDENCIAIS_INVALIDAS')
    // senha de OUTRO administrador nao vale: tem que ser a propria
    expect(await codigo(() => vendaService.excluir({ id: v.id, autorizacaoAdmin: { loginAdmin: 'carla', senhaAdmin: 'senha-da-carla-1' } }))).toBe('VALIDACAO')
    expect(vendaService.buscarPorId(v.id).situacao).toBe('CONCLUIDA')
    expect(um<{ n: number }>("SELECT COUNT(*) AS n FROM conta_receber WHERE situacao = 'CANCELADA'").n).toBe(0)
  })

  it('liberada com a senha do Administrador: exclui e estorna o que já tinha entrado', async () => {
    const v = await vendaService.criar(entrada([{ forma: 'DINHEIRO', valor: 40000 }, { forma: 'PROMISSÓRIA', valor: 60000, parcelas: 2 }]))
    contaReceberRepository.baixar(v.parcelas[0].id, { valorCentavos: 31500, data: null, formaPagamento: 'PIX', usuarioId: 1 })

    const previa = vendaService.exclusaoPrevia(v.id)
    expect(previa.bloqueios.map((b) => b.tipo).sort()).toEqual(['PAGAMENTO_A_VISTA', 'PARCELA_PAGA'])

    await vendaService.excluir({ id: v.id, motivo: 'Cliente desistiu', autorizacaoAdmin: senhaAna })

    expect(await codigo(() => vendaService.buscarPorId(v.id))).toBe('NAO_ENCONTRADO')
    expect(um<{ n: number }>("SELECT COUNT(*) AS n FROM conta_receber WHERE situacao <> 'CANCELADA'").n).toBe(0)
    // estorno: os R$ 400,00 a vista + os R$ 315,00 da parcela paga
    expect(um<{ valor_centavos: number }>("SELECT valor_centavos FROM lancamento WHERE categoria = 'ESTORNO_VENDA'").valor_centavos).toBe(71500)
    expect(um<{ saldo_apos: number }>('SELECT saldo_apos FROM estoque_movimento ORDER BY id DESC LIMIT 1').saldo_apos).toBe(10)
    // auditoria: quem excluiu, quem confirmou com a senha, o motivo e o que foi liberado
    const aud = um<{ usuario_id: number; autorizado_por_id: number; valor_novo: string }>("SELECT usuario_id, autorizado_por_id, valor_novo FROM auditoria WHERE acao = 'EXCLUIR' AND entidade = 'venda'")
    expect(aud).toMatchObject({ usuario_id: 1, autorizado_por_id: 1 })
    expect(JSON.parse(aud.valor_novo)).toMatchObject({ motivo: 'Cliente desistiu' })
    expect(JSON.parse(aud.valor_novo).bloqueiosLiberados).toHaveLength(2)
  })

  it('pagamento à vista bloqueia mesmo sem parcela; OS vinculada bloqueia e é solta ao liberar', async () => {
    const v = await vendaService.criar(entrada([{ forma: 'PIX', valor: 100000 }]))
    banco.db!.prepare("INSERT INTO ordem_servico (numero, cliente_id, venda_id) VALUES ('OS-9', 1, ?)").run(v.id)
    const tipos = vendaService.exclusaoPrevia(v.id).bloqueios.map((b) => b.tipo).sort()
    expect(tipos).toEqual(['ORDEM_SERVICO', 'PAGAMENTO_A_VISTA'])
    expect(vendaService.exclusaoPrevia(v.id).bloqueios.find((b) => b.tipo === 'ORDEM_SERVICO')?.descricao).toContain('OS-9')

    await vendaService.excluir({ id: v.id, autorizacaoAdmin: senhaAna })
    expect(um<{ venda_id: number | null }>("SELECT venda_id FROM ordem_servico WHERE numero = 'OS-9'").venda_id).toBeNull()
    expect(um<{ valor_centavos: number }>("SELECT valor_centavos FROM lancamento WHERE categoria = 'ESTORNO_VENDA'").valor_centavos).toBe(100000)
  })

  it('recebível da operadora aberto é removido; já baixado bloqueia', async () => {
    const aberta = await vendaService.criar(entrada([{ forma: 'CARTÃO DE CRÉDITO', valor: 100000, parcelas: 1, bandeiraId: visaId }]))
    expect(vendaService.exclusaoPrevia(aberta.id).bloqueios).toEqual([])
    await vendaService.excluir({ id: aberta.id })
    expect(um<{ situacao: string }>('SELECT situacao FROM conta_receber WHERE venda_id = ?', aberta.id).situacao).toBe('CANCELADA')

    const baixada = await vendaService.criar(entrada([{ forma: 'CARTÃO DE CRÉDITO', valor: 100000, parcelas: 1, bandeiraId: visaId }]))
    const r = baixada.recebiveisOperadora[0]
    contaReceberRepository.baixar(r.id, { valorCentavos: r.valorCentavos, data: null, formaPagamento: 'TRANSFERÊNCIA', usuarioId: 1 })
    const previa = vendaService.exclusaoPrevia(baixada.id)
    expect(previa.bloqueios).toHaveLength(1)
    expect(previa.bloqueios[0]).toMatchObject({ tipo: 'RECEBIVEL_BAIXADO' })
    expect(await codigo(() => vendaService.excluir({ id: baixada.id }))).toBe('AUTORIZACAO_ADMIN_NECESSARIA')
  })

  it('venda já cancelada pode ser excluída sem estornar duas vezes', async () => {
    const v = await vendaService.criar(entrada([{ forma: 'PIX', valor: 100000 }]))
    await vendaService.cancelar({ id: v.id })
    expect(vendaService.exclusaoPrevia(v.id).bloqueios).toEqual([])
    await vendaService.excluir({ id: v.id })
    expect(um<{ n: number }>("SELECT COUNT(*) AS n FROM lancamento WHERE categoria = 'ESTORNO_VENDA'").n).toBe(1)
    expect(um<{ saldo_apos: number }>('SELECT saldo_apos FROM estoque_movimento ORDER BY id DESC LIMIT 1').saldo_apos).toBe(10)
  })

  it('só o Administrador exclui; o vendedor não tem nem a prévia', async () => {
    const v = await vendaService.criar(entrada([{ forma: 'PROMISSÓRIA', valor: 100000, parcelas: 2 }]))
    sessao.usuario = { id: 2, login: 'beto', perfil: 'vendedor' }
    expect(await codigo(() => vendaService.excluir({ id: v.id }))).toBe('SEM_PERMISSAO')
    expect(await codigo(() => vendaService.exclusaoPrevia(v.id))).toBe('SEM_PERMISSAO')
    sessao.usuario = { id: 1, login: 'ana', perfil: 'admin' }
    expect(vendaService.buscarPorId(v.id).situacao).toBe('CONCLUIDA')
  })

  it('o schema aceita o motivo opcional e limita o tamanho', () => {
    expect(vendaExcluirSchema.parse({ id: 1 }).motivo).toBeUndefined()
    expect(() => vendaExcluirSchema.parse({ id: 1, motivo: 'x'.repeat(201) })).toThrow()
  })

  it('cancelar venda no cartão estorna o recebível da operadora', async () => {
    const v = await vendaService.criar(entrada([{ forma: 'CARTÃO DE CRÉDITO', valor: 100000, parcelas: 6, bandeiraId: visaId }]))
    await vendaService.cancelar({ id: v.id })
    expect(todos<{ situacao: string }>('SELECT situacao FROM conta_receber').map((c) => c.situacao)).toEqual(['CANCELADA'])
    expect(um<{ saldo_apos: number }>('SELECT saldo_apos FROM estoque_movimento ORDER BY id DESC LIMIT 1').saldo_apos).toBe(10)
  })
})
