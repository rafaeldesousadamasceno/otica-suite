import { getDb } from '@main/db/connection'
import { listarComSaldo } from './estoqueRepository'
import { ordemServicoRepository } from './ordemServicoRepository'
import { FLUXO_SITUACAO_OS } from '@shared/types'
import type {
  CategoriaVenda,
  DashboardAdmin,
  DashboardVendedor,
  EtapaOS,
  FluxoMesItem,
  OsEtapaItem,
  RankingVendedorItem,
  VendaCategoriaItem,
  VendaDiaItem
} from '@shared/types'

const DIAS_GRAFICO = 30
const MESES_GRAFICO = 6
const ETAPAS_EM_ANDAMENTO = FLUXO_SITUACAO_OS.slice(0, 3) as unknown as EtapaOS[]

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Datas 'YYYY-MM-DD' dos ultimos `n` dias, terminando hoje. Em UTC de
 * proposito: e o mesmo criterio de `hoje()` e de `venda.data`, entao a barra
 * de hoje do grafico bate com o card "Vendas hoje".
 */
function ultimosDias(n: number): string[] {
  const [ano, mes, dia] = hoje().split('-').map(Number)
  const base = Date.UTC(ano, mes - 1, dia)
  return Array.from({ length: n }, (_, i) => new Date(base - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10))
}

/** Meses 'YYYY-MM' dos ultimos `n` meses, terminando no mes corrente. */
function ultimosMeses(n: number): string[] {
  const [ano, mes] = hoje().split('-').map(Number)
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(ano, mes - 1 - (n - 1 - i), 1)).toISOString().slice(0, 7))
}

/** `vendedorId` ausente = a loja toda (so o Administrador chega aqui sem filtro). */
function vendasPorDia(db: ReturnType<typeof getDb>, vendedorId?: number): VendaDiaItem[] {
  const dias = ultimosDias(DIAS_GRAFICO)
  const rows = db
    .prepare(
      `SELECT data, SUM(total_centavos) AS total
       FROM venda
       WHERE situacao != 'CANCELADA' AND data >= :inicio AND data <= :fim
         AND (:vendedorId = 0 OR vendedor_id = :vendedorId)
       GROUP BY data`
    )
    .all({ inicio: dias[0], fim: dias[dias.length - 1], vendedorId: vendedorId ?? 0 }) as unknown as {
    data: string
    total: number
  }[]
  const porDia = new Map(rows.map((r) => [r.data, r.total]))
  return dias.map((data) => ({ data, totalCentavos: porDia.get(data) ?? 0 }))
}

/** Mesma definicao do card "Saldo do mes" (todos os lancamentos), para os numeros baterem na tela. */
function fluxoMensal(db: ReturnType<typeof getDb>): FluxoMesItem[] {
  const meses = ultimosMeses(MESES_GRAFICO)
  const rows = db
    .prepare(
      `SELECT substr(data, 1, 7) AS mes, tipo, SUM(valor_centavos) AS total
       FROM lancamento
       WHERE data >= :inicio AND data <= :fim
       GROUP BY substr(data, 1, 7), tipo`
    )
    .all({ inicio: `${meses[0]}-01`, fim: hoje() }) as unknown as {
    mes: string
    tipo: 'RECEITA' | 'DESPESA'
    total: number
  }[]

  return meses.map((mes) => ({
    mes,
    receitasCentavos: rows.find((r) => r.mes === mes && r.tipo === 'RECEITA')?.total ?? 0,
    despesasCentavos: rows.find((r) => r.mes === mes && r.tipo === 'DESPESA')?.total ?? 0
  }))
}

function vendasPorCategoria(db: ReturnType<typeof getDb>, inicioDoMes: string): VendaCategoriaItem[] {
  const rows = db
    .prepare(
      `SELECT COALESCE(p.categoria, 'outros') AS categoria, SUM(vi.total_centavos) AS total
       FROM venda_item vi
       INNER JOIN venda v ON v.id = vi.venda_id
       LEFT JOIN produto p ON p.id = vi.produto_id
       WHERE v.situacao != 'CANCELADA' AND v.data >= :inicioMes AND v.data <= :hoje
       GROUP BY COALESCE(p.categoria, 'outros')
       ORDER BY total DESC`
    )
    .all({ inicioMes: inicioDoMes, hoje: hoje() }) as unknown as { categoria: CategoriaVenda; total: number }[]
  return rows.map((r) => ({ categoria: r.categoria, totalCentavos: r.total }))
}

