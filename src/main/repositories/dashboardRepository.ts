import { getDb } from '@main/db/connection'
import { contarAbaixoMinimo } from './estoqueRepository'
import { ordemServicoRepository } from './ordemServicoRepository'
import { FLUXO_SITUACAO_OS } from '@shared/types'
import type {
  CategoriaVenda,
  DashboardOs,
  DashboardPosicao,
  EtapaOS,
  FormaPagamentoItem,
  OsEtapaItem,
  ProdutoVendidoItem,
  VendaCategoriaDetalhe,
  VendedorDesempenho
} from '@shared/types'
import { DESCRICAO_PRODUTO_IMPORTADO } from '@shared/importacao'
import { hojeLocal } from '@shared/data'
import { somarDias, type Periodo } from '@shared/periodos'

/**
 * Consultas do painel gerencial. Toda agregacao e feita aqui, em SQL; o
 * renderer nunca recebe linha por linha. Todas as funcoes de periodo recebem
 * `vendedorId` (`null` = a loja toda).
 *
 * Regras de numero (as mesmas dos relatorios financeiros):
 *  - venda cancelada nunca entra;
 *  - o desconto geral da venda so existe no total da venda, entao ele e
 *    rateado entre os itens para categorias e produtos somarem o faturamento;
 *  - suprimento e sangria de caixa nao sao receita nem despesa, e o estorno
 *    de venda cancelada abate o recebido.
 */

const ETAPAS_EM_ANDAMENTO = FLUXO_SITUACAO_OS.slice(0, 3) as unknown as EtapaOS[]

type Db = ReturnType<typeof getDb>
type Parametros = Record<string, string | number>

function filtroPeriodo(p: Periodo, vendedorId: number | null): Parametros {
  return { inicio: p.inicio, fim: p.fim, vendedorId: vendedorId ?? 0 }
}

/** Vendas validas do periodo (e do vendedor, quando houver). Alias `v`. */
const SQL_VENDA_VALIDA = `v.situacao != 'CANCELADA' AND v.data BETWEEN :inicio AND :fim AND (:vendedorId = 0 OR v.vendedor_id = :vendedorId)`

/**
 * Cada item vendido com a receita liquida (rateio do desconto geral) e o
 * custo unitario conhecido. Custo: o gravado na venda; sem ele, o custo atual
 * do produto. Item importado, produto removido ou sem custo cadastrado ficam
 * com custo NULO (nao entram na margem).
 */
const SQL_ITENS = `
  SELECT vi.venda_id, vi.produto_id, vi.quantidade, p.descricao AS produto_descricao,
         COALESCE(p.categoria, 'outros') AS categoria,
         (p.id IS NOT NULL AND p.descricao = :importado) AS importado,
         CASE WHEN s.soma > 0 THEN vi.total_centavos * 1.0 * v.total_centavos / s.soma ELSE 0 END AS liquido,
         COALESCE(
           vi.custo_unitario_centavos,
           CASE WHEN p.id IS NULL OR p.descricao = :importado THEN NULL
                WHEN p.custo_centavos > 0 OR p.categoria = 'servico' THEN p.custo_centavos END
         ) AS custo_unitario
  FROM venda_item vi
  INNER JOIN venda v ON v.id = vi.venda_id
  INNER JOIN (SELECT venda_id, SUM(total_centavos) AS soma FROM venda_item GROUP BY venda_id) s ON s.venda_id = vi.venda_id
  LEFT JOIN produto p ON p.id = vi.produto_id
  WHERE ${SQL_VENDA_VALIDA}`

function paramsItens(p: Periodo, vendedorId: number | null): Parametros {
  return { ...filtroPeriodo(p, vendedorId), importado: DESCRICAO_PRODUTO_IMPORTADO }
}

export interface ResumoVendas {
  quantidade: number
  totalCentavos: number
}

export interface LucroBruto {
  /** Receita liquida dos itens com custo conhecido. */
  receitaComCustoCentavos: number
  lucroCentavos: number
  /** Receita liquida de TODOS os itens (base da cobertura). */
  receitaItensCentavos: number
}

export interface ResumoClientes {
  novos: number
  recorrentes: number
}

