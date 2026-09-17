import { getDb } from '@main/db/connection'
import type { Fornecedor } from '@shared/types'
import type { FornecedorInput, FornecedoresListQuery } from '@shared/ipc'

interface FornecedorRow {
  id: number
  razao_social: string
  cnpj: string | null
  contato: string | null
  telefone: string | null
  email: string | null
  prazo_entrega_dias: number | null
  ativo: number
}

function toDomain(row: FornecedorRow): Fornecedor {
  return {
    id: row.id,
    razaoSocial: row.razao_social,
    cnpj: row.cnpj,
    contato: row.contato,
    telefone: row.telefone,
    email: row.email,
    prazoEntregaDias: row.prazo_entrega_dias,
    ativo: row.ativo === 1
  }
}

function normalizar(v: string | null | undefined): string | null {
  const t = v?.trim()
  return t ? t : null
}

export const fornecedorRepository = {
  listar(query: FornecedoresListQuery): Fornecedor[] {
    const rows = getDb()
      .prepare(
        `SELECT id, razao_social, cnpj, contato, telefone, email, prazo_entrega_dias, ativo
         FROM fornecedor
         WHERE (:apenasAtivos = 0 OR ativo = 1)
           AND (razao_social LIKE :termo OR cnpj LIKE :termo)
         ORDER BY razao_social
         LIMIT 300`
      )
      .all({
        termo: `%${query.busca?.trim() ?? ''}%`,
        apenasAtivos: query.apenasAtivos === false ? 0 : 1
      }) as unknown as FornecedorRow[]
    return rows.map(toDomain)
  },

  buscarPorId(id: number): Fornecedor | null {
    const row = getDb()
      .prepare('SELECT id, razao_social, cnpj, contato, telefone, email, prazo_entrega_dias, ativo FROM fornecedor WHERE id = :id')
      .get({ id }) as FornecedorRow | undefined
    return row ? toDomain(row) : null
  },

  criar(data: FornecedorInput): number {
    const info = getDb()
      .prepare(
        `INSERT INTO fornecedor (razao_social, cnpj, contato, telefone, email, prazo_entrega_dias)
         VALUES (:razaoSocial, :cnpj, :contato, :telefone, :email, :prazoEntregaDias)`
      )
      .run({
        razaoSocial: data.razaoSocial.trim(),
        cnpj: normalizar(data.cnpj),
        contato: normalizar(data.contato),
        telefone: normalizar(data.telefone),
        email: normalizar(data.email),
        prazoEntregaDias: data.prazoEntregaDias ?? null
      })
    return Number(info.lastInsertRowid)
  },

  atualizar(id: number, data: FornecedorInput): void {
    getDb()
      .prepare(
        `UPDATE fornecedor SET
           razao_social = :razaoSocial, cnpj = :cnpj, contato = :contato,
           telefone = :telefone, email = :email, prazo_entrega_dias = :prazoEntregaDias
         WHERE id = :id`
      )
      .run({
        id,
        razaoSocial: data.razaoSocial.trim(),
        cnpj: normalizar(data.cnpj),
        contato: normalizar(data.contato),
        telefone: normalizar(data.telefone),
        email: normalizar(data.email),
        prazoEntregaDias: data.prazoEntregaDias ?? null
      })
  },

  setAtivo(id: number, ativo: boolean): void {
    getDb().prepare('UPDATE fornecedor SET ativo = :ativo WHERE id = :id').run({ id, ativo: ativo ? 1 : 0 })
  }
}