/** Sempre devolve as tres etapas, na ordem do fluxo, com 0 nas vazias - o funil nao "pula" etapa. */
function osPorEtapa(db: ReturnType<typeof getDb>, vendedorId?: number): OsEtapaItem[] {
  const rows = db
    .prepare(
      `SELECT situacao, COUNT(*) AS qtd
       FROM ordem_servico
       WHERE situacao IN (:e0, :e1, :e2) AND (:vendedorId = 0 OR criado_por = :vendedorId)
       GROUP BY situacao`
    )
    .all({
      e0: ETAPAS_EM_ANDAMENTO[0],
      e1: ETAPAS_EM_ANDAMENTO[1],
      e2: ETAPAS_EM_ANDAMENTO[2],
      vendedorId: vendedorId ?? 0
    }) as unknown as { situacao: EtapaOS; qtd: number }[]
  return ETAPAS_EM_ANDAMENTO.map((situacao) => ({
    situacao,
    quantidade: rows.find((r) => r.situacao === situacao)?.qtd ?? 0
  }))
}

function inicioMes(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/** Primeiro e ultimo dia do mes anterior ao atual, no formato 'YYYY-MM-DD'. */
function mesAnterior(): { inicio: string; fim: string } {
  const d = new Date()
  const primeiroDiaMesAtual = new Date(d.getFullYear(), d.getMonth(), 1)
  const ultimoDiaMesAnterior = new Date(primeiroDiaMesAtual.getTime() - 24 * 60 * 60 * 1000)
  const inicio = new Date(ultimoDiaMesAnterior.getFullYear(), ultimoDiaMesAnterior.getMonth(), 1)
  const fmt = (dt: Date): string =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  return { inicio: fmt(inicio), fim: fmt(ultimoDiaMesAnterior) }
}

/** Proximos 7 dias (hoje incluso), formato 'MM-DD', para comparar com strftime('%m-%d', ...). */
function proximosSeteDiasMD(): string[] {
  const dias: string[] = []
  const base = new Date()
  for (let i = 0; i < 7; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)
    dias.push(`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  return dias
}

function em7dias(): string {
  const d = new Date()
  d.setDate(d.getDate() + 6)
  return d.toISOString().slice(0, 10)
}

function contarAniversariantesSemana(): number {
  const db = getDb()
  const dias = proximosSeteDiasMD()
  const params: Record<string, string> = {}
  const placeholders = dias.map((md, i) => {
    params[`d${i}`] = md
    return `:d${i}`
  })
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM cliente
       WHERE ativo = 1 AND data_nasc IS NOT NULL
         AND strftime('%m-%d', data_nasc) IN (${placeholders.join(',')})`
    )
    .get(params) as { n: number }
  return row.n
}

function somaVendas(db: ReturnType<typeof getDb>, where: string, params: Record<string, string | number>): number {
  const row = db
    .prepare(`SELECT COALESCE(SUM(total_centavos), 0) AS soma FROM venda WHERE situacao != 'CANCELADA' AND ${where}`)
    .get(params) as { soma: number }
  return row.soma
}

export const dashboardRepository = {
  obterAdmin(): DashboardAdmin {
    const db = getDb()
    const dataHoje = hoje()
    const dataInicioMes = inicioMes()
    const { inicio: inicioMesAnt, fim: fimMesAnt } = mesAnterior()
    const dataEm7dias = em7dias()

    const vendasHojeCentavos = somaVendas(db, 'data = :hoje', { hoje: dataHoje })
    const vendasMesCentavos = somaVendas(db, 'data >= :inicioMes AND data <= :hoje', {
      inicioMes: dataInicioMes,
      hoje: dataHoje
    })
    const vendasMesAnteriorCentavos = somaVendas(db, 'data >= :inicio AND data <= :fim', {
      inicio: inicioMesAnt,
      fim: fimMesAnt
    })

    const receberVencendo = db
      .prepare(
        `SELECT COUNT(*) AS qtd,
                COALESCE(SUM(cr.valor_centavos - COALESCE(
                  (SELECT SUM(r.valor_centavos) FROM recebimento r WHERE r.conta_receber_id = cr.id), 0
                )), 0) AS soma
         FROM conta_receber cr
         WHERE cr.situacao = 'ABERTA' AND cr.vencimento BETWEEN :hoje AND :em7dias`
      )
      .get({ hoje: dataHoje, em7dias: dataEm7dias }) as { qtd: number; soma: number }

    const receberVencidas = db
      .prepare(`SELECT COUNT(*) AS qtd FROM conta_receber WHERE situacao = 'ABERTA' AND vencimento < :hoje`)
      .get({ hoje: dataHoje }) as { qtd: number }

    const pagarVencendo = db
      .prepare(
        `SELECT COUNT(*) AS qtd,
                COALESCE(SUM(cp.valor_centavos - COALESCE(
                  (SELECT SUM(p.valor_centavos) FROM pagamento p WHERE p.conta_pagar_id = cp.id), 0
                )), 0) AS soma
         FROM conta_pagar cp
         WHERE cp.situacao = 'ABERTA' AND cp.vencimento = :hoje`
      )
      .get({ hoje: dataHoje }) as { qtd: number; soma: number }

    const saldoMes = db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN tipo = 'RECEITA' THEN valor_centavos ELSE -valor_centavos END), 0) AS saldo
         FROM lancamento
         WHERE data >= :inicioMes AND data <= :hoje`
      )
      .get({ inicioMes: dataInicioMes, hoje: dataHoje }) as { saldo: number }

    const produtosAbaixoMinimo = listarComSaldo({ busca: '', categoria: '', situacao: 'abaixo_minimo' }).length
    const osAtrasadas = ordemServicoRepository.listar({ apenasAtrasadas: true }).length
    const aniversariantesSemana = contarAniversariantesSemana()

    const rankingRows = db
      .prepare(
        `SELECT v.vendedor_id AS vendedorId, u.nome AS vendedorNome, SUM(v.total_centavos) AS total
         FROM venda v
         INNER JOIN usuario u ON u.id = v.vendedor_id
         WHERE v.situacao != 'CANCELADA' AND v.data >= :inicioMes AND v.data <= :hoje
         GROUP BY v.vendedor_id, u.nome
         ORDER BY total DESC
         LIMIT 10`
      )
      .all({ inicioMes: dataInicioMes, hoje: dataHoje }) as unknown as {
      vendedorId: number
      vendedorNome: string
      total: number
    }[]
    const rankingVendedores: RankingVendedorItem[] = rankingRows.map((r) => ({
      vendedorId: r.vendedorId,
      vendedorNome: r.vendedorNome,
      totalCentavos: r.total
    }))

    return {
      vendasHojeCentavos,
      vendasMesCentavos,
      vendasMesAnteriorCentavos,
      contasReceberVencendoCentavos: receberVencendo.soma,
      contasReceberVencendoQtd: receberVencendo.qtd,
      contasReceberVencidasQtd: receberVencidas.qtd,
      contasPagarVencendoCentavos: pagarVencendo.soma,
      contasPagarVencendoQtd: pagarVencendo.qtd,
      saldoMesCentavos: saldoMes.saldo,
      produtosAbaixoMinimo,
      osAtrasadas,
      aniversariantesSemana,
      rankingVendedores,
      vendasPorDia: vendasPorDia(db),
      fluxoMensal: fluxoMensal(db),
      vendasPorCategoria: vendasPorCategoria(db, dataInicioMes),
      osPorEtapa: osPorEtapa(db)
    }
  },

  obterVendedor(vendedorId: number): DashboardVendedor {
    const db = getDb()
    const dataHoje = hoje()
    const dataInicioMes = inicioMes()

    const vendasHojeCentavos = somaVendas(db, 'data = :hoje AND vendedor_id = :vendedorId', {
      hoje: dataHoje,
      vendedorId
    })
    const vendasMesCentavos = somaVendas(db, 'data >= :inicioMes AND data <= :hoje AND vendedor_id = :vendedorId', {
      inicioMes: dataInicioMes,
      hoje: dataHoje,
      vendedorId
    })

    const comissao = db
      .prepare(
        `SELECT COALESCE(SUM(valor_centavos), 0) AS soma FROM comissao
         WHERE vendedor_id = :vendedorId AND situacao IN ('PROVISIONADA', 'LIBERADA')`
      )
      .get({ vendedorId }) as { soma: number }

    const osResponsavel = db
      .prepare(
        `SELECT COUNT(*) AS qtd FROM ordem_servico
         WHERE criado_por = :vendedorId AND situacao NOT IN ('ENTREGUE', 'CANCELADA')`
      )
      .get({ vendedorId }) as { qtd: number }

    const osAguardandoRetirada = db
      .prepare(
        `SELECT COUNT(*) AS qtd FROM ordem_servico
         WHERE criado_por = :vendedorId AND situacao = 'CHEGOU'`
      )
      .get({ vendedorId }) as { qtd: number }

    const aniversariantesSemana = contarAniversariantesSemana()

    return {
      vendasHojeCentavos,
      vendasMesCentavos,
      comissaoAcumuladaCentavos: comissao.soma,
      osResponsavel: osResponsavel.qtd,
      osAguardandoRetirada: osAguardandoRetirada.qtd,
      aniversariantesSemana,
      vendasPorDia: vendasPorDia(db, vendedorId),
      osPorEtapa: osPorEtapa(db, vendedorId)
    }
  }
}
