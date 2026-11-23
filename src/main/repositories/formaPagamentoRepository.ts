import { getDb } from '@main/db/connection'
import { maiusculo, termoBusca } from '@shared/texto'
import { comportamentoDoTipo, type FormaPagamentoConfig, type TipoAcrescimo, type TipoFormaPagamento } from '@shared/vendaCalculo'
import type { FormaPagamento } from '@shared/types'
import type { FormaPagamentoInput, FormasPagamentoListQuery } from '@shared/ipc'

interface FormaRow {
  id: number
  nome: string
  tipo: TipoFormaPagamento
  ordem: number
  ativo: number
  max_parcelas: number | null
  intervalo_dias: number
  acrescimo_tipo: TipoAcrescimo | null
  acrescimo_valor: number
  vendas_vinculadas: number
}

function toDomain(r: FormaRow): FormaPagamento {
  return {
    id: r.id,
    nome: r.nome,
    tipo: r.tipo,
    comportamento: comportamentoDoTipo(r.tipo),
    ordem: r.ordem,
    ativo: r.ativo === 1,
    maxParcelas: r.max_parcelas,
    intervaloDias: r.intervalo_dias,
    acrescimoTipo: r.acrescimo_tipo,
    acrescimoValor: r.acrescimo_valor,
    vendasVinculadas: r.vendas_vinculadas
  }
}

const SELECT = `
  SELECT f.id, f.nome, f.tipo, f.ordem, f.ativo, f.max_parcelas, f.intervalo_dias, f.acrescimo_tipo, f.acrescimo_valor,
         (SELECT COUNT(*) FROM venda_pagamento vp WHERE vp.forma_pagamento_id = f.id) AS vendas_vinculadas
  FROM forma_pagamento f
`

function parametros(d: FormaPagamentoInput): Record<string, string | number | null> {
  return {
    nome: maiusculo(d.nome),
    tipo: d.tipo,
    ordem: d.ordem,
    maxParcelas: d.maxParcelas,
    intervaloDias: d.intervaloDias,
    acrescimoTipo: d.acrescimoTipo,
    acrescimoValor: d.acrescimoValor
  }
}

export const formaPagamentoRepository = {
  /** Exclusao logica: a excluida nunca aparece. `apenasAtivos` (padrao) e o que a venda oferece. */
  listar(query: FormasPagamentoListQuery): FormaPagamento[] {
    const rows = getDb()
      .prepare(
        `${SELECT}
         WHERE f.excluido_em IS NULL
           AND (:apenasAtivos = 0 OR f.ativo = 1)
           AND sem_acento(f.nome) LIKE :termo
         ORDER BY f.ordem, sem_acento(f.nome)
         LIMIT 500`
      )
      .all({ termo: termoBusca(query.busca), apenasAtivos: query.apenasAtivos === false ? 0 : 1 }) as unknown as FormaRow[]
    return rows.map(toDomain)
  },

  buscarPorId(id: number): FormaPagamento | null {
    const row = getDb().prepare(`${SELECT} WHERE f.id = :id AND f.excluido_em IS NULL`).get({ id }) as unknown as FormaRow | undefined
    return row ? toDomain(row) : null
  },

  /** A configuracao que o calculo da venda usa. Inativa e excluida nao servem para venda nova. */
  configParaVenda(id: number): FormaPagamentoConfig | null {
    const f = formaPagamentoRepository.buscarPorId(id)
    if (!f || !f.ativo) return null
    return {
      id: f.id,
      nome: f.nome,
      tipo: f.tipo,
      maxParcelas: f.maxParcelas,
      intervaloDias: f.intervaloDias,
      acrescimoTipo: f.acrescimoTipo,
      acrescimoValor: f.acrescimoValor
    }
  },

  /** Outra forma (nao excluida) com este nome? So ignora maiuscula de letras sem acento (limite do SQLite). */
  nomeEmUso(nome: string, ignorarId = 0): boolean {
    const row = getDb()
      .prepare('SELECT 1 FROM forma_pagamento WHERE nome = :nome COLLATE NOCASE AND excluido_em IS NULL AND id != :id')
      .get({ nome: maiusculo(nome), id: ignorarId })
    return row !== undefined
  },

  criar(d: FormaPagamentoInput): number {
    const info = getDb()
      .prepare(
        `INSERT INTO forma_pagamento (nome, tipo, ordem, max_parcelas, intervalo_dias, acrescimo_tipo, acrescimo_valor)
         VALUES (:nome, :tipo, :ordem, :maxParcelas, :intervaloDias, :acrescimoTipo, :acrescimoValor)`
      )
      .run(parametros(d))
    return Number(info.lastInsertRowid)
  },

  atualizar(id: number, d: FormaPagamentoInput): void {
    getDb()
      .prepare(
        `UPDATE forma_pagamento SET nome = :nome, tipo = :tipo, ordem = :ordem, max_parcelas = :maxParcelas,
           intervalo_dias = :intervaloDias, acrescimo_tipo = :acrescimoTipo, acrescimo_valor = :acrescimoValor
         WHERE id = :id AND excluido_em IS NULL`
      )
      .run({ id, ...parametros(d) })
  },

  setAtivo(id: number, ativo: boolean): void {
    getDb().prepare('UPDATE forma_pagamento SET ativo = :ativo WHERE id = :id').run({ id, ativo: ativo ? 1 : 0 })
  },

  excluir(id: number, motivo: string | null): void {
    getDb()
      .prepare("UPDATE forma_pagamento SET excluido_em = datetime('now'), excluido_motivo = :motivo WHERE id = :id AND excluido_em IS NULL")
      .run({ id, motivo })
  }
}
