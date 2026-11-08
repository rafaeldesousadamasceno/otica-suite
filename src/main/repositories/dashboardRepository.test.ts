import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'
import { registrarFuncoesSql } from '@main/db/funcoesSql'
import { DESCRICAO_PRODUTO_IMPORTADO } from '@shared/importacao'

// SQLite em memoria com o schema REAL das migrations: o que se testa aqui e o
// SQL das consultas do painel (nome de coluna, JOIN, filtro, rateio), nao um mock dele.
const { banco } = vi.hoisted(() => ({ banco: { db: null as DatabaseSync | null } }))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))

import { dashboardRepository as repo } from './dashboardRepository'

/** Fixa "hoje" (meio-dia local) para as datas nao dependerem do dia em que o teste roda. */
const HOJE = '2026-09-19'
const SETEMBRO = { inicio: '2026-09-01', fim: '2026-09-30' }
const AGOSTO = { inicio: '2026-08-01', fim: '2026-08-31' }

const ids: Record<string, number> = {}

function venda(
  db: DatabaseSync,
  v: { numero: string; vendedorId: number; data: string; total: number; clienteId?: number; situacao?: string; subtotal?: number }
): number {
  const info = db
    .prepare(
      `INSERT INTO venda (numero, cliente_id, vendedor_id, data, subtotal_centavos, desconto_centavos, total_centavos, situacao)
       VALUES (:numero, :clienteId, :vendedorId, :data, :subtotal, :desconto, :total, :situacao)`
    )
    .run({
      numero: v.numero,
      clienteId: v.clienteId ?? 1,
      vendedorId: v.vendedorId,
      data: v.data,
      subtotal: v.subtotal ?? v.total,
      desconto: (v.subtotal ?? v.total) - v.total,
      total: v.total,
      situacao: v.situacao ?? 'CONCLUIDA'
    })
  return Number(info.lastInsertRowid)
}

