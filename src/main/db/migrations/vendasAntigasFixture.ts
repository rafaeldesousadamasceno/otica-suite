import { DatabaseSync } from 'node:sqlite'
import { MIGRATIONS } from './index'

export const VERSAO = 16

/** Banco como o de uma otica que ja usa o sistema (versoes 1 a 15). */
export function bancoDeCliente(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS.filter((x) => x.version < VERSAO)) db.exec(m.sql)
  return db
}

export const migracao = (): string => MIGRATIONS.find((m) => m.version === VERSAO)!.sql

/**
 * Vendas de antes: entrada + promissoria em 5x (uma parcela paga), uma a vista, um cartao parcelado (que,
 * na epoca, virava parcelas do cliente) e uma com forma que nao esta mais na lista.
 */
export function popularVendasAntigas(db: DatabaseSync): void {
  db.exec("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Ana', 'ana', 'x', 'admin')")
  db.exec("INSERT INTO cliente (nome) VALUES ('MARIA'), ('JOSE')")
  db.exec(`INSERT INTO produto (descricao, categoria, unidade, custo_centavos, margem, preco_venda_centavos, estoque_minimo)
           VALUES ('ARMAÇÃO', 'armacao', 'UN', 30000, 100, 94000, 0)`)
  db.exec(`INSERT INTO venda (numero, cliente_id, vendedor_id, data, subtotal_centavos, desconto_centavos, total_centavos)
           VALUES ('2026-00001', 1, 1, '2026-10-01', 94000, 1500, 92500),
                  ('2026-00002', 2, 1, '2026-10-02', 10000, 0, 10000),
                  ('2026-00003', 1, 1, '2026-10-03', 30000, 0, 30000),
                  ('2026-00004', 2, 1, '2026-10-04', 5000, 0, 5000)`)
  db.exec(`INSERT INTO venda_item (venda_id, produto_id, descricao, quantidade, preco_unitario_centavos, desconto_centavos, total_centavos)
           VALUES (1, 1, 'ARMAÇÃO', 1, 94000, 1500, 92500)`)
  db.exec(`INSERT INTO venda_pagamento (venda_id, forma_pagamento, valor_centavos, parcelas)
           VALUES (1, 'ENTRADA', 20000, 1), (1, 'PROMISSÓRIA', 72500, 5),
                  (2, 'À VISTA', 10000, 1),
                  (3, 'CARTÃO', 30000, 3),
                  (4, 'CHEQUE PRÉ-DATADO', 5000, 1)`)
  db.exec(`INSERT INTO lancamento (tipo, categoria, descricao, valor_centavos, data, origem_tipo, origem_id, usuario_id)
           VALUES ('RECEITA', 'VENDA', 'Venda 2026-00001 - ENTRADA', 20000, '2026-10-01', 'venda', 1, 1),
                  ('RECEITA', 'VENDA', 'Venda 2026-00002 - À VISTA', 10000, '2026-10-02', 'venda', 2, 1),
                  ('RECEITA', 'VENDA', 'Venda 2026-00004 - CHEQUE PRÉ-DATADO', 5000, '2026-10-04', 'venda', 4, 1)`)
  const parcelas: [number, number, number, string][] = [
    [1, 1, 14500, '2026-10-31'], [1, 2, 14500, '2026-11-30'], [1, 3, 14500, '2026-12-30'], [1, 4, 14500, '2027-01-30'], [1, 5, 14500, '2027-03-02'],
    [3, 1, 10000, '2026-11-02'], [3, 2, 10000, '2026-12-02'], [3, 3, 10000, '2027-01-02']
  ]
  for (const [vendaId, parcela, valor, vencimento] of parcelas) {
    db.prepare(
      `INSERT INTO conta_receber (venda_id, cliente_id, parcela, total_parcelas, valor_centavos, vencimento)
       VALUES (?, (SELECT cliente_id FROM venda WHERE id = ?), ?, ?, ?, ?)`
    ).run(vendaId, vendaId, parcela, vendaId === 1 ? 5 : 3, valor, vencimento)
  }
  db.exec("UPDATE conta_receber SET situacao = 'PAGA' WHERE id = 1")
  db.exec("INSERT INTO recebimento (conta_receber_id, valor_centavos, data, forma_pagamento, usuario_id) VALUES (1, 14500, '2026-10-31', 'PIX', 1)")
  db.exec("INSERT INTO comissao (venda_id, vendedor_id, base_centavos, percentual, valor_centavos) VALUES (1, 1, 92500, 3, 2775)")
}
