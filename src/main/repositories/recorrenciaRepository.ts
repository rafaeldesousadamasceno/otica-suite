import type { DatabaseSync } from 'node:sqlite'
import { getDb } from '@main/db/connection'
import { maiusculo } from '@shared/texto'
import { hojeLocal } from '@shared/data'
import { aplicarReajuste, competenciaDeData, diaDeData, planejarOcorrencias, valorVigenteNaCompetencia } from '@shared/recorrencia'
import type { FrequenciaRecorrencia, Recorrencia, RecorrenciaValor, StatusRecorrencia } from '@shared/types'

/**
 * Serie de contas a pagar (aluguel, energia...) e os lancamentos que ela gera (documento de melhorias,
 * secao 10). As ocorrencias sao MATERIALIZADAS: cada uma e uma linha de `conta_pagar` com valor proprio
 * (snapshot). A chave unica (recorrencia_id, competencia) conta tambem as linhas excluidas, entao nada
 * que o usuario removeu e recriado.
 */

interface RecorrenciaRow {
  id: number
  descricao: string
  categoria: string | null
  fornecedor_id: number | null
  fornecedor_nome: string | null
  frequencia: FrequenciaRecorrencia
  dia_vencimento: number
  data_inicio: string
  data_fim: string | null
  status: StatusRecorrencia
  abertas: number
  proximo_vencimento: string | null
}

const SELECT_RECORRENCIA = `
  SELECT r.id, r.descricao, r.categoria, r.fornecedor_id, f.razao_social AS fornecedor_nome,
         r.frequencia, r.dia_vencimento, r.data_inicio, r.data_fim, r.status,
         (SELECT COUNT(*) FROM conta_pagar cp
           WHERE cp.recorrencia_id = r.id AND cp.situacao = 'ABERTA' AND cp.excluido_em IS NULL) AS abertas,
         (SELECT MIN(cp.vencimento) FROM conta_pagar cp
           WHERE cp.recorrencia_id = r.id AND cp.situacao = 'ABERTA' AND cp.excluido_em IS NULL) AS proximo_vencimento
  FROM recorrencia r
  LEFT JOIN fornecedor f ON f.id = r.fornecedor_id
`

