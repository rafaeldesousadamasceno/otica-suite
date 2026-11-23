import { getDb } from '@main/db/connection'
import type { ListaValorItem, TipoListaValor } from '@shared/types'

interface Row {
  id: number
  tipo: string
  valor: string
  descricao: string | null
  ordem: number
  ativo: number
}

function toDomain(row: Row): ListaValorItem {
  return { id: row.id, tipo: row.tipo, valor: row.valor, descricao: row.descricao, ordem: row.ordem, ativo: row.ativo === 1 }
}

export const listaValorRepository = {
  listarPorTipo(tipo: TipoListaValor, apenasAtivos = true): ListaValorItem[] {
    const sql = apenasAtivos
      ? 'SELECT * FROM lista_valor WHERE tipo = :tipo AND ativo = 1 ORDER BY ordem, valor'
      : 'SELECT * FROM lista_valor WHERE tipo = :tipo ORDER BY ordem, valor'
    const rows = getDb().prepare(sql).all({ tipo }) as unknown as Row[]
    return rows.map(toDomain)
  },

  buscarPorId(id: number): ListaValorItem | null {
    const row = getDb().prepare('SELECT * FROM lista_valor WHERE id = :id').get({ id }) as unknown as Row | undefined
    return row ? toDomain(row) : null
  },

  /** Sem diferenca de maiuscula: "cx" acha "CX" (a lista nao aceita o mesmo valor duas vezes). */
  buscarPorValor(tipo: TipoListaValor, valor: string): ListaValorItem | null {
    const row = getDb()
      .prepare('SELECT * FROM lista_valor WHERE tipo = :tipo AND valor = :valor COLLATE NOCASE')
      .get({ tipo, valor }) as unknown as Row | undefined
    return row ? toDomain(row) : null
  },

  /** Entra no fim da lista. */
  criar(tipo: TipoListaValor, valor: string, descricao: string | null): number {
    const info = getDb()
      .prepare(
        `INSERT INTO lista_valor (tipo, valor, descricao, ordem)
         VALUES (:tipo, :valor, :descricao,
                 (SELECT COALESCE(MAX(ordem), 0) + 1 FROM lista_valor WHERE tipo = :tipo))`
      )
      .run({ tipo, valor, descricao })
    return Number(info.lastInsertRowid)
  },

  atualizarDescricao(id: number, descricao: string | null): void {
    getDb().prepare('UPDATE lista_valor SET descricao = :descricao WHERE id = :id').run({ id, descricao })
  },

  setAtivo(id: number, ativo: boolean): void {
    getDb().prepare('UPDATE lista_valor SET ativo = :ativo WHERE id = :id').run({ id, ativo: ativo ? 1 : 0 })
  }
}
