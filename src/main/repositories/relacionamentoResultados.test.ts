import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'

// SQLite em memoria com o schema REAL das migrations: o que se testa e o SQL e a regra de
// atribuicao dos resultados, nao um mock deles.
const { banco } = vi.hoisted(() => ({ banco: { db: null as DatabaseSync | null } }))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))

import { relacionamentoRepository } from './relacionamentoRepository'

const HOJE = '2026-09-19'

let db: DatabaseSync
const ids: Record<string, number> = {}

function cliente(chave: string, nome: string): number {
  ids[chave] = Number(db.prepare('INSERT INTO cliente (nome, celular) VALUES (:nome, :celular)').run({ nome, celular: '(11) 98765-4321' }).lastInsertRowid)
  return ids[chave]
}

/** 12:00 UTC cai no mesmo dia em qualquer fuso do Brasil. */
function contato(clienteId: number, motivo: string, referencia: string, dia: string): void {
  db.prepare('INSERT INTO contato (cliente_id, motivo, referencia, criado_em) VALUES (:clienteId, :motivo, :referencia, :criadoEm)').run({
    clienteId,
    motivo,
    referencia,
    criadoEm: `${dia} 12:00:00`
  })
}

let seq = 0
function venda(clienteId: number, data: string, totalCentavos: number, situacao = 'CONCLUIDA'): number {
  seq++
  return Number(
    db
      .prepare('INSERT INTO venda (numero, cliente_id, data, total_centavos, situacao) VALUES (:numero, :clienteId, :data, :total, :situacao)')
      .run({ numero: `2026-${String(seq).padStart(5, '0')}`, clienteId, data, total: totalCentavos, situacao }).lastInsertRowid
  )
}

function os(clienteId: number, situacao: string, entrega: string | null): number {
  seq++
  return Number(
    db
      .prepare('INSERT INTO ordem_servico (numero, cliente_id, situacao, data_entrega) VALUES (:numero, :clienteId, :situacao, :entrega)')
      .run({ numero: `OS-${seq}`, clienteId, situacao, entrega }).lastInsertRowid
  )
}

function parcela(clienteId: number, valor: number, vencimento: string): number {
  return Number(
    db
      .prepare("INSERT INTO conta_receber (cliente_id, valor_centavos, vencimento, situacao) VALUES (:clienteId, :valor, :vencimento, 'ABERTA')")
      .run({ clienteId, valor, vencimento }).lastInsertRowid
  )
}

function recebimento(contaId: number, valor: number, data: string): void {
  db.prepare('INSERT INTO recebimento (conta_receber_id, valor_centavos, data) VALUES (:contaId, :valor, :data)').run({ contaId, valor, data })
}

beforeAll(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS) db.exec(m.sql)
  banco.db = db

  // Renovacao: comprou 9 dias depois do contato.
  const ana = cliente('ana', 'Ana')
  contato(ana, 'RENOVACAO', '1', '2026-09-01')
  venda(ana, '2026-09-10', 80000)

  // Renovacao sem retorno: a unica compra foi ANTES do contato e a outra foi cancelada.
  const bia = cliente('bia', 'Bia')
  contato(bia, 'RENOVACAO', '2', '2026-09-02')
  venda(bia, '2026-09-01', 99900)
  venda(bia, '2026-09-05', 70000, 'CANCELADA')

  // Dois contatos seguidos de UMA venda: os dois "voltaram", mas a venda conta uma vez.
  const cris = cliente('cris', 'Cris')
  contato(cris, 'POS_VENDA', '10', '2026-09-03')
  contato(cris, 'ANIVERSARIO', '2026', '2026-09-03')
  venda(cris, '2026-09-12', 50000)

  // Retirada: uma OS entregue depois do contato e outra ainda esperando.
  const dani = cliente('dani', 'Dani')
  contato(dani, 'RETIRADA', String(os(dani, 'ENTREGUE', '2026-09-12')), '2026-09-10')
  const eli = cliente('eli', 'Eli')
  contato(eli, 'RETIRADA', String(os(eli, 'CHEGOU', null)), '2026-09-10')

  // Cobranca: pagou a parcela que ja estava vencida no dia do contato (R$ 110) e, junto, outra
  // que ainda nao vencia (R$ 50) - esta nao e "recuperada".
  const gil = cliente('gil', 'Gil')
  const pVencida = parcela(gil, 11000, '2026-08-10')
  const pAVencer = parcela(gil, 5000, '2026-09-20')
  contato(gil, 'COBRANCA', String(pVencida), '2026-09-05')
  recebimento(pVencida, 11000, '2026-09-08')
  recebimento(pAVencer, 5000, '2026-09-08')

  // Cobranca sem retorno: o pagamento foi ANTES do contato.
  const hugo = cliente('hugo', 'Hugo')
  const pHugo = parcela(hugo, 9000, '2026-08-01')
  contato(hugo, 'COBRANCA', String(pHugo), '2026-09-05')
  recebimento(pHugo, 9000, '2026-09-04')

  // Fora dos dois periodos (mais de 90 dias).
  const ivo = cliente('ivo', 'Ivo')
  contato(ivo, 'RENOVACAO', '3', '2026-06-01')
  venda(ivo, '2026-06-10', 60000)

  // So entra nos 90 dias, e a compra veio tarde demais (mais de 30 dias depois do contato).
  const jo = cliente('jo', 'Jo')
  contato(jo, 'RENOVACAO', '4', '2026-07-01')
  venda(jo, '2026-09-10', 45000)
})

