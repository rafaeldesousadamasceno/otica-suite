import { getDb } from '@main/db/connection'
import type { LancamentoEntry, LucroPrejuizoCategoria, MargemProduto } from '@shared/types'

interface LancamentoRow {
  id: number
  tipo: 'RECEITA' | 'DESPESA'
  categoria: string | null
  descricao: string
  valor_centavos: number
  data: string
}

function toLancamento(row: LancamentoRow): LancamentoEntry {
  return {
    id: row.id,
    tipo: row.tipo,
    categoria: row.categoria,
    descricao: row.descricao,
    valorCentavos: row.valor_centavos,
    data: row.data
  }
}

/**
 * RF-11.3/RF-11.4: consultas de relatorio sobre `lancamento`, `venda` e
 * `conta_pagar` - nunca escreve nada, so leitura. Fica num arquivo a parte
 * (nao dentro de vendaRepository/contaPagarRepository) porque essas
 * consultas nao pertencem ao CRUD de nenhuma entidade especifica; sao
 * derivadas, cruzando tabelas so para os relatorios financeiros.
 */
export const financeiroRepository = {
  /** RF-11.3: fluxo de caixa - lancamentos do periodo, do mais antigo ao mais novo. */
  listarLancamentos(dataInicio: string, dataFim: string): LancamentoEntry[] {
    const rows = getDb()
      .prepare(
        `SELECT id, tipo, categoria, descricao, valor_centavos, data
         FROM lancamento
         WHERE data BETWEEN :dataInicio AND :dataFim
         ORDER BY data, id
         LIMIT 2000`
      )
      .all({ dataInicio, dataFim }) as unknown as LancamentoRow[]
    return rows.map(toLancamento)
  },

  /** RN-12, regime de caixa: soma de lancamento por tipo, no periodo. */
  somaLancamentoPorTipo(dataInicio: string, dataFim: string, tipo: 'RECEITA' | 'DESPESA'): number {
    const row = getDb()
      .prepare(
        `SELECT COALESCE(SUM(valor_centavos), 0) AS soma
         FROM lancamento WHERE tipo = :tipo AND data BETWEEN :dataInicio AND :dataFim`
      )
      .get({ tipo, dataInicio, dataFim }) as { soma: number }
    return row.soma
  },

  despesasLancamentoPorCategoria(dataInicio: string, dataFim: string): LucroPrejuizoCategoria[] {
    const rows = getDb()
      .prepare(
        `SELECT categoria, COALESCE(SUM(valor_centavos), 0) AS total
         FROM lancamento
         WHERE tipo = 'DESPESA' AND data BETWEEN :dataInicio AND :dataFim
         GROUP BY categoria
         ORDER BY total DESC`
      )
      .all({ dataInicio, dataFim }) as unknown as { categoria: string | null; total: number }[]
    return rows.map((r) => ({ categoria: r.categoria, totalCentavos: r.total }))
  },

  /**
   * RN-12, regime de competencia: a receita e reconhecida na DATA DA VENDA
   * (nao no recebimento) - inclui venda parcelada ainda em aberto, porque
   * a venda ja aconteceu.
   */
  receitaVendasPorPeriodo(dataInicio: string, dataFim: string): number {
    const row = getDb()
      .prepare(
        `SELECT COALESCE(SUM(total_centavos), 0) AS soma
         FROM venda WHERE situacao != 'CANCELADA' AND data BETWEEN :dataInicio AND :dataFim`
      )
      .get({ dataInicio, dataFim }) as { soma: number }
    return row.soma
  },

  /**
   * RN-12, regime de competencia: a despesa e reconhecida no VENCIMENTO da
   * conta a pagar (manual ou gerada pela entrada de mercadoria - essa ja
   * chega com categoria 'COMPRA'), nunca na data em que foi de fato paga.
   * Simplificacao assumida: o schema nao guarda uma "data de competencia"
   * separada do vencimento; para uma otica pequena, tratar vencimento como
   * o mes a que a despesa se refere e razoavel (aluguel de janeiro vence
   * em janeiro).
   */
  despesaContasPagarPorPeriodo(dataInicio: string, dataFim: string): number {
    const row = getDb()
      .prepare(
        `SELECT COALESCE(SUM(valor_centavos), 0) AS soma
         FROM conta_pagar WHERE situacao != 'CANCELADA' AND vencimento BETWEEN :dataInicio AND :dataFim`
      )
      .get({ dataInicio, dataFim }) as { soma: number }
    return row.soma
  },

  despesasContasPagarPorCategoria(dataInicio: string, dataFim: string): LucroPrejuizoCategoria[] {
    const rows = getDb()
      .prepare(
        `SELECT categoria, COALESCE(SUM(valor_centavos), 0) AS total
         FROM conta_pagar
         WHERE situacao != 'CANCELADA' AND vencimento BETWEEN :dataInicio AND :dataFim
         GROUP BY categoria
         ORDER BY total DESC`
      )
      .all({ dataInicio, dataFim }) as unknown as { categoria: string | null; total: number }[]
    return rows.map((r) => ({ categoria: r.categoria, totalCentavos: r.total }))
  },

  /**
   * Margem bruta por produto (receita - custo) no periodo, pelas vendas
   * concluidas. Usa o CUSTO ATUAL do produto (produto.custo_centavos), nao
   * um custo historico por item vendido - o schema nao guarda snapshot de
   * custo por venda_item, entao um produto cujo custo mudou depois da
   * venda tem a margem recalculada com o custo de hoje, nao o de entao.
   */
  margemPorProduto(dataInicio: string, dataFim: string): MargemProduto[] {
    const rows = getDb()
      .prepare(
        `SELECT p.id AS produto_id, p.descricao, p.categoria,
                SUM(vi.quantidade) AS quantidade,
                SUM(vi.total_centavos) AS receita,
                SUM(vi.quantidade * p.custo_centavos) AS custo
         FROM venda_item vi
         INNER JOIN venda v ON v.id = vi.venda_id
         INNER JOIN produto p ON p.id = vi.produto_id
         WHERE v.situacao != 'CANCELADA' AND v.data BETWEEN :dataInicio AND :dataFim
         GROUP BY p.id, p.descricao, p.categoria
         ORDER BY receita DESC`
      )
      .all({ dataInicio, dataFim }) as unknown as {
      produto_id: number
      descricao: string
      categoria: MargemProduto['categoria']
      quantidade: number
      receita: number
      custo: number
    }[]

    return rows.map((r) => ({
      produtoId: r.produto_id,
      descricao: r.descricao,
      categoria: r.categoria,
      quantidadeVendida: r.quantidade,
      receitaCentavos: r.receita,
      custoCentavos: r.custo,
      margemCentavos: r.receita - r.custo
    }))
  }
}
