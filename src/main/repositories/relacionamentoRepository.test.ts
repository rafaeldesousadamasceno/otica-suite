import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'

// SQLite em memoria com o schema REAL das migrations (incluindo a 007): o que se
// testa e o SQL dos gatilhos, nao um mock dele.
const { banco } = vi.hoisted(() => ({ banco: { db: null as DatabaseSync | null } }))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))

import { relacionamentoRepository } from './relacionamentoRepository'

const HOJE = '2026-09-19'

let db: DatabaseSync
const ids: Record<string, number> = {}

function cliente(chave: string, dados: { nome: string; nasc?: string; celular?: string; telefone?: string; ativo?: number; aceita?: number }): number {
  const info = db
    .prepare(
      `INSERT INTO cliente (nome, data_nasc, celular, telefone, ativo, aceita_contato)
       VALUES (:nome, :nasc, :celular, :telefone, :ativo, :aceita)`
    )
    .run({
      nome: dados.nome,
      nasc: dados.nasc ?? null,
      celular: dados.celular ?? '(11) 98765-4321',
      telefone: dados.telefone ?? null,
      ativo: dados.ativo ?? 1,
      aceita: dados.aceita ?? 1
    })
  ids[chave] = Number(info.lastInsertRowid)
  return ids[chave]
}

function os(numero: string, clienteId: number, situacao: string, extra: { chegada?: string; entrega?: string } = {}): number {
  const info = db
    .prepare(
      `INSERT INTO ordem_servico (numero, cliente_id, situacao, data_chegada, data_entrega)
       VALUES (:numero, :clienteId, :situacao, :chegada, :entrega)`
    )
    .run({ numero, clienteId, situacao, chegada: extra.chegada ?? null, entrega: extra.entrega ?? null })
  return Number(info.lastInsertRowid)
}

function receita(clienteId: number, dataExame: string): number {
  return Number(
    db.prepare('INSERT INTO receita_optica (cliente_id, data_exame) VALUES (:clienteId, :dataExame)').run({ clienteId, dataExame })
      .lastInsertRowid
  )
}

function parcela(clienteId: number, valor: number, vencimento: string, situacao = 'ABERTA'): number {
  return Number(
    db
      .prepare(
        'INSERT INTO conta_receber (cliente_id, valor_centavos, vencimento, situacao) VALUES (:clienteId, :valor, :vencimento, :situacao)'
      )
      .run({ clienteId, valor, vencimento, situacao }).lastInsertRowid
  )
}

function pendentesDe(chave: string): string[] {
  return relacionamentoRepository
    .listarPendentes(HOJE)
    .filter((p) => p.clienteId === ids[chave])
    .map((p) => p.motivo)
}

