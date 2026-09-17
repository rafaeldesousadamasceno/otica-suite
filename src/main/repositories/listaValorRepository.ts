import { getDb } from '@main/db/connection'
import type { ListaValorItem, TipoListaValor } from '@shared/types'

interface Row {
  id: number
  tipo: string
  valor: string
  ordem: number
  ativo: number
}

function toDomain(row: Row): ListaValorItem {
  return { id: row.id, tipo: row.tipo, valor: row.valor, ordem: row.ordem, ativo: row.ativo === 1 }
}

export const listaValorRepository = {
  listarPorTipo(tipo: TipoListaValor, apenasAtivos = true): ListaValorItem[] {
    const sql = apenasAtivos
      ? 'SELECT * FROM lista_valor WHERE tipo = :tipo AND ativo = 1 ORDER BY ordem, valor'
      : 'SELECT * FROM lista_valor WHERE tipo = :tipo ORDER BY ordem, valor'
    const rows = getDb().prepare(sql).all({ tipo }) as unknown as Row[]
    return rows.map(toDomain)
  }
}
