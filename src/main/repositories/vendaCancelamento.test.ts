import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'

const { banco } = vi.hoisted(() => ({ banco: { db: null as DatabaseSync | null } }))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))

import { vendaRepository } from './vendaRepository'

const um = <T>(sql: string): T => banco.db!.prepare(sql).get() as T

/**
 * Venda como a do balcao: entrada a vista de R$ 200 e o resto (R$ 725) em 5
 * parcelas no contas a receber, com comissao provisionada e um produto que
 * baixou o estoque.
 */
function vendaComEntradaEParcelas(db: DatabaseSync): number {
  db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Ana', 'ana', 'x', 'admin')").run()
  db.prepare("INSERT INTO cliente (nome) VALUES ('MARIA')").run()
  db.prepare(
    `INSERT INTO produto (descricao, categoria, unidade, custo_centavos, margem, preco_venda_centavos, estoque_minimo)
     VALUES ('ARMAÇÃO', 'armacao', 'UN', 30000, 100, 94000, 0)`
  ).run()
  db.prepare(
    `INSERT INTO estoque_movimento (produto_id, tipo, quantidade, saldo_apos, documento_tipo, documento_id, usuario_id)
     VALUES (1, 'compra', 3, 3, 'compra', 1, 1), (1, 'venda', -1, 2, 'venda', 1, 1)`
  ).run()
  db.prepare(
    `INSERT INTO venda (numero, cliente_id, vendedor_id, subtotal_centavos, desconto_centavos, total_centavos)
     VALUES ('V-0001', 1, 1, 94000, 1500, 92500)`
  ).run()
  db.prepare(
    `INSERT INTO venda_item (venda_id, produto_id, descricao, quantidade, preco_unitario_centavos, desconto_centavos, total_centavos)
     VALUES (1, 1, 'ARMAÇÃO', 1, 94000, 1500, 92500)`
  ).run()
  db.prepare(
    `INSERT INTO lancamento (tipo, categoria, descricao, valor_centavos, data, origem_tipo, origem_id, usuario_id)
     VALUES ('RECEITA', 'VENDA', 'Entrada da venda V-0001', 20000, '2026-11-23', 'venda', 1, 1)`
  ).run()
  const vencimentos = ['2026-12-23', '2027-01-23', '2027-02-23', '2027-03-23', '2027-04-23']
  vencimentos.forEach((vencimento, i) => {
    db.prepare(
      `INSERT INTO conta_receber (venda_id, cliente_id, parcela, total_parcelas, valor_centavos, vencimento)
       VALUES (1, 1, ?, 5, 14500, ?)`
    ).run(i + 1, vencimento)
  })
  db.prepare(
    `INSERT INTO comissao (venda_id, vendedor_id, base_centavos, percentual, valor_centavos)
     VALUES (1, 1, 92500, 3, 2775)`
  ).run()
  return 1
}

describe('cancelar venda com contas a receber', () => {
  beforeEach(() => {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    for (const m of MIGRATIONS) db.exec(m.sql)
    banco.db = db
  })

  it('cancela tudo de uma vez: parcelas, comissão, estoque e estorna a entrada', () => {
    const vendaId = vendaComEntradaEParcelas(banco.db!)

    vendaRepository.cancelar(vendaId, { usuarioId: 1 })

    expect(um<{ situacao: string }>('SELECT situacao FROM venda WHERE id = 1').situacao).toBe('CANCELADA')
    expect(um<{ n: number }>("SELECT COUNT(*) AS n FROM conta_receber WHERE situacao <> 'CANCELADA'").n).toBe(0)
    expect(um<{ situacao: string }>('SELECT situacao FROM comissao').situacao).toBe('CANCELADA')
    expect(um<{ saldo_apos: number }>('SELECT saldo_apos FROM estoque_movimento ORDER BY id DESC LIMIT 1').saldo_apos).toBe(3)
    const estorno = um<{ valor_centavos: number }>("SELECT valor_centavos FROM lancamento WHERE categoria = 'ESTORNO_VENDA'")
    expect(estorno.valor_centavos).toBe(20000)
  })

  it('parcela já paga entra no estorno junto com a entrada', () => {
    const vendaId = vendaComEntradaEParcelas(banco.db!)
    banco.db!.prepare("UPDATE conta_receber SET situacao = 'PAGA' WHERE parcela = 1").run()
    banco.db!.prepare("INSERT INTO recebimento (conta_receber_id, valor_centavos, forma_pagamento, usuario_id) VALUES (1, 14500, 'PIX', 1)").run()

    vendaRepository.cancelar(vendaId, { usuarioId: 1 })

    const estorno = um<{ valor_centavos: number }>("SELECT valor_centavos FROM lancamento WHERE categoria = 'ESTORNO_VENDA'")
    expect(estorno.valor_centavos).toBe(20000 + 14500)
  })
})
