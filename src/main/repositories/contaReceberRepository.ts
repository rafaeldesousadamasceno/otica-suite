import type { DatabaseSync } from 'node:sqlite'
import { getDb } from '@main/db/connection'
import { comissaoRepository } from './comissaoRepository'
import type { ContaReceber, SituacaoContaReceber } from '@shared/types'

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

const SELECT_CONTA_RECEBER = `
  SELECT cr.id, cr.venda_id, v.numero AS venda_numero,
         cr.cliente_id, c.nome AS cliente_nome,
         v.vendedor_id, u.nome AS vendedor_nome,
         cr.parcela, cr.total_parcelas, cr.valor_centavos, cr.vencimento, cr.situacao,
         COALESCE((SELECT SUM(r.valor_centavos) FROM recebimento r WHERE r.conta_receber_id = cr.id), 0) AS valor_recebido_centavos
  FROM conta_receber cr
  INNER JOIN venda v ON v.id = cr.venda_id
  INNER JOIN cliente c ON c.id = cr.cliente_id
  INNER JOIN usuario u ON u.id = v.vendedor_id
`

interface ContaReceberRow {
  id: number
  venda_id: number
  venda_numero: string
  cliente_id: number
  cliente_nome: string
  vendedor_id: number
  vendedor_nome: string
  parcela: number
  total_parcelas: number
  valor_centavos: number
  vencimento: string
  situacao: SituacaoContaReceber
  valor_recebido_centavos: number
}

function toContaReceber(row: ContaReceberRow): ContaReceber {
  return {
    id: row.id,
    vendaId: row.venda_id,
    vendaNumero: row.venda_numero,
    clienteId: row.cliente_id,
    clienteNome: row.cliente_nome,
    vendedorId: row.vendedor_id,
    vendedorNome: row.vendedor_nome,
    parcela: row.parcela,
    totalParcelas: row.total_parcelas,
    valorCentavos: row.valor_centavos,
    valorRecebidoCentavos: row.valor_recebido_centavos,
    vencimento: row.vencimento,
    situacao: row.situacao,
    vencida: row.situacao === 'ABERTA' && row.vencimento < hoje()
  }
}

export const contaReceberRepository = {
  listar(query: { busca?: string; situacao?: string; apenasVencidas?: boolean }): ContaReceber[] {
    const rows = getDb()
      .prepare(
        `${SELECT_CONTA_RECEBER}
         WHERE (c.nome LIKE :termo OR v.numero LIKE :termo)
           AND (:situacao = '' OR cr.situacao = :situacao)
           AND (:apenasVencidas = 0 OR (cr.situacao = 'ABERTA' AND cr.vencimento < :hoje))
         ORDER BY cr.vencimento ASC, cr.id ASC
         LIMIT 500`
      )
      .all({
        termo: `%${query.busca?.trim() ?? ''}%`,
        situacao: query.situacao?.trim() || '',
        apenasVencidas: query.apenasVencidas ? 1 : 0,
        hoje: hoje()
      }) as unknown as ContaReceberRow[]
    return rows.map(toContaReceber)
  },

  listarPorVenda(vendaId: number): ContaReceber[] {
    const rows = getDb()
      .prepare(`${SELECT_CONTA_RECEBER} WHERE cr.venda_id = :vendaId ORDER BY cr.parcela`)
      .all({ vendaId }) as unknown as ContaReceberRow[]
    return rows.map(toContaReceber)
  },

  buscarPorId(id: number): ContaReceber | null {
    const row = getDb()
      .prepare(`${SELECT_CONTA_RECEBER} WHERE cr.id = :id`)
      .get({ id }) as ContaReceberRow | undefined
    return row ? toContaReceber(row) : null
  },

  /**
   * RF-11.1: registra o recebimento, atualiza a situacao da parcela (PAGA
   * so quando a soma de todos os recebimentos cobre o valor) e gera o
   * lancamento de receita automaticamente - nunca fica uma baixa sem
   * financeiro (mesmo defeito do D9 do sistema anterior, agora para
   * parcelas). Se essa baixa quitar a ultima parcela em aberto da venda,
   * libera a comissao (RN-08). Tudo numa unica transacao.
   */
  baixar(id: number, params: { valorCentavos: number; data: string | null; formaPagamento: string; usuarioId: number }): void {
    const db = getDb()
    db.exec('BEGIN IMMEDIATE')
    try {
      const conta = db
        .prepare('SELECT venda_id, valor_centavos FROM conta_receber WHERE id = :id')
        .get({ id }) as { venda_id: number; valor_centavos: number } | undefined
      if (!conta) throw new Error(`Parcela #${id} não encontrada.`)

      const dataRecebimento = params.data?.trim() || hoje()

      db.prepare(
        `INSERT INTO recebimento (conta_receber_id, valor_centavos, data, forma_pagamento, usuario_id)
         VALUES (:contaId, :valor, :data, :forma, :usuarioId)`
      ).run({
        contaId: id,
        valor: params.valorCentavos,
        data: dataRecebimento,
        forma: params.formaPagamento,
        usuarioId: params.usuarioId
      })

      const somaRecebida = db
        .prepare('SELECT COALESCE(SUM(valor_centavos), 0) AS soma FROM recebimento WHERE conta_receber_id = :id')
        .get({ id }) as { soma: number }
      const quitada = somaRecebida.soma >= conta.valor_centavos

      db.prepare('UPDATE conta_receber SET situacao = :situacao WHERE id = :id').run({
        id,
        situacao: quitada ? 'PAGA' : 'ABERTA'
      })

      db.prepare(
        `INSERT INTO lancamento (tipo, categoria, descricao, valor_centavos, data, origem_tipo, origem_id, usuario_id)
         VALUES ('RECEITA', 'VENDA', :descricao, :valor, :data, 'conta_receber', :contaId, :usuarioId)`
      ).run({
        descricao: `Recebimento de parcela - ${params.formaPagamento}`,
        valor: params.valorCentavos,
        data: dataRecebimento,
        contaId: id,
        usuarioId: params.usuarioId
      })

      if (quitada) {
        comissaoRepository.liberarSeQuitada(db, conta.venda_id)
      }

      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  },

  /**
   * RN-11: chamada de dentro da transacao de cancelamento da venda
   * (vendaRepository.cancelar). Cancela toda parcela ainda nao cancelada
   * (aberta ou ja paga) e devolve a soma do que ja tinha sido recebido -
   * quem chama e quem decide o que fazer com esse valor no financeiro
   * (gerar o lancamento de estorno).
   */
  estornarPorVenda(db: DatabaseSync, vendaId: number): number {
    const contas = db
      .prepare("SELECT id FROM conta_receber WHERE venda_id = :vendaId AND situacao IN ('ABERTA', 'PAGA')")
      .all({ vendaId }) as { id: number }[]
    if (contas.length === 0) return 0

    const params: Record<string, number> = { vendaId }
    const placeholders = contas.map((c, i) => {
      params[`id${i}`] = c.id
      return `:id${i}`
    })

    const somaRecebida = db
      .prepare(`SELECT COALESCE(SUM(valor_centavos), 0) AS soma FROM recebimento WHERE conta_receber_id IN (${placeholders.join(',')})`)
      .get(params) as { soma: number }

    db.prepare("UPDATE conta_receber SET situacao = 'CANCELADA' WHERE venda_id = :vendaId AND situacao IN ('ABERTA', 'PAGA')").run({
      vendaId
    })

    return somaRecebida.soma
  }
}