afterAll(() => {
  banco.db?.close()
})

function motivo(r: ReturnType<typeof relacionamentoRepository.resultados>, m: string): { contatos: number; voltaram: number } {
  const linha = r.porMotivo.find((p) => p.motivo === m)!
  return { contatos: linha.contatos, voltaram: linha.voltaram }
}

describe('relacionamentoRepository.resultados', () => {
  it('30 dias: conta contatos, retornos e dinheiro, cada venda e cada pagamento uma vez', () => {
    const r = relacionamentoRepository.resultados(HOJE, 30)

    expect(r.desde).toBe('2026-08-21')
    expect(r.janelaDias).toBe(30)
    expect(r.contatos).toBe(8)
    expect(r.voltaram).toBe(5) // ana, cris (2 contatos), dani, gil
    expect(r.percentualVoltaram).toBe(62.5)

    expect(r.vendasAposContato).toBe(2) // a venda da Cris conta uma vez, mesmo com 2 contatos
    expect(r.vendidoCentavos).toBe(130000)

    expect(r.parcelasRecuperadas).toBe(1)
    expect(r.recuperadoCentavos).toBe(11000)
  })

  it('separa por motivo, na ordem de prioridade, com zeros quando nao houve contato', () => {
    const r = relacionamentoRepository.resultados(HOJE, 30)

    expect(r.porMotivo.map((p) => p.motivo)).toEqual(['RETIRADA', 'COBRANCA', 'ANIVERSARIO', 'POS_VENDA', 'RENOVACAO'])
    expect(motivo(r, 'RETIRADA')).toEqual({ contatos: 2, voltaram: 1 })
    expect(motivo(r, 'COBRANCA')).toEqual({ contatos: 2, voltaram: 1 })
    expect(motivo(r, 'ANIVERSARIO')).toEqual({ contatos: 1, voltaram: 1 })
    expect(motivo(r, 'POS_VENDA')).toEqual({ contatos: 1, voltaram: 1 })
    expect(motivo(r, 'RENOVACAO')).toEqual({ contatos: 2, voltaram: 1 })
  })

  it('90 dias: entram contatos mais antigos, mas compra fora da janela de 30 dias nao conta', () => {
    const r = relacionamentoRepository.resultados(HOJE, 90)

    expect(r.desde).toBe('2026-06-22')
    expect(r.contatos).toBe(9) // + Jo; o contato do Ivo (junho) continua de fora
    expect(r.voltaram).toBe(5) // a compra do Jo veio 71 dias depois
    expect(r.percentualVoltaram).toBe(55.6)
    expect(r.vendidoCentavos).toBe(130000)
  })

  it('sem nenhum contato no periodo: tudo zerado e percentual nulo', () => {
    const r = relacionamentoRepository.resultados('2027-06-01', 30)

    expect(r.contatos).toBe(0)
    expect(r.voltaram).toBe(0)
    expect(r.percentualVoltaram).toBeNull()
    expect(r.vendidoCentavos).toBe(0)
    expect(r.recuperadoCentavos).toBe(0)
    expect(r.porMotivo).toHaveLength(5)
  })
})