beforeAll(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS) db.exec(m.sql)
  banco.db = db

  ids.usuario = Number(
    db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Atendente', 'atendente', 'x', 'vendedor')").run()
      .lastInsertRowid
  )

  // aniversarios (janela de 7 dias: 19/09 a 25/09)
  cliente('anaHoje', { nome: 'Ana Silva', nasc: '1990-09-19' })
  cliente('betoEm5Dias', { nome: 'Beto Souza', nasc: '1985-09-24' })
  cliente('cidaFora', { nome: 'Cida Lima', nasc: '1980-09-26' })
  cliente('daviOptOut', { nome: 'Davi Optout', nasc: '1990-09-19', aceita: 0 })
  cliente('evaInativa', { nome: 'Eva Inativa', nasc: '1990-09-19', ativo: 0 })

  // retirada: OS chegou; o celular e um fixo (nao serve para WhatsApp)
  const fabio = cliente('fabio', { nome: 'Fabio Costa', celular: '(11) 3456-7890' })
  ids.osFabio = os('2026-00001', fabio, 'CHEGOU', { chegada: '2026-09-16' })

  // cobranca: duas parcelas vencidas (uma parcialmente paga) + uma futura + uma paga
  const gil = cliente('gil', { nome: 'Gil Prado' })
  ids.parcelaAntiga = parcela(gil, 10000, '2026-08-10')
  parcela(gil, 5000, '2026-09-01')
  parcela(gil, 9000, '2026-10-01') // a vencer: nao conta
  parcela(gil, 7000, '2026-07-01', 'PAGA') // paga: nao conta
  db.prepare("INSERT INTO recebimento (conta_receber_id, valor_centavos) VALUES (:id, 4000)").run({ id: ids.parcelaAntiga })

  // pos-venda: entregue ha 14 dias entra; ha 4 dias ainda nao
  const hugo = cliente('hugo', { nome: 'Hugo Alves' })
  ids.osHugo = os('2026-00002', hugo, 'ENTREGUE', { entrega: '2026-09-05' })
  os('2026-00003', hugo, 'ENTREGUE', { entrega: '2026-09-15' })

  // renovacao: janela de 12 a 15 meses desde o ultimo exame, sem compra desde entao
  const iara = cliente('iara', { nome: 'Iara Melo' })
  ids.receitaIara = receita(iara, '2025-08-20')
  const joao = cliente('joao', { nome: 'Joao Reis' })
  receita(joao, '2025-08-20')
  db.prepare(
    "INSERT INTO venda (numero, cliente_id, data, total_centavos, situacao) VALUES ('V1', :c, '2026-03-01', 1000, 'CONCLUIDA')"
  ).run({ c: joao }) // comprou depois do exame: nao precisa renovar
  const katia = cliente('katia', { nome: 'Katia Dias' })
  receita(katia, '2025-01-10') // 20 meses: velha demais, fora da janela
  const leo = cliente('leo', { nome: 'Leo Nunes' })
  receita(leo, '2025-01-01')
  ids.receitaLeo = receita(leo, '2025-08-25') // vale a mais recente
})

afterAll(() => {
  banco.db?.close()
})

describe('relacionamentoRepository.listarPendentes', () => {
  it('aniversario: hoje e os proximos 7 dias; fora da janela, opt-out e inativo ficam de fora', () => {
    expect(pendentesDe('anaHoje')).toEqual(['ANIVERSARIO'])
    expect(pendentesDe('betoEm5Dias')).toEqual(['ANIVERSARIO'])
    expect(pendentesDe('cidaFora')).toEqual([])
    expect(pendentesDe('daviOptOut')).toEqual([])
    expect(pendentesDe('evaInativa')).toEqual([])

    const ana = relacionamentoRepository.listarPendentes(HOJE).find((p) => p.clienteId === ids.anaHoje)!
    expect(ana.detalhe).toBe('Faz aniversário hoje')
    expect(ana.referencia).toBe('2026')
    const beto = relacionamentoRepository.listarPendentes(HOJE).find((p) => p.clienteId === ids.betoEm5Dias)!
    expect(beto.detalhe).toBe('Faz aniversário em 24/09')
  })

  it('retirada: OS que chegou vira pendencia, e um celular fixo aparece sem WhatsApp', () => {
    const p = relacionamentoRepository.listarPendentes(HOJE).find((x) => x.clienteId === ids.fabio)!
    expect(p.motivo).toBe('RETIRADA')
    expect(p.detalhe).toBe('Óculos da OS 2026-00001 chegaram há 3 dias')
    expect(p.referencia).toBe(String(ids.osFabio))
    expect(p.variaveis).toEqual({ nome: 'Fabio', numero_os: '2026-00001' })
    expect(p.celular).toBe('(11) 3456-7890')
    expect(p.temWhatsapp).toBe(false)
  })

  it('cobranca: um item por cliente, soma so o que falta pagar das vencidas, ocorrencia = parcela mais antiga', () => {
    const p = relacionamentoRepository.listarPendentes(HOJE).find((x) => x.clienteId === ids.gil)!
    expect(p.motivo).toBe('COBRANCA')
    expect(p.referencia).toBe(String(ids.parcelaAntiga))
    expect(p.detalhe).toBe('2 parcelas vencidas (R$ 110,00), a mais antiga venceu em 10/08/2026') // 6000 + 5000
    expect(p.variaveis).toMatchObject({ valor: 'R$ 110,00', vencimento: '10/08/2026' })
    expect(pendentesDe('gil')).toEqual(['COBRANCA'])
  })

  it('pos-venda: entregue entre 7 e 30 dias atras', () => {
    const doHugo = relacionamentoRepository.listarPendentes(HOJE).filter((x) => x.clienteId === ids.hugo)
    expect(doHugo).toHaveLength(1)
    expect(doHugo[0]).toMatchObject({ motivo: 'POS_VENDA', referencia: String(ids.osHugo), detalhe: 'Óculos da OS 2026-00002 entregues há 14 dias' })
  })

  it('renovacao: ultimo exame ha 12-15 meses e sem compra desde entao; vale a receita mais recente', () => {
    expect(pendentesDe('iara')).toEqual(['RENOVACAO'])
    expect(pendentesDe('joao')).toEqual([]) // comprou depois do exame
    expect(pendentesDe('katia')).toEqual([]) // exame antigo demais
    const leo = relacionamentoRepository.listarPendentes(HOJE).find((x) => x.clienteId === ids.leo)!
    expect(leo.referencia).toBe(String(ids.receitaLeo))
    expect(leo.detalhe).toContain('Último exame em 25/08/2025')
  })

  it('ordena por prioridade do motivo (retirada, cobranca, aniversario, pos-venda, renovacao)', () => {
    const motivos = relacionamentoRepository.listarPendentes(HOJE).map((p) => p.motivo)
    const ordem = ['RETIRADA', 'COBRANCA', 'ANIVERSARIO', 'POS_VENDA', 'RENOVACAO']
    const indices = motivos.map((m) => ordem.indexOf(m))
    expect(indices).toEqual([...indices].sort((a, b) => a - b))
  })
})

