import type { DatabaseSync } from 'node:sqlite'
import { getDb } from '@main/db/connection'
import type { ComissaoResumo } from '@shared/types'

interface ComissaoRow {
  percentual: number
  valor_centavos: number
  situacao: 'PROVISIONADA' | 'LIBERADA' | 'CANCELADA'
}

function toComissao(row: ComissaoRow): ComissaoResumo {
  return { percentual: row.percentual, valorCentavos: row.valor_centavos, situacao: row.situacao }
}

export const comissaoRepository = {
  buscarPorVenda(vendaId: number): ComissaoResumo | null {
    const row = getDb()
      .prepare('SELECT percentual, valor_centavos, situacao FROM comissao WHERE venda_id = :vendaId')
      .get({ vendaId }) as ComissaoRow | undefined
    return row ? toComissao(row) : null
  },

  /**
   * RN-08: a comissao e provisionada na venda e liberada quando ela fica
   * quitada - a vista, isso ja acontece na criacao (venda sem nenhuma
   * conta_receber em aberto); parcelada, so quando a ultima parcela e
   * baixada. Chame sempre dentro da transacao de quem baixou a parcela
   * (ou criou a venda), nunca isolado.
   */
  liberarSeQuitada(db: DatabaseSync, vendaId: number): void {
    const pendente = db
      .prepare("SELECT COUNT(*) AS n FROM conta_receber WHERE venda_id = :vendaId AND situacao = 'ABERTA'")
      .get({ vendaId }) as { n: number }
    if (pendente.n > 0) return

    db.prepare("UPDATE comissao SET situacao = 'LIBERADA' WHERE venda_id = :vendaId AND situacao = 'PROVISIONADA'").run({
      vendaId
    })
  },

  /** RN-11: cancelar a venda cancela a comissao, provisionada ou ja liberada. */
  cancelar(db: DatabaseSync, vendaId: number): void {
    db.prepare("UPDATE comissao SET situacao = 'CANCELADA' WHERE venda_id = :vendaId").run({ vendaId })
  }
}
