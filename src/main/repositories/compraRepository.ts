import { getDb } from '@main/db/connection'
import { registrarMovimento, saldoAtual } from './estoqueRepository'
import type { CompraCreateInput } from '@shared/ipc'
import type { CompraDetalhada, CompraItemDetalhe, CompraResumo, SituacaoCompra } from '@shared/types'

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

const SELECT_RESUMO = `
  SELECT c.id, c.fornecedor_id, f.razao_social AS fornecedor_nome,
         c.data, c.numero_nf, c.valor_total_centavos, c.situacao
  FROM compra c
  LEFT JOIN fornecedor f ON f.id = c.fornecedor_id
`

interface ResumoRow {
  id: number
  fornecedor_id: number | null
  fornecedor_nome: string | null
  data: string
  numero_nf: string | null
  valor_total_centavos: number
  situacao: SituacaoCompra
}

function toResumo(row: ResumoRow): CompraResumo {
  return {
    id: row.id,
    fornecedorId: row.fornecedor_id,
    fornecedorNome: row.fornecedor_nome,
    data: row.data,
    numeroNf: row.numero_nf,
    valorTotalCentavos: row.valor_total_centavos,
    situacao: row.situacao
  }
}

export const compraRepository = {
  /** RF-09: cria a ordem de compra (situacao ABERTA) - ainda nao mexe em estoque nem financeiro, so a entrada faz isso. */
  criar(input: CompraCreateInput, usuarioId: number): number {
    const db = getDb()
    db.exec('BEGIN IMMEDIATE')
    try {
      const valorTotal = input.itens.reduce((soma, item) => soma + item.quantidade * item.custoUnitarioCentavos, 0)

      const info = db
        .prepare(
          `INSERT INTO compra (fornecedor_id, data, numero_nf, valor_total_centavos, situacao, usuario_id)
           VALUES (:fornecedorId, :data, :numeroNf, :valorTotal, 'ABERTA', :usuarioId)`
        )
        .run({
          fornecedorId: input.fornecedorId ?? null,
          data: hoje(),
          numeroNf: input.numeroNf?.trim() || null,
          valorTotal,
          usuarioId
        })
      const compraId = Number(info.lastInsertRowid)

      for (const item of input.itens) {
        db.prepare(
          `INSERT INTO compra_item (compra_id, produto_id, quantidade, custo_unitario_centavos)
           VALUES (:compraId, :produtoId, :quantidade, :custoUnitario)`
        ).run({
          compraId,
          produtoId: item.produtoId,
          quantidade: item.quantidade,
          custoUnitario: item.custoUnitarioCentavos
        })
      }

      db.exec('COMMIT')
      return compraId
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  },

  listar(query: { busca?: string; situacao?: string }): CompraResumo[] {
    const rows = getDb()
      .prepare(
        `${SELECT_RESUMO}
         WHERE (f.razao_social LIKE :termo OR c.numero_nf LIKE :termo)
           AND (:situacao = '' OR c.situacao = :situacao)
         ORDER BY c.data DESC, c.id DESC
         LIMIT 300`
      )
      .all({
        termo: `%${query.busca?.trim() ?? ''}%`,
        situacao: query.situacao?.trim() || ''
      }) as unknown as ResumoRow[]
    return rows.map(toResumo)
  },

  buscarPorId(id: number): CompraDetalhada | null {
    const db = getDb()
    const header = db.prepare(`${SELECT_RESUMO} WHERE c.id = :id`).get({ id }) as ResumoRow | undefined
    if (!header) return null

    const itensRows = db
      .prepare(
        `SELECT ci.id, ci.produto_id, p.descricao AS produto_descricao, ci.quantidade, ci.custo_unitario_centavos
         FROM compra_item ci
         INNER JOIN produto p ON p.id = ci.produto_id
         WHERE ci.compra_id = :id ORDER BY ci.id`
      )
      .all({ id }) as unknown as {
      id: number
      produto_id: number
      produto_descricao: string
      quantidade: number
      custo_unitario_centavos: number
    }[]

    const itens: CompraItemDetalhe[] = itensRows.map((r) => ({
      id: r.id,
      produtoId: r.produto_id,
      produtoDescricao: r.produto_descricao,
      quantidade: r.quantidade,
      custoUnitarioCentavos: r.custo_unitario_centavos
    }))

    return { ...toResumo(header), itens }
  },

  cancelar(id: number): void {
    getDb().prepare("UPDATE compra SET situacao = 'CANCELADA' WHERE id = :id AND situacao = 'ABERTA'").run({ id })
  },

  /**
   * RF-09: entrada de mercadoria - confere a ordem, da entrada no estoque
   * (RF-08) e gera a conta a pagar, na mesma transacao (CA1/CA2). O custo
   * do produto e recalculado por media ponderada pelo saldo que ja existia
   * (CA3): sem saldo anterior (produto zerado ou negativo), o novo custo
   * de compra simplesmente vira o custo do produto.
   */
  confirmarEntrada(id: number, vencimentoContaPagar: string, usuarioId: number): void {
    const db = getDb()
    db.exec('BEGIN IMMEDIATE')
    try {
      const compra = db
        .prepare('SELECT fornecedor_id, numero_nf, valor_total_centavos, situacao FROM compra WHERE id = :id')
        .get({ id }) as
        | { fornecedor_id: number | null; numero_nf: string | null; valor_total_centavos: number; situacao: SituacaoCompra }
        | undefined
      if (!compra) throw new Error(`Compra #${id} não encontrada.`)
      if (compra.situacao !== 'ABERTA') throw new Error('Esta compra já foi recebida ou está cancelada.')

      const itens = db
        .prepare('SELECT produto_id, quantidade, custo_unitario_centavos FROM compra_item WHERE compra_id = :id')
        .all({ id }) as { produto_id: number; quantidade: number; custo_unitario_centavos: number }[]

      for (const item of itens) {
        const saldoAntes = saldoAtual(db, item.produto_id)
        const produto = db.prepare('SELECT custo_centavos FROM produto WHERE id = :id').get({ id: item.produto_id }) as
          | { custo_centavos: number }
          | undefined
        const custoAtual = produto?.custo_centavos ?? 0

        registrarMovimento(db, {
          produtoId: item.produto_id,
          tipo: 'entrada_compra',
          quantidade: item.quantidade,
          documentoTipo: 'compra',
          documentoId: id,
          usuarioId
        })

        const novoCusto =
          saldoAntes > 0
            ? Math.round((saldoAntes * custoAtual + item.quantidade * item.custo_unitario_centavos) / (saldoAntes + item.quantidade))
            : item.custo_unitario_centavos

        db.prepare('UPDATE produto SET custo_centavos = :custo WHERE id = :id').run({ id: item.produto_id, custo: novoCusto })
      }

      db.prepare("UPDATE compra SET situacao = 'RECEBIDA' WHERE id = :id").run({ id })

      const numeroNf = compra.numero_nf ? ` (NF ${compra.numero_nf})` : ''
      db.prepare(
        `INSERT INTO conta_pagar (compra_id, fornecedor_id, descricao, categoria, valor_centavos, vencimento, situacao)
         VALUES (:compraId, :fornecedorId, :descricao, 'COMPRA', :valor, :vencimento, 'ABERTA')`
      ).run({
        compraId: id,
        fornecedorId: compra.fornecedor_id,
        descricao: `Compra #${id}${numeroNf}`,
        valor: compra.valor_total_centavos,
        vencimento: vencimentoContaPagar
      })

      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }
}