describe('relacionamentoRepository - registro de contato e opt-out', () => {
  it('contato registrado tira so aquela ocorrencia da lista, e registrar de novo e inofensivo', () => {
    const dados = { clienteId: ids.anaHoje, motivo: 'ANIVERSARIO' as const, referencia: '2026', observacao: 'Mandei mensagem', usuarioId: ids.usuario }
    expect(relacionamentoRepository.registrarContato(dados)).toBe(true)
    expect(pendentesDe('anaHoje')).toEqual([])
    expect(relacionamentoRepository.registrarContato(dados)).toBe(false)
  })

  it('opt-out tira o cliente de todas as listas; reativar traz de volta', () => {
    expect(pendentesDe('betoEm5Dias')).toEqual(['ANIVERSARIO'])
    expect(relacionamentoRepository.definirAceitaContato(ids.betoEm5Dias, false)).toBe(true)
    expect(pendentesDe('betoEm5Dias')).toEqual([])
    expect(relacionamentoRepository.listarSemContato().map((c) => c.nome)).toEqual(expect.arrayContaining(['Beto Souza', 'Davi Optout']))

    relacionamentoRepository.definirAceitaContato(ids.betoEm5Dias, true)
    expect(pendentesDe('betoEm5Dias')).toEqual(['ANIVERSARIO'])
  })

  it('definir opt-out de cliente inexistente devolve false', () => {
    expect(relacionamentoRepository.definirAceitaContato(999999, false)).toBe(false)
  })

  it('excluir um cliente leva os contatos dele junto (sem quebrar na chave estrangeira)', () => {
    const c = cliente('descartavel', { nome: 'Descartavel Teste' })
    relacionamentoRepository.registrarContato({ clienteId: c, motivo: 'RENOVACAO', referencia: '1', observacao: null, usuarioId: ids.usuario })
    expect(() => db.prepare('DELETE FROM cliente WHERE id = :c').run({ c })).not.toThrow()
    expect((db.prepare('SELECT COUNT(*) AS n FROM contato WHERE cliente_id = :c').get({ c }) as { n: number }).n).toBe(0)
  })
})