export interface MovimentoCaixa {
  recebidoCentavos: number
  despesasCentavos: number
}

export interface CaixaDiario {
  data: string
  recebidoCentavos: number
  despesasCentavos: number
}

/** Recebido do periodo: entradas (sem suprimento) menos estornos de venda cancelada. */
const SQL_RECEBIDO = `CASE WHEN tipo = 'RECEITA' AND COALESCE(categoria, '') != 'SUPRIMENTO' THEN valor_centavos
                          WHEN tipo = 'DESPESA' AND categoria = 'ESTORNO_VENDA' THEN -valor_centavos
                          ELSE 0 END`
const SQL_DESPESA = `CASE WHEN tipo = 'DESPESA' AND COALESCE(categoria, '') NOT IN ('SANGRIA', 'ESTORNO_VENDA') THEN valor_centavos ELSE 0 END`

function osPorEtapa(db: Db, vendedorId: number | null): OsEtapaItem[] {
  const rows = db
    .prepare(
      `SELECT situacao, COUNT(*) AS qtd FROM ordem_servico
       WHERE situacao IN (:e0, :e1, :e2) AND (:vendedorId = 0 OR criado_por = :vendedorId)
       GROUP BY situacao`
    )
    .all({ e0: ETAPAS_EM_ANDAMENTO[0], e1: ETAPAS_EM_ANDAMENTO[1], e2: ETAPAS_EM_ANDAMENTO[2], vendedorId: vendedorId ?? 0 }) as unknown as {
    situacao: EtapaOS
    qtd: number
  }[]
  return ETAPAS_EM_ANDAMENTO.map((situacao) => ({ situacao, quantidade: rows.find((r) => r.situacao === situacao)?.qtd ?? 0 }))
}

/** Proximos 7 dias (hoje incluso) no formato 'MM-DD', para comparar com strftime('%m-%d', data_nasc). */
function proximosSeteDiasMD(hoje: string): string[] {
  return Array.from({ length: 7 }, (_, i) => somarDias(hoje, i).slice(5))
}

