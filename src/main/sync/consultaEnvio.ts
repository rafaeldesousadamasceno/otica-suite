import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import { colunaUuid, type ColunaSqlite, type FkSqlite, type InfoTabela } from './gerarEspelhoSupabase'
import type { TabelaSync } from './tabelasSincronizaveis'

/** Maior uuid possível na ordenação do SQLite: posição "depois de todas as linhas de uma revisão". */
export const UUID_MAXIMO = '\uffff'

/** Posição já enviada: o próximo lote começa estritamente depois de (rev, uuid). */
export interface PosicaoLote {
  rev: number
  uuid: string
}

const q = (nome: string): string => `"${nome}"`

/** Colunas e chaves estrangeiras de uma tabela do banco local. */
export function lerInfoTabela(db: DatabaseSync, tabela: string): InfoTabela {
  return {
    colunas: db.prepare(`PRAGMA table_info(${q(tabela)})`).all() as unknown as ColunaSqlite[],
    fks: db.prepare(`PRAGMA foreign_key_list(${q(tabela)})`).all() as unknown as FkSqlite[]
  }
}

/**
 * SQL que lê as linhas de uma tabela já no formato da nuvem: sem `id`, sem colunas locais e com cada
 * chave estrangeira trocada pelo uuid do pai (nulo quando a FK é nula ou órfã). Pagina por (sync_rev, uuid)
 * porque várias linhas dividem a mesma revisão (ex.: tudo o que existia antes da migração 010 tem rev 1).
 * Parâmetros: :rev, :uuid (posição já enviada), :ate (teto de revisão) e :limite.
 */
export function montarConsultaEnvio(t: TabelaSync, info: InfoTabela): string {
  const locais = new Set(t.colunasLocais ?? [])
  const fkPorColuna = new Map(info.fks.map((f) => [f.from, f.table]))
  const selecionar: string[] = []
  for (const c of info.colunas) {
    if (c.name === 'id' || locais.has(c.name)) continue
    const pai = fkPorColuna.get(c.name)
    if (pai) {
      selecionar.push(`(SELECT r.uuid FROM ${q(pai)} r WHERE r.id = t.${q(c.name)}) AS ${q(colunaUuid(c.name))}`)
    } else {
      selecionar.push(`t.${q(c.name)}`)
    }
  }
  const filtro = t.filtroLocal ? ` AND NOT (${t.filtroLocal})` : ''
  return (
    `SELECT ${selecionar.join(', ')} FROM ${q(t.nome)} t ` +
    `WHERE (t.sync_rev, t.uuid) > (:rev, :uuid) AND t.sync_rev <= :ate${filtro} ` +
    `ORDER BY t.sync_rev, t.uuid LIMIT :limite`
  )
}

export function lerLote(
  db: DatabaseSync,
  sql: string,
  depois: PosicaoLote,
  ate: number,
  limite: number
): Record<string, unknown>[] {
  const params: Record<string, SQLInputValue> = { rev: depois.rev, uuid: depois.uuid, ate, limite }
  return db.prepare(sql).all(params) as Record<string, unknown>[]
}
