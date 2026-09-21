import { getDb } from '@main/db/connection'
import type { ContaPagar, SituacaoContaPagar } from '@shared/types'
import { hojeLocal } from '@shared/data'

function hoje(): string {
  return hojeLocal()
}

/** "2026-01-31" -> "2026-02-28" (o overflow de dia inexistente rola para o mes seguinte - limitacao aceita para o v1). */
function proximoMes(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(Date.UTC(ano, mes, dia)).toISOString().slice(0, 10)
}

const SELECT_CONTA_PAGAR = `
  SELECT cp.id, cp.compra_id, cp.fornecedor_id, f.razao_social AS fornecedor_nome,
         cp.descricao, cp.categoria, cp.valor_centavos, cp.vencimento, cp.situacao, cp.recorrente,
         COALESCE((SELECT SUM(p.valor_centavos) FROM pagamento p WHERE p.conta_pagar_id = cp.id), 0) AS valor_pago_centavos
  FROM conta_pagar cp
  LEFT JOIN fornecedor f ON f.id = cp.fornecedor_id
`

interface ContaPagarRow {
  id: number
  compra_id: number | null
  fornecedor_id: number | null
  fornecedor_nome: string | null
  descricao: string
  categoria: string | null
  valor_centavos: number
  vencimento: string
  situacao: SituacaoContaPagar
  recorrente: number
  valor_pago_centavos: number
}

function toContaPagar(row: ContaPagarRow): ContaPagar {
  return {
    id: row.id,
    compraId: row.compra_id,
    fornecedorId: row.fornecedor_id,
    fornecedorNome: row.fornecedor_nome,
    descricao: row.descricao,
    categoria: row.categoria,
    valorCentavos: row.valor_centavos,
    valorPagoCentavos: row.valor_pago_centavos,
    vencimento: row.vencimento,
    situacao: row.situacao,
    recorrente: row.recorrente === 1,
    vencida: row.situacao === 'ABERTA' && row.vencimento < hoje()
  }
}

export const contaPagarRepository = {
  listar(query: { busca?: string; situacao?: string; apenasVencidas?: boolean }): ContaPagar[] {
    const rows = getDb()
      .prepare(
        `${SELECT_CONTA_PAGAR}
         WHERE (cp.descricao LIKE :termo OR f.razao_social LIKE :termo)
           AND (:situacao = '' OR cp.situacao = :situacao)
           AND (:apenasVencidas = 0 OR (cp.situacao = 'ABERTA' AND cp.vencimento < :hoje))
         ORDER BY cp.vencimento ASC, cp.id ASC
         LIMIT 500`
      )
      .all({
        termo: `%${query.busca?.trim() ?? ''}%`,
        situacao: query.situacao?.trim() || '',
        apenasVencidas: query.apenasVencidas ? 1 : 0,
        hoje: hoje()
      }) as unknown as ContaPagarRow[]
    return rows.map(toContaPagar)
  },

  buscarPorId(id: number): ContaPagar | null {
    const row = getDb().prepare(`${SELECT_CONTA_PAGAR} WHERE cp.id = :id`).get({ id }) as ContaPagarRow | undefined
    return row ? toContaPagar(row) : null
  },

  /** RF-11.2: lancamento manual de despesa (a gerada por compra vem de compraRepository.confirmarEntrada). */
  criar(input: { descricao: string; categoria: string | null; valorCentavos: number; vencimento: string; recorrente: boolean }): number {
    const info = getDb()
      .prepare(
        `INSERT INTO conta_pagar (descricao, categoria, valor_centavos, vencimento, situacao, recorrente)
         VALUES (:descricao, :categoria, :valor, :vencimento, 'ABERTA', :recorrente)`
      )
      .run({
        descricao: input.descricao.trim(),
        categoria: input.categoria,
        valor: input.valorCentavos,
        vencimento: input.vencimento,
        recorrente: input.recorrente ? 1 : 0
      })
    return Number(info.lastInsertRowid)
  },

  /**
   * RF-11.2/RN-05 (mesmo principio aplicado a contas a pagar): registra o
   * pagamento, atualiza a situacao so quando a soma cobre o valor (suporta
   * pagamento parcial) e lanca a despesa automaticamente. Despesa
   * recorrente quitada gera sozinha a proxima ocorrencia, um mes a frente -
   * a "repeticao automatica" do PRD, sem precisar de agendador separado.
   */
  pagar(id: number, params: { valorCentavos: number; data: string | null; formaPagamento: string; usuarioId: number }): void {
    const db = getDb()
    db.exec('BEGIN IMMEDIATE')
    try {
      const conta = db
        .prepare('SELECT descricao, categoria, valor_centavos, vencimento, recorrente FROM conta_pagar WHERE id = :id')
        .get({ id }) as
        | { descricao: string; categoria: string | null; valor_centavos: number; vencimento: string; recorrente: number }
        | undefined
      if (!conta) throw new Error(`Conta a pagar #${id} não encontrada.`)

      const dataPagamento = params.data?.trim() || hoje()

      db.prepare(
        `INSERT INTO pagamento (conta_pagar_id, valor_centavos, data, forma_pagamento, usuario_id)
         VALUES (:contaId, :valor, :data, :forma, :usuarioId)`
      ).run({ contaId: id, valor: params.valorCentavos, data: dataPagamento, forma: params.formaPagamento, usuarioId: params.usuarioId })

      const somaPaga = db
        .prepare('SELECT COALESCE(SUM(valor_centavos), 0) AS soma FROM pagamento WHERE conta_pagar_id = :id')
        .get({ id }) as { soma: number }
      const quitada = somaPaga.soma >= conta.valor_centavos

      db.prepare('UPDATE conta_pagar SET situacao = :situacao WHERE id = :id').run({
        id,
        situacao: quitada ? 'PAGA' : 'ABERTA'
      })

      db.prepare(
        `INSERT INTO lancamento (tipo, categoria, descricao, valor_centavos, data, origem_tipo, origem_id, usuario_id)
         VALUES ('DESPESA', :categoria, :descricao, :valor, :data, 'conta_pagar', :contaId, :usuarioId)`
      ).run({
        categoria: conta.categoria,
        descricao: `Pagamento - ${params.formaPagamento}`,
        valor: params.valorCentavos,
        data: dataPagamento,
        contaId: id,
        usuarioId: params.usuarioId
      })

      if (quitada && conta.recorrente === 1) {
        db.prepare(
          `INSERT INTO conta_pagar (descricao, categoria, valor_centavos, vencimento, situacao, recorrente)
           VALUES (:descricao, :categoria, :valor, :vencimento, 'ABERTA', 1)`
        ).run({
          descricao: conta.descricao,
          categoria: conta.categoria,
          valor: conta.valor_centavos,
          vencimento: proximoMes(conta.vencimento)
        })
      }

      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }
}
