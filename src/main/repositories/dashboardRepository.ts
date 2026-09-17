import { getDb } from '@main/db/connection'
import { listarComSaldo } from './estoqueRepository'
import { ordemServicoRepository } from './ordemServicoRepository'
import type { DashboardAdmin, DashboardVendedor, RankingVendedorItem } from '@shared/types'

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
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
      rankingVendedores
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
      aniversariantesSemana
    }
  }
}