/** Transacao curta: ou tudo, ou nada. Nao pode ser aninhada. */
function emTransacao<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb()
  db.exec('BEGIN IMMEDIATE')
  try {
    const resultado = fn(db)
    db.exec('COMMIT')
    return resultado
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

function lerVigencias(db: DatabaseSync, recorrenciaId: number): RecorrenciaValor[] {
  const rows = db
    .prepare('SELECT vigente_desde, valor_centavos FROM recorrencia_valor WHERE recorrencia_id = :id ORDER BY vigente_desde')
    .all({ id: recorrenciaId }) as unknown as { vigente_desde: string; valor_centavos: number }[]
  return rows.map((r) => ({ vigenteDesde: r.vigente_desde, valorCentavos: r.valor_centavos }))
}

function toRecorrencia(db: DatabaseSync, row: RecorrenciaRow, hoje: string): Recorrencia {
  const vigencias = lerVigencias(db, row.id)
  return {
    id: row.id,
    descricao: row.descricao,
    categoria: row.categoria,
    fornecedorId: row.fornecedor_id,
    fornecedorNome: row.fornecedor_nome,
    frequencia: row.frequencia,
    diaVencimento: row.dia_vencimento,
    dataInicio: row.data_inicio,
    dataFim: row.data_fim,
    status: row.status,
    valorAtualCentavos: valorVigenteNaCompetencia(vigencias, competenciaDeData(hoje)) ?? 0,
    vigencias,
    abertas: row.abertas,
    proximoVencimento: row.proximo_vencimento
  }
}

/** Cria as ocorrencias que faltam no horizonte. Dentro de uma transacao ja aberta. Devolve quantas criou. */
function materializar(db: DatabaseSync, row: RecorrenciaRow, hoje: string, incluirPassado: boolean): number {
  const existentes = (
    db.prepare('SELECT competencia FROM conta_pagar WHERE recorrencia_id = :id AND competencia IS NOT NULL').all({ id: row.id }) as unknown as {
      competencia: string
    }[]
  ).map((r) => r.competencia)

  const plano = planejarOcorrencias({
    serie: { frequencia: row.frequencia, diaVencimento: row.dia_vencimento, dataInicio: row.data_inicio, dataFim: row.data_fim },
    vigencias: lerVigencias(db, row.id),
    existentes,
    hoje,
    incluirPassado
  })

  // OR IGNORE: se outra gravacao criou a mesma competencia no meio do caminho, o indice unico a barra sem erro.
  const inserir = db.prepare(
    `INSERT OR IGNORE INTO conta_pagar
       (fornecedor_id, descricao, categoria, valor_centavos, vencimento, situacao, recorrente, recorrencia_id, competencia)
     VALUES (:fornecedorId, :descricao, :categoria, :valor, :vencimento, 'ABERTA', 1, :recorrenciaId, :competencia)`
  )
  let criadas = 0
  for (const o of plano) {
    const info = inserir.run({
      fornecedorId: row.fornecedor_id,
      descricao: row.descricao,
      categoria: row.categoria,
      valor: o.valorCentavos,
      vencimento: o.vencimento,
      recorrenciaId: row.id,
      competencia: o.competencia
    })
    criadas += Number(info.changes)
  }
  return criadas
}

function lerLinha(db: DatabaseSync, id: number): RecorrenciaRow | undefined {
  return db.prepare(`${SELECT_RECORRENCIA} WHERE r.id = :id`).get({ id }) as unknown as RecorrenciaRow | undefined
}

export interface CriarRecorrenciaInput {
  descricao: string
  categoria: string | null
  fornecedorId: number | null
  frequencia: FrequenciaRecorrencia
  /** Primeiro vencimento: define o dia do mes e o inicio da serie. */
  primeiroVencimento: string
  dataFim: string | null
  valorCentavos: number
}

export const recorrenciaRepository = {
  listar(): Recorrencia[] {
    const db = getDb()
    const hoje = hojeLocal()
    const rows = db
      .prepare(`${SELECT_RECORRENCIA} ORDER BY (r.status = 'ATIVA') DESC, r.descricao COLLATE NOCASE, r.id`)
      .all() as unknown as RecorrenciaRow[]
    return rows.map((r) => toRecorrencia(db, r, hoje))
  },

  buscarPorId(id: number): Recorrencia | null {
    const db = getDb()
    const row = lerLinha(db, id)
    return row ? toRecorrencia(db, row, hojeLocal()) : null
  },

  /** Cria a serie, a vigencia inicial e ja materializa o horizonte (inclusive meses passados desde o inicio). Devolve o id. */
  criar(input: CriarRecorrenciaInput, hoje: string = hojeLocal()): number {
    return emTransacao((db) => {
      const info = db
        .prepare(
          `INSERT INTO recorrencia (descricao, categoria, fornecedor_id, frequencia, dia_vencimento, data_inicio, data_fim, status)
           VALUES (:descricao, :categoria, :fornecedorId, :frequencia, :dia, :inicio, :fim, 'ATIVA')`
        )
        .run({
          descricao: maiusculo(input.descricao),
          categoria: input.categoria,
          fornecedorId: input.fornecedorId,
          frequencia: input.frequencia,
          dia: diaDeData(input.primeiroVencimento),
          inicio: input.primeiroVencimento,
          fim: input.dataFim
        })
      const id = Number(info.lastInsertRowid)
      db.prepare('INSERT INTO recorrencia_valor (recorrencia_id, valor_centavos, vigente_desde) VALUES (:id, :valor, :desde)').run({
        id,
        valor: input.valorCentavos,
        desde: competenciaDeData(input.primeiroVencimento)
      })
      materializar(db, lerLinha(db, id)!, hoje, true)
      return id
    })
  },

  /**
   * O job: completa o horizonte de todas as series ATIVAS. Idempotente (rodar de novo nao duplica nem
   * recria excluidas). Devolve quantas contas criou.
   */
  completarHorizonte(hoje: string = hojeLocal()): number {
    const db = getDb()
    const ativas = db.prepare(`${SELECT_RECORRENCIA} WHERE r.status = 'ATIVA'`).all() as unknown as RecorrenciaRow[]
    if (ativas.length === 0) return 0
    return emTransacao((tx) => ativas.reduce((total, r) => total + materializar(tx, r, hoje, false), 0))
  },

  /**
   * Reajuste: grava a vigencia nova (e descarta as marcadas para depois) e atualiza so os lancamentos
   * ABERTOS, sem pagamento, de competencia igual ou posterior. Pagos e anteriores ficam intactos.
   * Devolve quantos lancamentos mudaram de valor.
   */
  reajustar(id: number, aPartirDeCompetencia: string, valorCentavos: number): number {
    return emTransacao((db) => {
      const novas = aplicarReajuste(lerVigencias(db, id), aPartirDeCompetencia, valorCentavos)
      db.prepare('DELETE FROM recorrencia_valor WHERE recorrencia_id = :id AND vigente_desde > :desde').run({ id, desde: aPartirDeCompetencia })
      const nova = novas.find((v) => v.vigenteDesde === aPartirDeCompetencia)!
      db.prepare(
        `INSERT INTO recorrencia_valor (recorrencia_id, valor_centavos, vigente_desde) VALUES (:id, :valor, :desde)
         ON CONFLICT (recorrencia_id, vigente_desde) DO UPDATE SET valor_centavos = excluded.valor_centavos`
      ).run({ id, valor: nova.valorCentavos, desde: nova.vigenteDesde })

      const info = db
        .prepare(
          `UPDATE conta_pagar SET valor_centavos = :valor
           WHERE recorrencia_id = :id AND situacao = 'ABERTA' AND excluido_em IS NULL
             AND competencia >= :desde AND valor_centavos <> :valor
             AND NOT EXISTS (SELECT 1 FROM pagamento p WHERE p.conta_pagar_id = conta_pagar.id)`
        )
        .run({ id, valor: valorCentavos, desde: aPartirDeCompetencia })
      return Number(info.changes)
    })
  },

  /**
   * Encerra a serie: status ENCERRADA, data de fim gravada e os lancamentos ABERTOS (sem pagamento) que
   * vencem depois da data saem por exclusao logica. Devolve quantos foram removidos.
   */
  encerrar(id: number, dataFim: string, motivo: string | null): number {
    return emTransacao((db) => {
      db.prepare("UPDATE recorrencia SET status = 'ENCERRADA', data_fim = :fim WHERE id = :id").run({ id, fim: dataFim })
      const info = db
        .prepare(
          `UPDATE conta_pagar SET excluido_em = datetime('now'), excluido_motivo = :motivo
           WHERE recorrencia_id = :id AND situacao = 'ABERTA' AND excluido_em IS NULL AND vencimento > :fim
             AND NOT EXISTS (SELECT 1 FROM pagamento p WHERE p.conta_pagar_id = conta_pagar.id)`
        )
        .run({ id, fim: dataFim, motivo })
      return Number(info.changes)
    })
  },

  /**
   * "Excluir esta e as proximas": exclui a conta e os lancamentos ABERTOS (sem pagamento) de competencia
   * posterior e encerra a serie no fim do mes anterior. Devolve quantas contas foram excluidas (a propria incluida).
   */
  excluirEstaEAsProximas(contaId: number, recorrenciaId: number, competencia: string, dataFim: string, motivo: string | null): number {
    return emTransacao((db) => {
      db.prepare("UPDATE recorrencia SET status = 'ENCERRADA', data_fim = :fim WHERE id = :id").run({ id: recorrenciaId, fim: dataFim })
      const info = db
        .prepare(
          `UPDATE conta_pagar SET excluido_em = datetime('now'), excluido_motivo = :motivo
           WHERE recorrencia_id = :rid AND excluido_em IS NULL AND situacao = 'ABERTA'
             AND (id = :contaId OR competencia > :competencia)
             AND NOT EXISTS (SELECT 1 FROM pagamento p WHERE p.conta_pagar_id = conta_pagar.id)`
        )
        .run({ rid: recorrenciaId, contaId, competencia, motivo })
      return Number(info.changes)
    })
  }
}