function item(db: DatabaseSync, vendaId: number, produtoId: number | null, total: number, qtd = 1, custo: number | null = null): void {
  db.prepare(
    `INSERT INTO venda_item (venda_id, produto_id, descricao, quantidade, preco_unitario_centavos, total_centavos, custo_unitario_centavos)
     VALUES (:vendaId, :produtoId, 'item', :qtd, :preco, :total, :custo)`
  ).run({ vendaId, produtoId, qtd, preco: Math.round(total / qtd), total, custo })
}

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${HOJE}T15:00:00`))

  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  registrarFuncoesSql(db)
  for (const m of MIGRATIONS) db.exec(m.sql)
  banco.db = db

  const usuario = db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES (:nome, :login, 'x', :perfil)")
  usuario.run({ nome: 'Ana', login: 'ana', perfil: 'admin' }) // 1
  usuario.run({ nome: 'Beto', login: 'beto', perfil: 'vendedor' }) // 2
  usuario.run({ nome: 'Cida', login: 'cida', perfil: 'vendedor' }) // 3
  usuario.run({ nome: 'Davi', login: 'davi', perfil: 'vendedor' }) // 4 - nunca vende
  const cliente = db.prepare('INSERT INTO cliente (nome) VALUES (:nome)')
  for (const nome of ['Cliente A', 'Cliente B', 'Cliente C']) cliente.run({ nome }) // 1, 2, 3

  const produto = db.prepare('INSERT INTO produto (descricao, categoria, custo_centavos) VALUES (:d, :c, :custo)')
  ids.armacao = Number(produto.run({ d: 'Armacao', c: 'armacao', custo: 3000 }).lastInsertRowid)
  ids.lente = Number(produto.run({ d: 'Lente', c: 'lente', custo: 2000 }).lastInsertRowid)
  ids.semCusto = Number(produto.run({ d: 'Sem custo', c: 'acessorio', custo: 0 }).lastInsertRowid)
  ids.importado = Number(produto.run({ d: DESCRICAO_PRODUTO_IMPORTADO, c: 'servico', custo: 0 }).lastInsertRowid)

  // Setembro. V1 (Beto, cliente A): armacao 10000 (custo gravado 4000) + lente 5000 (sem custo gravado -> usa o atual, 2000).
  const v1 = venda(db, { numero: 'V1', vendedorId: 2, data: '2026-09-10', total: 15000, clienteId: 1 })
  item(db, v1, ids.armacao, 10000, 1, 4000)
  item(db, v1, ids.lente, 5000)
  // V2 (Cida, cliente B): so produto sem custo cadastrado e item importado.
  const v2 = venda(db, { numero: 'V2', vendedorId: 3, data: '2026-09-12', total: 8000, clienteId: 2 })
  item(db, v2, ids.semCusto, 3000)
  item(db, v2, ids.importado, 5000)
  // V3 (Beto, cliente A de novo): com desconto geral de 1000 sobre 11000 de itens -> total 10000.
  const v3 = venda(db, { numero: 'V3', vendedorId: 2, data: '2026-09-19', total: 10000, subtotal: 11000, clienteId: 1 })
  item(db, v3, ids.armacao, 6000, 1, 3000)
  item(db, v3, ids.lente, 5000, 1, 2000)
  // Cancelada: nunca entra.
  const v4 = venda(db, { numero: 'V4', vendedorId: 2, data: '2026-09-15', total: 55555, situacao: 'CANCELADA' })
  item(db, v4, ids.armacao, 55555)
  // Venda sem nenhum item -> "outros".
  venda(db, { numero: 'V5', vendedorId: 3, data: '2026-09-16', total: 2000, clienteId: 3 })
  // Agosto (periodo de comparacao): cliente A ja comprava.
  const v6 = venda(db, { numero: 'V6', vendedorId: 2, data: '2026-08-20', total: 4000, clienteId: 1 })
  item(db, v6, ids.armacao, 4000, 1, 1000)

  db.prepare("INSERT INTO comissao (venda_id, vendedor_id, base_centavos, percentual, valor_centavos, situacao) VALUES (:v, 2, 15000, 5, 750, 'LIBERADA')").run({ v: v1 })
  db.prepare("INSERT INTO comissao (venda_id, vendedor_id, base_centavos, percentual, valor_centavos, situacao) VALUES (:v, 2, 55555, 5, 2777, 'CANCELADA')").run({ v: v4 })

  db.prepare("INSERT INTO venda_pagamento (venda_id, forma_pagamento, valor_centavos, parcelas) VALUES (:v, 'PIX', 5000, 1)").run({ v: v1 })
  db.prepare("INSERT INTO venda_pagamento (venda_id, forma_pagamento, valor_centavos, parcelas) VALUES (:v, 'PROMISSÓRIA', 10000, 3)").run({ v: v1 })
  db.prepare("INSERT INTO venda_pagamento (venda_id, forma_pagamento, valor_centavos, parcelas) VALUES (:v, 'PIX', 55555, 1)").run({ v: v4 })

  const lancamento = db.prepare(
    "INSERT INTO lancamento (tipo, categoria, descricao, valor_centavos, data) VALUES (:tipo, :categoria, 'l', :valor, :data)"
  )
  lancamento.run({ tipo: 'RECEITA', categoria: 'VENDA', valor: 10000, data: '2026-09-10' })
  lancamento.run({ tipo: 'RECEITA', categoria: null, valor: 2000, data: '2026-09-11' }) // importado, sem categoria: conta
  lancamento.run({ tipo: 'RECEITA', categoria: 'SUPRIMENTO', valor: 50000, data: '2026-09-12' }) // nao e receita
  lancamento.run({ tipo: 'DESPESA', categoria: 'SANGRIA', valor: 30000, data: '2026-09-13' }) // nao e despesa
  lancamento.run({ tipo: 'DESPESA', categoria: 'ESTORNO_VENDA', valor: 1500, data: '2026-09-14' }) // abate o recebido
  lancamento.run({ tipo: 'DESPESA', categoria: 'ALUGUEL', valor: 4000, data: '2026-09-15' })
  lancamento.run({ tipo: 'RECEITA', categoria: 'VENDA', valor: 7000, data: '2026-08-20' })

  // Contas a receber: 1 vencida (saldo 2500 apos recebimento parcial de 500), 1 a vencer, 1 paga.
  const cr = db.prepare(
    `INSERT INTO conta_receber (venda_id, cliente_id, parcela, total_parcelas, valor_centavos, vencimento, situacao)
     VALUES (:venda, 1, 1, 3, :valor, :venc, :situacao)`
  )
  const crVencida = Number(cr.run({ venda: v1, valor: 3000, venc: '2026-09-05', situacao: 'ABERTA' }).lastInsertRowid)
  cr.run({ venda: v1, valor: 3000, venc: '2026-10-05', situacao: 'ABERTA' })
  cr.run({ venda: v2, valor: 4000, venc: '2026-09-01', situacao: 'PAGA' })
  db.prepare("INSERT INTO recebimento (conta_receber_id, valor_centavos, data) VALUES (:c, 500, '2026-09-06')").run({ c: crVencida })

  const cp = db.prepare("INSERT INTO conta_pagar (descricao, valor_centavos, vencimento, situacao) VALUES (:d, :valor, :venc, 'ABERTA')")
  cp.run({ d: 'vencida', valor: 8000, venc: '2026-09-10' })
  cp.run({ d: 'hoje', valor: 1200, venc: HOJE })
  cp.run({ d: 'futura', valor: 999, venc: '2026-10-30' })

  const os = db.prepare(
    `INSERT INTO ordem_servico (numero, cliente_id, situacao, criado_por, data_abertura, data_previsao, data_chegada, data_entrega)
     VALUES (:numero, 1, :situacao, :criadoPor, :abertura, :previsao, :chegada, :entrega)`
  )
  const base = { previsao: null, chegada: null, entrega: null }
  os.run({ ...base, numero: 'OS1', situacao: 'EM ABERTO', criadoPor: 2, abertura: '2026-09-02', previsao: '2026-09-10' }) // atrasada
  os.run({ ...base, numero: 'OS2', situacao: 'LABORATÓRIO', criadoPor: 2, abertura: '2026-09-03', previsao: '2026-09-25' })
  os.run({ ...base, numero: 'OS3', situacao: 'CHEGOU', criadoPor: 3, abertura: '2026-08-01', previsao: '2026-09-01', chegada: '2026-09-05' }) // pronta ha mais de 7 dias
  os.run({ ...base, numero: 'OS4', situacao: 'CHEGOU', criadoPor: 3, abertura: '2026-09-10', chegada: '2026-09-17' })
  os.run({ ...base, numero: 'OS5', situacao: 'ENTREGUE', criadoPor: 2, abertura: '2026-09-01', chegada: '2026-09-08', entrega: '2026-09-11' }) // 10 dias
  os.run({ ...base, numero: 'OS6', situacao: 'ENTREGUE', criadoPor: 3, abertura: '2026-09-05', chegada: '2026-09-08', entrega: '2026-09-09' }) // 4 dias
  os.run({ ...base, numero: 'OS7', situacao: 'CANCELADA', criadoPor: 2, abertura: '2026-09-04', previsao: '2026-09-06' })
})

afterAll(() => {
  vi.useRealTimers()
  banco.db?.close()
})

describe('faturamento e vendas', () => {
  it('soma so vendas validas do periodo (cancelada e outro mes ficam de fora)', () => {
    expect(repo.resumoVendas(SETEMBRO, null)).toEqual({ quantidade: 4, totalCentavos: 35000 })
    expect(repo.resumoVendas(AGOSTO, null)).toEqual({ quantidade: 1, totalCentavos: 4000 })
  })

  it('filtra por vendedor', () => {
    expect(repo.resumoVendas(SETEMBRO, 2)).toEqual({ quantidade: 2, totalCentavos: 25000 })
    expect(repo.resumoVendas(SETEMBRO, 3)).toEqual({ quantidade: 2, totalCentavos: 10000 })
  })

  it('serie diaria so traz dias com venda e bate com o total', () => {
    const dias = repo.faturamentoDiario(SETEMBRO, null)
    expect(dias.reduce((s, d) => s + d.valor, 0)).toBe(35000)
    expect(dias.find((d) => d.data === HOJE)?.valor).toBe(10000)
  })

  it('o periodo inclui o primeiro e o ultimo dia', () => {
    expect(repo.resumoVendas({ inicio: '2026-09-19', fim: '2026-09-19' }, null).totalCentavos).toBe(10000)
    expect(repo.resumoVendas({ inicio: '2026-09-10', fim: '2026-09-10' }, null).totalCentavos).toBe(15000)
  })
})

describe('categorias', () => {
  it('o desconto geral e rateado e as fatias somam exatamente o faturamento', () => {
    const fatias = repo.categorias(SETEMBRO, null, 35000)
    expect(fatias.reduce((s, f) => s + f.totalCentavos, 0)).toBe(35000)

    // V3: itens 6000 (armacao) e 5000 (lente) com total 10000 -> 5455 e 4545.
    const armacao = fatias.find((f) => f.categoria === 'armacao')!
    expect(armacao.totalCentavos).toBe(10000 + 5455)
    expect(armacao.quantidade).toBe(2)
  })

  it('venda sem item entra em "outros", e ordena da maior para a menor', () => {
    const fatias = repo.categorias(SETEMBRO, null, 35000)
    expect(fatias.map((f) => f.categoria)[0]).toBe('armacao')
    expect(fatias.find((f) => f.categoria === 'outros')?.totalCentavos).toBe(2000)
  })

  it('com vendedor, soma o faturamento dele', () => {
    const fatias = repo.categorias(SETEMBRO, 2, 25000)
    expect(fatias.reduce((s, f) => s + f.totalCentavos, 0)).toBe(25000)
  })
})

describe('lucro bruto', () => {
  it('usa o custo gravado na venda, ou o atual do produto, e ignora item importado e sem custo', () => {
    const lucro = repo.lucroBruto(SETEMBRO, null)
    // V1: armacao 10000 - 4000 (gravado) + lente 5000 - 2000 (atual) = 9000.
    // V3 (rateado 10000/11000): armacao 5454,55 - 3000 + lente 4545,45 - 2000 = 5000.
    expect(lucro.lucroCentavos).toBe(9000 + 5000)
    // Receita com custo = V1 15000 + V3 10000; os itens da V2 (sem custo e importado) ficam fora.
    expect(lucro.receitaComCustoCentavos).toBe(25000)
    expect(lucro.receitaItensCentavos).toBe(33000) // 15000 + 8000 + 10000 (a venda sem item nao tem item)
  })

  it('a cobertura mostra que parte da receita tem custo', () => {
    const lucro = repo.lucroBruto(SETEMBRO, null)
    expect(lucro.receitaComCustoCentavos / lucro.receitaItensCentavos).toBeCloseTo(0.7576, 3)
  })
})

describe('produtos mais vendidos', () => {
  it('nao lista o item importado e traz a margem so quando o custo e conhecido', () => {
    const lista = repo.topProdutos(SETEMBRO, null)
    expect(lista.map((p) => p.descricao)).toEqual(['Armacao', 'Lente', 'Sem custo'])
    expect(lista[0]).toMatchObject({ quantidade: 2, totalCentavos: 15455, margemCentavos: 15455 - 7000 })
    expect(lista.find((p) => p.descricao === 'Sem custo')?.margemCentavos).toBeNull()
  })
})

describe('formas de pagamento', () => {
  it('soma o vendido por forma, sem a venda cancelada', () => {
    expect(repo.formasPagamento(SETEMBRO, null)).toEqual([
      { forma: 'PROMISSÓRIA', totalCentavos: 10000 },
      { forma: 'PIX', totalCentavos: 5000 }
    ])
  })
})

describe('clientes', () => {
  it('novo compra pela primeira vez; recorrente ja tinha comprado antes do periodo', () => {
    // Setembro: A (comprou em agosto -> recorrente), B e C (novos). A venda cancelada nao conta.
    expect(repo.clientes(SETEMBRO, null)).toEqual({ novos: 2, recorrentes: 1 })
    // Agosto: A comprou pela primeira vez.
    expect(repo.clientes(AGOSTO, null)).toEqual({ novos: 1, recorrentes: 0 })
  })

  it('compra so cancelada antes do periodo nao torna ninguem recorrente', () => {
    const db = banco.db!
    db.prepare("INSERT INTO cliente (nome) VALUES ('Cliente D')").run()
    const d = Number((db.prepare('SELECT last_insert_rowid() AS id').get() as { id: number }).id)
    venda(db, { numero: 'VC', vendedorId: 2, data: '2026-07-01', total: 100, clienteId: d, situacao: 'CANCELADA' })
    venda(db, { numero: 'VD', vendedorId: 2, data: '2026-09-18', total: 100, clienteId: d })
    expect(repo.clientes({ inicio: '2026-09-18', fim: '2026-09-18' }, null)).toEqual({ novos: 1, recorrentes: 0 })
    db.prepare('DELETE FROM venda WHERE cliente_id = ?').run(d)
  })
})

describe('comissao e ranking', () => {
  it('comissao do vendedor no periodo ignora a cancelada', () => {
    expect(repo.comissao(SETEMBRO, 2)).toBe(750)
  })

  it('ranking traz vendedor sem venda com zero e nao traz o administrador sem venda', () => {
    const ranking = repo.ranking(SETEMBRO)
    expect(ranking.map((r) => [r.vendedorNome, r.quantidadeVendas, r.totalCentavos])).toEqual([
      ['Beto', 2, 25000],
      ['Cida', 2, 10000],
      ['Davi', 0, 0]
    ])
  })
})

describe('caixa', () => {
  it('recebido = entradas sem suprimento, menos estornos; despesas sem sangria nem estorno', () => {
    expect(repo.caixa(SETEMBRO)).toEqual({ recebidoCentavos: 10000 + 2000 - 1500, despesasCentavos: 4000 })
    expect(repo.caixa(AGOSTO)).toEqual({ recebidoCentavos: 7000, despesasCentavos: 0 })
  })

  it('serie diaria bate com o total do periodo', () => {
    const dias = repo.caixaDiario(SETEMBRO)
    expect(dias.reduce((s, d) => s + d.recebidoCentavos, 0)).toBe(10500)
    expect(dias.reduce((s, d) => s + d.despesasCentavos, 0)).toBe(4000)
    expect(dias.find((d) => d.data === '2026-09-14')?.recebidoCentavos).toBe(-1500)
  })
})

describe('ordens de servico', () => {
  it('funil atual, abertas e entregues no periodo e tempo medio ate a entrega', () => {
    const os = repo.os(SETEMBRO, null)
    expect(os.porEtapa).toEqual([
      { situacao: 'EM ABERTO', quantidade: 1 },
      { situacao: 'LABORATÓRIO', quantidade: 1 },
      { situacao: 'CHEGOU', quantidade: 2 }
    ])
    expect(os.abertasNoPeriodo).toBe(6) // OS3 abriu em agosto
    expect(os.entreguesNoPeriodo).toBe(2)
    expect(os.diasMediosAteEntrega).toBe(7) // (10 + 4) / 2
  })

  it('vendedor ve so as proprias OS', () => {
    const os = repo.os(SETEMBRO, 3)
    expect(os.porEtapa.map((e) => e.quantidade)).toEqual([0, 0, 2])
    expect(os.entreguesNoPeriodo).toBe(1)
  })

  it('sem entregas no periodo o tempo medio e nulo', () => {
    expect(repo.os(AGOSTO, null).diasMediosAteEntrega).toBeNull()
  })
})

describe('posicao atual', () => {
  it('contas a receber em aberto e vencidas, pelo saldo (descontando o ja recebido)', () => {
    const { receber } = repo.posicao(null, true)
    expect(receber).toEqual({ abertoCentavos: 2500 + 3000, abertoQtd: 2, vencidasCentavos: 2500, vencidasQtd: 1 })
  })

  it('contas a pagar vencidas e do dia, so quando pedido', () => {
    expect(repo.posicao(null, true).pagar).toEqual({ vencidasCentavos: 8000, vencidasQtd: 1, hojeCentavos: 1200, hojeQtd: 1 })
    expect(repo.posicao(null, false).pagar).toBeNull()
  })

  it('OS atrasadas, prontas e prontas ha mais de 7 dias', () => {
    const p = repo.posicao(null, true)
    expect(p.osAtrasadas).toBe(1) // OS1; a OS7 cancelada nao conta
    expect(p.osProntas).toBe(2)
    expect(p.osProntasHaMuito).toBe(1) // OS3 chegou em 05/09; OS4 em 17/09
  })

  it('com vendedor, receber e OS ficam so dele', () => {
    const p = repo.posicao(3, false)
    expect(p.receber?.abertoQtd).toBe(0)
    expect(p.osAtrasadas).toBe(0)
    expect(p.osProntas).toBe(2)
  })
})

describe('contagens sem limite de linhas (regressao do LIMIT antes do filtro)', () => {
  it('conta 301 OS atrasadas e as lista filtrando no SQL', async () => {
    const db = banco.db!
    const os = db.prepare(
      "INSERT INTO ordem_servico (numero, cliente_id, situacao, criado_por, data_abertura, data_previsao) VALUES (:n, 1, 'EM ABERTO', 2, '2026-01-01', '2026-02-01')"
    )
    for (let i = 0; i < 301; i++) os.run({ n: `ATR${i}` })
    const antes = repo.posicao(null, false).osAtrasadas
    expect(antes).toBe(302)

    const { ordemServicoRepository } = await import('./ordemServicoRepository')
    expect(ordemServicoRepository.listar({ apenasAtrasadas: true })).toHaveLength(300) // o limite de tela continua
    db.prepare("DELETE FROM ordem_servico WHERE numero LIKE 'ATR%'").run()
  })
})
