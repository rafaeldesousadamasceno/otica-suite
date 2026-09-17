import { getDb } from '@main/db/connection'
import type { RankingVendedorItem, SituacaoComissao } from '@shared/types'

export interface VendasPorVendedorItem {
  vendedorId: number
  vendedorNome: string
  quantidadeVendas: number
  totalCentavos: number
}

export interface ComissaoRelatorioItem {
  vendaId: number
  vendaNumero: string
  vendedorId: number
  vendedorNome: string
  data: string
  baseCentavos: number
  percentual: number
  valorCentavos: number
  situacao: SituacaoComissao
}

/**
 * RF-12: consultas de agregacao que nao pertencem ao CRUD de nenhuma
 * entidade - existem so para os relatorios gerenciais. `rankingVendedores`
 * e `vendasPorVendedor` fazem a mesma query de `dashboardRepository`, mas
 * parametrizada por periodo livre (o dashboard fixa "mes corrente" e
 * `LIMIT 10"; aqui o RF-12 CA1 exige periodo arbitrario e a lista inteira).
 */
export const relatorioRepository = {
  rankingVendedores(dataInicio: string, dataFim: string): RankingVendedorItem[] {
    const rows = getDb()
      .prepare(
        `SELECT v.vendedor_id AS vendedorId, u.nome AS vendedorNome, SUM(v.total_centavos) AS total
         FROM venda v
         INNER JOIN usuario u ON u.id = v.vendedor_id
         WHERE v.situacao != 'CANCELADA' AND v.data BETWEEN :dataInicio AND :dataFim
         GROUP BY v.vendedor_id, u.nome
         ORDER BY total DESC`
      )
      .all({ dataInicio, dataFim }) as unknown as { vendedorId: number; vendedorNome: string; total: number }[]
    return rows.map((r) => ({ vendedorId: r.vendedorId, vendedorNome: r.vendedorNome, totalCentavos: r.total }))
  },

  vendasPorVendedor(dataInicio: string, dataFim: string): VendasPorVendedorItem[] {
    const rows = getDb()
      .prepare(
        `SELECT v.vendedor_id AS vendedorId, u.nome AS vendedorNome,
                COUNT(*) AS quantidade, SUM(v.total_centavos) AS total
         FROM venda v
         INNER JOIN usuario u ON u.id = v.vendedor_id
         WHERE v.situacao != 'CANCELADA' AND v.data BETWEEN :dataInicio AND :dataFim
         GROUP BY v.vendedor_id, u.nome
         ORDER BY total DESC`
      )
      .all({ dataInicio, dataFim }) as unknown as {
      vendedorId: number
      vendedorNome: string
      quantidade: number
      total: number
    }[]
    return rows.map((r) => ({
      vendedorId: r.vendedorId,
      vendedorNome: r.vendedorNome,
      quantidadeVendas: r.quantidade,
      totalCentavos: r.total
    }))
  },

  /** RF-11: comissoes do periodo (pela DATA DA VENDA) - `vendedorId` filtra "so a minha", como em vendaService.listar. */
  comissoes(dataInicio: string, dataFim: string, vendedorId: number | null): ComissaoRelatorioItem[] {
    const rows = getDb()
      .prepare(
        `SELECT v.id AS vendaId, v.numero AS vendaNumero, c.vendedor_id AS vendedorId, u.nome AS vendedorNome,
                v.data AS data, c.base_centavos AS baseCentavos, c.percentual AS percentual,
                c.valor_centavos AS valorCentavos, c.situacao AS situacao
         FROM comissao c
         INNER JOIN venda v ON v.id = c.venda_id
         INNER JOIN usuario u ON u.id = c.vendedor_id
         WHERE v.data BETWEEN :dataInicio AND :dataFim
           AND (:vendedorId = 0 OR c.vendedor_id = :vendedorId)
         ORDER BY v.data, v.id`
      )
      .all({ dataInicio, dataFim, vendedorId: vendedorId ?? 0 }) as unknown as ComissaoRelatorioItem[]
    return rows
  }
}