function contarAniversariantesSemana(db: Db, hoje: string): number {
  const dias = proximosSeteDiasMD(hoje)
  const params: Record<string, string> = {}
  const marcadores = dias.map((md, i) => {
    params[`d${i}`] = md
    return `:d${i}`
  })
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM cliente
       WHERE ativo = 1 AND data_nasc IS NOT NULL AND strftime('%m-%d', data_nasc) IN (${marcadores.join(',')})`
    )
    .get(params) as { n: number }
  return row.n
}

export const dashboardRepository = {
  resumoVendas(p: Periodo, vendedorId: number | null): ResumoVendas {
    const row = getDb()
      .prepare(`SELECT COUNT(*) AS qtd, COALESCE(SUM(v.total_centavos), 0) AS total FROM venda v WHERE ${SQL_VENDA_VALIDA}`)
      .get(filtroPeriodo(p, vendedorId)) as { qtd: number; total: number }
    return { quantidade: row.qtd, totalCentavos: row.total }
  },

  faturamentoDiario(p: Periodo, vendedorId: number | null): { data: string; valor: number }[] {
    const rows = getDb()
      .prepare(`SELECT v.data AS data, SUM(v.total_centavos) AS valor FROM venda v WHERE ${SQL_VENDA_VALIDA} GROUP BY v.data`)
      .all(filtroPeriodo(p, vendedorId)) as unknown as { data: string; valor: number }[]
    return rows
  },

  /**
   * Receita liquida por categoria. Vendas sem nenhum item entram em "outros" e
   * a diferenca de arredondamento vai para a maior fatia: a soma das fatias e
   * sempre igual ao faturamento.
   */
  categorias(p: Periodo, vendedorId: number | null, faturamentoCentavos: number): VendaCategoriaDetalhe[] {
    const db = getDb()
    const rows = db
      .prepare(
        `SELECT categoria, SUM(quantidade) AS qtd, SUM(liquido) AS total FROM (${SQL_ITENS}) GROUP BY categoria`
      )
      .all(paramsItens(p, vendedorId)) as unknown as { categoria: CategoriaVenda; qtd: number; total: number }[]

    const semItens = db
      .prepare(
        `SELECT COALESCE(SUM(v.total_centavos), 0) AS total FROM venda v
         WHERE ${SQL_VENDA_VALIDA} AND NOT EXISTS (SELECT 1 FROM venda_item vi WHERE vi.venda_id = v.id)`
      )
      .get(filtroPeriodo(p, vendedorId)) as { total: number }

    const fatias: VendaCategoriaDetalhe[] = rows.map((r) => ({
      categoria: r.categoria,
      quantidade: r.qtd,
      totalCentavos: Math.round(r.total)
    }))
    if (semItens.total > 0) {
      const outros = fatias.find((f) => f.categoria === 'outros')
      if (outros) outros.totalCentavos += semItens.total
      else fatias.push({ categoria: 'outros', quantidade: 0, totalCentavos: semItens.total })
    }

    fatias.sort((a, b) => b.totalCentavos - a.totalCentavos)
    const diferenca = faturamentoCentavos - fatias.reduce((s, f) => s + f.totalCentavos, 0)
    if (fatias.length > 0 && diferenca !== 0) fatias[0].totalCentavos += diferenca
    return fatias.filter((f) => f.totalCentavos > 0)
  },

  topProdutos(p: Periodo, vendedorId: number | null, limite = 10): ProdutoVendidoItem[] {
    const rows = getDb()
      .prepare(
        `SELECT produto_id AS produtoId, produto_descricao AS descricao,
                SUM(quantidade) AS qtd, SUM(liquido) AS total,
                SUM(CASE WHEN custo_unitario IS NOT NULL THEN liquido - quantidade * custo_unitario END) AS margem
         FROM (${SQL_ITENS})
         WHERE produto_id IS NOT NULL AND importado = 0
         GROUP BY produto_id, produto_descricao
         ORDER BY total DESC
         LIMIT :limite`
      )
      .all({ ...paramsItens(p, vendedorId), limite }) as unknown as {
      produtoId: number
      descricao: string
      qtd: number
      total: number
      margem: number | null
    }[]
    return rows.map((r) => ({
      produtoId: r.produtoId,
      descricao: r.descricao,
      quantidade: r.qtd,
      totalCentavos: Math.round(r.total),
      margemCentavos: r.margem === null ? null : Math.round(r.margem)
    }))
  },

  lucroBruto(p: Periodo, vendedorId: number | null): LucroBruto {
    const row = getDb()
      .prepare(
        `SELECT COALESCE(SUM(liquido), 0) AS receitaItens,
                COALESCE(SUM(CASE WHEN custo_unitario IS NOT NULL THEN liquido END), 0) AS receitaComCusto,
                COALESCE(SUM(CASE WHEN custo_unitario IS NOT NULL THEN liquido - quantidade * custo_unitario END), 0) AS lucro
         FROM (${SQL_ITENS})`
      )
      .get(paramsItens(p, vendedorId)) as { receitaItens: number; receitaComCusto: number; lucro: number }
    return {
      receitaItensCentavos: Math.round(row.receitaItens),
      receitaComCustoCentavos: Math.round(row.receitaComCusto),
      lucroCentavos: Math.round(row.lucro)
    }
  },

  formasPagamento(p: Periodo, vendedorId: number | null): FormaPagamentoItem[] {
    const rows = getDb()
      .prepare(
        `SELECT vp.forma_pagamento AS forma, SUM(vp.valor_centavos) AS total
         FROM venda_pagamento vp
         INNER JOIN venda v ON v.id = vp.venda_id
         WHERE ${SQL_VENDA_VALIDA}
         GROUP BY vp.forma_pagamento
         ORDER BY total DESC`
      )
      .all(filtroPeriodo(p, vendedorId)) as unknown as { forma: string; total: number }[]
    return rows.map((r) => ({ forma: r.forma, totalCentavos: r.total }))
  },

  /**
   * Clientes que compraram no periodo: "recorrente" ja tinha uma compra valida
   * antes do inicio do periodo (em qualquer vendedor); o resto e "novo".
   */
  clientes(p: Periodo, vendedorId: number | null): ResumoClientes {
    const row = getDb()
      .prepare(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN EXISTS (
                  SELECT 1 FROM venda h
                  WHERE h.cliente_id = c.cliente_id AND h.situacao != 'CANCELADA' AND h.data < :inicio
                ) THEN 1 ELSE 0 END), 0) AS recorrentes
         FROM (SELECT DISTINCT v.cliente_id FROM venda v WHERE ${SQL_VENDA_VALIDA}) c`
      )
      .get(filtroPeriodo(p, vendedorId)) as { total: number; recorrentes: number }
    return { novos: row.total - row.recorrentes, recorrentes: row.recorrentes }
  },

  comissao(p: Periodo, vendedorId: number): number {
    const row = getDb()
      .prepare(
        `SELECT COALESCE(SUM(c.valor_centavos), 0) AS soma
         FROM comissao c INNER JOIN venda v ON v.id = c.venda_id
         WHERE c.situacao != 'CANCELADA' AND c.vendedor_id = :vendedorId AND ${SQL_VENDA_VALIDA}`
      )
      .get(filtroPeriodo(p, vendedorId)) as { soma: number }
    return row.soma
  },

  /** Vendedores ativos, inclusive os sem nenhuma venda no periodo (aparecem com zero). */
  ranking(p: Periodo): VendedorDesempenho[] {
    const rows = getDb()
      .prepare(
        `SELECT u.id AS id, u.nome AS nome, COUNT(v.id) AS qtd, COALESCE(SUM(v.total_centavos), 0) AS total
         FROM usuario u
         LEFT JOIN venda v ON v.vendedor_id = u.id AND v.situacao != 'CANCELADA' AND v.data BETWEEN :inicio AND :fim
         WHERE u.ativo = 1
         GROUP BY u.id, u.nome, u.perfil
         HAVING u.perfil = 'vendedor' OR COUNT(v.id) > 0
         ORDER BY total DESC, u.nome`
      )
      .all({ inicio: p.inicio, fim: p.fim }) as unknown as { id: number; nome: string; qtd: number; total: number }[]
    return rows.map((r) => ({ vendedorId: r.id, vendedorNome: r.nome, quantidadeVendas: r.qtd, totalCentavos: r.total }))
  },

  caixa(p: Periodo): MovimentoCaixa {
    const row = getDb()
      .prepare(
        `SELECT COALESCE(SUM(${SQL_RECEBIDO}), 0) AS recebido, COALESCE(SUM(${SQL_DESPESA}), 0) AS despesas
         FROM lancamento WHERE data BETWEEN :inicio AND :fim`
      )
      .get({ inicio: p.inicio, fim: p.fim }) as { recebido: number; despesas: number }
    return { recebidoCentavos: row.recebido, despesasCentavos: row.despesas }
  },

  caixaDiario(p: Periodo): CaixaDiario[] {
    const rows = getDb()
      .prepare(
        `SELECT data, SUM(${SQL_RECEBIDO}) AS recebido, SUM(${SQL_DESPESA}) AS despesas
         FROM lancamento WHERE data BETWEEN :inicio AND :fim GROUP BY data`
      )
      .all({ inicio: p.inicio, fim: p.fim }) as unknown as { data: string; recebido: number; despesas: number }[]
    return rows.map((r) => ({ data: r.data, recebidoCentavos: r.recebido, despesasCentavos: r.despesas }))
  },

  os(p: Periodo, vendedorId: number | null): DashboardOs {
    const db = getDb()
    const params = { inicio: p.inicio, fim: p.fim, vendedorId: vendedorId ?? 0 }
    const abertas = db
      .prepare(
        `SELECT COUNT(*) AS n FROM ordem_servico
         WHERE substr(data_abertura, 1, 10) BETWEEN :inicio AND :fim AND (:vendedorId = 0 OR criado_por = :vendedorId)`
      )
      .get(params) as { n: number }
    const entregues = db
      .prepare(
        `SELECT COUNT(*) AS n, AVG(julianday(data_entrega) - julianday(data_abertura)) AS dias
         FROM ordem_servico
         WHERE situacao = 'ENTREGUE' AND substr(data_entrega, 1, 10) BETWEEN :inicio AND :fim AND (:vendedorId = 0 OR criado_por = :vendedorId)`
      )
      .get(params) as { n: number; dias: number | null }
    return {
      porEtapa: osPorEtapa(db, vendedorId),
      abertasNoPeriodo: abertas.n,
      entreguesNoPeriodo: entregues.n,
      diasMediosAteEntrega: entregues.dias === null ? null : Math.round(entregues.dias * 10) / 10
    }
  },

  /** Foto de agora (independe do periodo do filtro). `vendedorId` limita receber e OS ao vendedor. */
  posicao(vendedorId: number | null, incluirPagar: boolean): DashboardPosicao {
    const db = getDb()
    const hoje = hojeLocal()
    const vid = vendedorId ?? 0

    const receber = db
      .prepare(
        `SELECT COUNT(*) AS qtd, COALESCE(SUM(saldo), 0) AS soma,
                COALESCE(SUM(CASE WHEN vencimento < :hoje THEN 1 ELSE 0 END), 0) AS vencidasQtd,
                COALESCE(SUM(CASE WHEN vencimento < :hoje THEN saldo ELSE 0 END), 0) AS vencidasSoma
         FROM (
           SELECT cr.vencimento,
                  cr.valor_centavos - COALESCE((SELECT SUM(r.valor_centavos) FROM recebimento r WHERE r.conta_receber_id = cr.id), 0) AS saldo
           FROM conta_receber cr INNER JOIN venda v ON v.id = cr.venda_id
           WHERE cr.situacao = 'ABERTA' AND (:vid = 0 OR v.vendedor_id = :vid)
         )`
      )
      .get({ hoje, vid }) as { qtd: number; soma: number; vencidasQtd: number; vencidasSoma: number }

    const pagar = incluirPagar
      ? (db
          .prepare(
            `SELECT COALESCE(SUM(CASE WHEN vencimento < :hoje THEN 1 ELSE 0 END), 0) AS vencidasQtd,
                    COALESCE(SUM(CASE WHEN vencimento < :hoje THEN saldo ELSE 0 END), 0) AS vencidasSoma,
                    COALESCE(SUM(CASE WHEN vencimento = :hoje THEN 1 ELSE 0 END), 0) AS hojeQtd,
                    COALESCE(SUM(CASE WHEN vencimento = :hoje THEN saldo ELSE 0 END), 0) AS hojeSoma
             FROM (
               SELECT cp.vencimento,
                      cp.valor_centavos - COALESCE((SELECT SUM(pg.valor_centavos) FROM pagamento pg WHERE pg.conta_pagar_id = cp.id), 0) AS saldo
               FROM conta_pagar cp WHERE cp.situacao = 'ABERTA'
             )`
          )
          .get({ hoje }) as { vencidasQtd: number; vencidasSoma: number; hojeQtd: number; hojeSoma: number })
      : null

    const prontas = db
      .prepare(
        `SELECT COUNT(*) AS qtd,
                COALESCE(SUM(CASE WHEN data_chegada IS NOT NULL AND data_chegada < :limite THEN 1 ELSE 0 END), 0) AS haMuito
         FROM ordem_servico WHERE situacao = 'CHEGOU' AND (:vid = 0 OR criado_por = :vid)`
      )
      .get({ limite: somarDias(hoje, -7), vid }) as { qtd: number; haMuito: number }

    return {
      produtosAbaixoMinimo: contarAbaixoMinimo(),
      osAtrasadas: ordemServicoRepository.contarAtrasadas(vendedorId ?? undefined),
      osProntas: prontas.qtd,
      osProntasHaMuito: prontas.haMuito,
      aniversariantesSemana: contarAniversariantesSemana(db, hoje),
      receber: {
        abertoCentavos: receber.soma,
        abertoQtd: receber.qtd,
        vencidasCentavos: receber.vencidasSoma,
        vencidasQtd: receber.vencidasQtd
      },
      pagar: pagar
        ? {
            vencidasCentavos: pagar.vencidasSoma,
            vencidasQtd: pagar.vencidasQtd,
            hojeCentavos: pagar.hojeSoma,
            hojeQtd: pagar.hojeQtd
          }
        : null
    }
  }
}
