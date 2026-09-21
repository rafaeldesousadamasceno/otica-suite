import { getDb } from '@main/db/connection'
import type { OrdemServico, SituacaoOS } from '@shared/types'
import type { OrdemServicoCreateInput, OrdensServicoQuery } from '@shared/ipc'
import { hojeLocal } from '@shared/data'

interface OrdemServicoRow {
  id: number
  numero: string
  cliente_id: number
  cliente_nome: string
  cliente_celular: string | null
  receita_optica_id: number | null
  receita_tipo_lente: string | null
  laboratorio: string | null
  situacao: SituacaoOS
  data_abertura: string
  data_envio: string | null
  data_previsao: string | null
  data_chegada: string | null
  data_entrega: string | null
  observacao: string | null
}

function hoje(): string {
  return hojeLocal()
}

function toDomain(row: OrdemServicoRow): OrdemServico {
  const naoChegou = row.situacao === 'EM ABERTO' || row.situacao === 'LABORATÓRIO'
  return {
    id: row.id,
    numero: row.numero,
    clienteId: row.cliente_id,
    clienteNome: row.cliente_nome,
    clienteCelular: row.cliente_celular,
    receitaOpticaId: row.receita_optica_id,
    receitaTipoLente: row.receita_tipo_lente,
    laboratorio: row.laboratorio,
    situacao: row.situacao,
    dataAbertura: row.data_abertura,
    dataEnvio: row.data_envio,
    dataPrevisao: row.data_previsao,
    dataChegada: row.data_chegada,
    dataEntrega: row.data_entrega,
    observacao: row.observacao,
    atrasada: Boolean(row.data_previsao && naoChegou && row.data_previsao < hoje())
  }
}

const SELECT_BASE = `
  SELECT
    os.id, os.numero, os.cliente_id, os.receita_optica_id, os.laboratorio,
    os.situacao, os.data_abertura, os.data_envio, os.data_previsao,
    os.data_chegada, os.data_entrega, os.observacao,
    c.nome AS cliente_nome, c.celular AS cliente_celular,
    r.tipo_lente AS receita_tipo_lente
  FROM ordem_servico os
  INNER JOIN cliente c ON c.id = os.cliente_id
  LEFT JOIN receita_optica r ON r.id = os.receita_optica_id
`

function normalizar(v: string | null | undefined): string | null {
  const t = v?.trim()
  return t ? t : null
}

export const ordemServicoRepository = {
  /**
   * Cria a OS gerando o numero sequencial DENTRO da mesma transacao
   * (BEGIN IMMEDIATE): dois usuarios abrindo OS ao mesmo tempo nunca
   * recebem o mesmo numero (RF-06, CA1). O sistema anterior deixava o
   * numero ser digitado a mao - a colisao so aparecia no INSERT (D5).
   */
  criar(data: OrdemServicoCreateInput, prefixo: string, criadoPor: number): number {
    const db = getDb()
    const ano = new Date().getFullYear()
    const prefixoAno = prefixo ? `${prefixo}-${ano}-` : `${ano}-`

    db.exec('BEGIN IMMEDIATE')
    try {
      const ultimo = db
        .prepare(
          `SELECT numero FROM ordem_servico
           WHERE numero LIKE :padrao
           ORDER BY numero DESC LIMIT 1`
        )
        .get({ padrao: `${prefixoAno}%` }) as { numero: string } | undefined

      const sequencial = ultimo ? Number(ultimo.numero.slice(prefixoAno.length)) + 1 : 1
      const numero = `${prefixoAno}${String(sequencial).padStart(5, '0')}`

      const info = db
        .prepare(
          `INSERT INTO ordem_servico (
             numero, cliente_id, receita_optica_id, laboratorio,
             situacao, data_abertura, data_previsao, observacao, criado_por
           ) VALUES (
             :numero, :clienteId, :receitaOpticaId, :laboratorio,
             'EM ABERTO', :dataAbertura, :dataPrevisao, :observacao, :criadoPor
           )`
        )
        .run({
          numero,
          clienteId: data.clienteId,
          receitaOpticaId: data.receitaOpticaId ?? null,
          laboratorio: normalizar(data.laboratorio),
          dataAbertura: hoje(),
          dataPrevisao: normalizar(data.dataPrevisao),
          observacao: normalizar(data.observacao),
          criadoPor
        })

      db.exec('COMMIT')
      return Number(info.lastInsertRowid)
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  },

  buscarPorId(id: number): OrdemServico | null {
    const row = getDb()
      .prepare(`${SELECT_BASE} WHERE os.id = :id`)
      .get({ id }) as unknown as OrdemServicoRow | undefined
    return row ? toDomain(row) : null
  },

  listar(query: OrdensServicoQuery): OrdemServico[] {
    const rows = getDb()
      .prepare(
        `${SELECT_BASE}
         WHERE (c.nome LIKE :termo OR os.numero LIKE :termo)
           AND (:situacao = '' OR os.situacao = :situacao)
           AND (:dataInicio = '' OR os.data_abertura >= :dataInicio)
           AND (:dataFim = '' OR os.data_abertura <= :dataFim)
         ORDER BY os.data_abertura DESC, os.id DESC
         LIMIT 300`
      )
      .all({
        termo: `%${query.busca?.trim() ?? ''}%`,
        situacao: query.situacao?.trim() ?? '',
        dataInicio: normalizar(query.dataInicio) ?? '',
        dataFim: normalizar(query.dataFim) ?? ''
      }) as unknown as OrdemServicoRow[]

    const ordens = rows.map(toDomain)
    return query.apenasAtrasadas ? ordens.filter((os) => os.atrasada) : ordens
  },

  listarPorCliente(clienteId: number): OrdemServico[] {
    const rows = getDb()
      .prepare(`${SELECT_BASE} WHERE os.cliente_id = :clienteId ORDER BY os.id DESC`)
      .all({ clienteId }) as unknown as OrdemServicoRow[]
    return rows.map(toDomain)
  },

  atualizarSituacao(
    id: number,
    situacao: SituacaoOS,
    campoData: 'data_envio' | 'data_chegada' | 'data_entrega' | null,
    data: string | null
  ): void {
    const db = getDb()
    if (campoData) {
      // O nome da coluna vem da maquina de estados (shared/situacaoOS.ts),
      // nunca do payload do renderer - por isso e seguro interpolar aqui.
      db.prepare(
        `UPDATE ordem_servico SET situacao = :situacao, ${campoData} = :data WHERE id = :id`
      ).run({ id, situacao, data: data ?? hoje() })
    } else {
      db.prepare('UPDATE ordem_servico SET situacao = :situacao WHERE id = :id').run({ id, situacao })
    }
  },

  cancelar(id: number, motivo: string): void {
    getDb()
      .prepare(
        `UPDATE ordem_servico
         SET situacao = 'CANCELADA',
             observacao = TRIM(COALESCE(observacao, '') || char(10) || 'CANCELADA: ' || :motivo)
         WHERE id = :id`
      )
      .run({ id, motivo })
  },

  atualizarDados(
    id: number,
    laboratorio: string | null,
    dataPrevisao: string | null,
    observacao: string | null
  ): void {
    getDb()
      .prepare(
        `UPDATE ordem_servico
         SET laboratorio = :laboratorio, data_previsao = :dataPrevisao, observacao = :observacao
         WHERE id = :id`
      )
      .run({ id, laboratorio, dataPrevisao, observacao })
  }
}
