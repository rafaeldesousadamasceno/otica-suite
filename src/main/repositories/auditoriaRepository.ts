import { getDb } from '@main/db/connection'
import type { AuditoriaEntrada } from '@shared/types'

export interface RegistrarAuditoriaInput {
  usuarioId: number | null
  autorizadoPorId?: number | null
  acao: string
  entidade: string
  entidadeId?: number | null
  valorAnterior?: unknown
  valorNovo?: unknown
}

interface AuditoriaRow {
  id: number
  usuario_nome: string | null
  autorizado_por_nome: string | null
  acao: string
  entidade: string
  entidade_id: number | null
  valor_anterior: string | null
  valor_novo: string | null
  data_hora: string
}

export const auditoriaRepository = {
  /**
   * Registro de auditoria (RF-15): quem, o que, quando. E somente-leitura
   * por design - nao existe update/delete aqui, de proposito.
   */
  registrar(input: RegistrarAuditoriaInput): void {
    getDb()
      .prepare(
        `INSERT INTO auditoria (
           usuario_id, autorizado_por_id, acao, entidade, entidade_id,
           valor_anterior, valor_novo
         ) VALUES (
           :usuarioId, :autorizadoPorId, :acao, :entidade, :entidadeId,
           :valorAnterior, :valorNovo
         )`
      )
      .run({
        usuarioId: input.usuarioId,
        autorizadoPorId: input.autorizadoPorId ?? null,
        acao: input.acao,
        entidade: input.entidade,
        entidadeId: input.entidadeId ?? null,
        valorAnterior: input.valorAnterior ? JSON.stringify(input.valorAnterior) : null,
        valorNovo: input.valorNovo ? JSON.stringify(input.valorNovo) : null
      })
  },

  listar(limite = 200): AuditoriaEntrada[] {
    const rows = getDb()
      .prepare(
        `SELECT
           a.id, a.acao, a.entidade, a.entidade_id, a.valor_anterior, a.valor_novo, a.data_hora,
           u.nome AS usuario_nome, au.nome AS autorizado_por_nome
         FROM auditoria a
         LEFT JOIN usuario u ON u.id = a.usuario_id
         LEFT JOIN usuario au ON au.id = a.autorizado_por_id
         ORDER BY a.data_hora DESC, a.id DESC
         LIMIT :limite`
      )
      .all({ limite }) as unknown as AuditoriaRow[]

    return rows.map((r) => ({
      id: r.id,
      usuarioNome: r.usuario_nome,
      autorizadoPorNome: r.autorizado_por_nome,
      acao: r.acao,
      entidade: r.entidade,
      entidadeId: r.entidade_id,
      valorAnterior: r.valor_anterior,
      valorNovo: r.valor_novo,
      dataHora: r.data_hora
    }))
  }
}
