import { getDb } from '@main/db/connection'
import { maiusculo, termoBusca } from '@shared/texto'
import type { ContaPagar, SituacaoContaPagar } from '@shared/types'
import { hojeLocal } from '@shared/data'
import { limiteDaListaPadrao } from '@shared/recorrencia'

function hoje(): string {
  return hojeLocal()
}

const SELECT_CONTA_PAGAR = `
  SELECT cp.id, cp.compra_id, cp.fornecedor_id, f.razao_social AS fornecedor_nome,
         cp.descricao, cp.categoria, cp.valor_centavos, cp.vencimento, cp.situacao, cp.recorrencia_id, cp.competencia,
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
  recorrencia_id: number | null
  competencia: string | null
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
    recorrente: row.recorrencia_id !== null,
    recorrenciaId: row.recorrencia_id,
    competencia: row.competencia,
    vencida: row.situacao === 'ABERTA' && row.vencimento < hoje()
  }
}

export const contaPagarRepository = {
  /**
   * Nunca traz as contas excluidas (exclusao logica). Por padrao as ocorrencias de recorrencia so
   * aparecem ate o fim do MES SEGUINTE: os 12 meses materializados a frente ficam atras de
   * "Mostrar contas futuras" (`incluirFuturas`). Conta avulsa nunca e escondida por data.
   */
  listar(query: { busca?: string; situacao?: string; apenasVencidas?: boolean; incluirFuturas?: boolean }): ContaPagar[] {
    const rows = getDb()
      .prepare(
        `${SELECT_CONTA_PAGAR}
         WHERE cp.excluido_em IS NULL
           AND (sem_acento(cp.descricao) LIKE :termo OR sem_acento(f.razao_social) LIKE :termo)
           AND (:situacao = '' OR cp.situacao = :situacao)
           AND (:apenasVencidas = 0 OR (cp.situacao = 'ABERTA' AND cp.vencimento < :hoje))
           AND (:incluirFuturas = 1 OR cp.recorrencia_id IS NULL OR cp.vencimento <= :limite)
         ORDER BY cp.vencimento ASC, cp.id ASC
         LIMIT 500`
      )
      .all({
        termo: termoBusca(query.busca),
        situacao: query.situacao?.trim() || '',
        apenasVencidas: query.apenasVencidas ? 1 : 0,
        incluirFuturas: query.incluirFuturas ? 1 : 0,
        hoje: hoje(),
        limite: limiteDaListaPadrao(hoje())
      }) as unknown as ContaPagarRow[]
    return rows.map(toContaPagar)
  },

  /** A conta, se ainda nao foi excluida. */
  buscarPorId(id: number): ContaPagar | null {
    const row = getDb().prepare(`${SELECT_CONTA_PAGAR} WHERE cp.id = :id AND cp.excluido_em IS NULL`).get({ id }) as ContaPagarRow | undefined
    return row ? toContaPagar(row) : null
  },

  /** A ocorrencia de uma serie numa competencia (AAAA-MM), se nao foi excluida. */
  buscarPorSerieECompetencia(recorrenciaId: number, competencia: string): ContaPagar | null {
    const row = getDb()
      .prepare(`${SELECT_CONTA_PAGAR} WHERE cp.recorrencia_id = :recorrenciaId AND cp.competencia = :competencia AND cp.excluido_em IS NULL`)
      .get({ recorrenciaId, competencia }) as ContaPagarRow | undefined
    return row ? toContaPagar(row) : null
  },

  fornecedorExiste(id: number): boolean {
    return getDb().prepare('SELECT 1 FROM fornecedor WHERE id = :id').get({ id }) !== undefined
  },

  /** RF-11.2: lancamento manual de despesa avulsa (a de recorrencia nasce em recorrenciaRepository; a de compra, em compraRepository). */
  criar(input: { descricao: string; categoria: string | null; fornecedorId: number | null; valorCentavos: number; vencimento: string }): number {
    const info = getDb()
      .prepare(
        `INSERT INTO conta_pagar (descricao, categoria, fornecedor_id, valor_centavos, vencimento, situacao, recorrente)
         VALUES (:descricao, :categoria, :fornecedorId, :valor, :vencimento, 'ABERTA', 0)`
      )
      .run({
        descricao: maiusculo(input.descricao),
        categoria: input.categoria,
        fornecedorId: input.fornecedorId,
        valor: input.valorCentavos,
        vencimento: input.vencimento
      })
    return Number(info.lastInsertRowid)
  },

  /** Editar "somente esta": valor proprio e vencimento desta ocorrencia (a competencia nao muda). So conta em aberto. */
  atualizarOcorrencia(id: number, dados: { valorCentavos: number; vencimento: string }): void {
    getDb()
      .prepare("UPDATE conta_pagar SET valor_centavos = :valor, vencimento = :vencimento WHERE id = :id AND situacao = 'ABERTA' AND excluido_em IS NULL")
      .run({ id, valor: dados.valorCentavos, vencimento: dados.vencimento })
  },

  /** Exclusao logica (RG-02) de uma conta. */
  excluir(id: number, motivo: string | null): void {
    getDb()
      .prepare("UPDATE conta_pagar SET excluido_em = datetime('now'), excluido_motivo = :motivo WHERE id = :id AND excluido_em IS NULL")
      .run({ id, motivo })
  },

  /**
   * RF-11.2/RN-05 (mesmo principio aplicado a contas a pagar): registra o
   * pagamento, atualiza a situacao so quando a soma cobre o valor (suporta
   * pagamento parcial) e lanca a despesa automaticamente. As ocorrencias de
   * uma despesa recorrente NAO nascem mais aqui: o job de recorrencia
   * (recorrenciaRepository.completarHorizonte) mantem 12 meses a frente.
   */
  pagar(id: number, params: { valorCentavos: number; data: string | null; formaPagamento: string; usuarioId: number }): void {
    const db = getDb()
    db.exec('BEGIN IMMEDIATE')
    try {
      const conta = db
        .prepare('SELECT categoria, valor_centavos FROM conta_pagar WHERE id = :id AND excluido_em IS NULL')
        .get({ id }) as { categoria: string | null; valor_centavos: number } | undefined
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

      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }
}
