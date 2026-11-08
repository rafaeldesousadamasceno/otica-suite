import { getDb } from '@main/db/connection'
import type {
  Pendencia,
  PendenciaDados,
  PendenciaPrevista,
  StatusPendencia,
  TipoPendencia
} from '@shared/importacao'

interface PendenciaRow {
  id: number
  tipo: TipoPendencia
  gravidade: Pendencia['gravidade']
  origem_tabela: string
  origem_id: number
  destino_tabela: string | null
  destino_id: number | null
  motivo: string
  sugestao: string | null
  dados_json: string | null
  status: StatusPendencia
  criado_em: string
  resolvido_em: string | null
}

function paraDominio(r: PendenciaRow): Pendencia {
  return {
    id: r.id,
    tipo: r.tipo,
    gravidade: r.gravidade,
    origemTabela: r.origem_tabela,
    origemId: r.origem_id,
    destinoTabela: r.destino_tabela,
    destinoId: r.destino_id,
    motivo: r.motivo,
    sugestao: r.sugestao,
    dados: r.dados_json ? (JSON.parse(r.dados_json) as PendenciaDados) : null,
    status: r.status,
    criadoEm: r.criado_em,
    resolvidoEm: r.resolvido_em
  }
}

export interface FiltroPendencias {
  status?: StatusPendencia
  tipo?: TipoPendencia
}

export const migracaoPendenciaRepository = {
  /**
   * Grava a pendencia ou, se ja existe uma igual (mesmo tipo e mesma origem),
   * so atualiza o texto e os dados: reimportar nunca duplica nem reabre uma
   * pendencia que o administrador ja resolveu ou ignorou.
   */
  registrar(p: PendenciaPrevista, destino?: { tabela: string; id: number }): void {
    getDb()
      .prepare(
        `INSERT INTO migracao_pendencia
           (tipo, gravidade, origem_tabela, origem_id, destino_tabela, destino_id, motivo, sugestao, dados_json)
         VALUES (:tipo, :gravidade, :origemTabela, :origemId, :destinoTabela, :destinoId, :motivo, :sugestao, :dados)
         ON CONFLICT (tipo, origem_tabela, origem_id) DO UPDATE SET
           gravidade = excluded.gravidade,
           destino_tabela = COALESCE(excluded.destino_tabela, destino_tabela),
           destino_id = COALESCE(excluded.destino_id, destino_id),
           motivo = excluded.motivo,
           sugestao = excluded.sugestao,
           dados_json = excluded.dados_json`
      )
      .run({
        tipo: p.tipo,
        gravidade: p.gravidade,
        origemTabela: p.origemTabela,
        origemId: p.origemId,
        destinoTabela: destino?.tabela ?? null,
        destinoId: destino?.id ?? null,
        motivo: p.motivo,
        sugestao: p.sugestao,
        dados: p.dados ? JSON.stringify(p.dados) : null
      })
  },

  /**
   * O registro de origem acabou entrando: o que estava aberto sobre ele
   * (falhas) deixa de valer. Nao mexe em avisos informativos nem em ignoradas.
   */
  resolverAutomaticamente(origemTabela: string, origemId: number, tipos: TipoPendencia[]): void {
    const lista = tipos.map((t) => `'${t}'`).join(', ') // tipos vem da nossa constante, nunca do usuario
    getDb()
      .prepare(
        `UPDATE migracao_pendencia SET status = 'RESOLVIDA', resolvido_em = datetime('now')
         WHERE origem_tabela = :origemTabela AND origem_id = :origemId AND status = 'ABERTA' AND tipo IN (${lista})`
      )
      .run({ origemTabela, origemId })
  },

  listar(filtro: FiltroPendencias = {}): Pendencia[] {
    const rows = getDb()
      .prepare(
        `SELECT * FROM migracao_pendencia
         WHERE (:status IS NULL OR status = :status) AND (:tipo IS NULL OR tipo = :tipo)
         ORDER BY CASE gravidade WHEN 'erro' THEN 0 WHEN 'atencao' THEN 1 ELSE 2 END, tipo, origem_id
         LIMIT 1000`
      )
      .all({ status: filtro.status ?? null, tipo: filtro.tipo ?? null }) as unknown as PendenciaRow[]
    return rows.map(paraDominio)
  },

  buscarPorId(id: number): Pendencia | null {
    const row = getDb().prepare('SELECT * FROM migracao_pendencia WHERE id = :id').get({ id }) as PendenciaRow | undefined
    return row ? paraDominio(row) : null
  },

  contarAbertasPorTipo(): Partial<Record<TipoPendencia, number>> {
    const rows = getDb()
      .prepare(`SELECT tipo, COUNT(*) AS n FROM migracao_pendencia WHERE status = 'ABERTA' GROUP BY tipo`)
      .all() as unknown as { tipo: TipoPendencia; n: number }[]
    return Object.fromEntries(rows.map((r) => [r.tipo, r.n]))
  },

  contarPorTipo(status: StatusPendencia): Partial<Record<TipoPendencia, number>> {
    const rows = getDb()
      .prepare('SELECT tipo, COUNT(*) AS n FROM migracao_pendencia WHERE status = :status GROUP BY tipo')
      .all({ status }) as unknown as { tipo: TipoPendencia; n: number }[]
    return Object.fromEntries(rows.map((r) => [r.tipo, r.n]))
  },

  /** Volta uma pendencia ignorada ou resolvida para aberta, limpando quem e quando a tratou. */
  reabrir(id: number): void {
    getDb()
      .prepare("UPDATE migracao_pendencia SET status = 'ABERTA', resolvido_em = NULL, resolvido_por = NULL WHERE id = :id")
      .run({ id })
  },

  definirStatus(id: number, status: StatusPendencia, usuarioId: number): void {
    getDb()
      .prepare(
        `UPDATE migracao_pendencia
         SET status = :status, resolvido_em = datetime('now'), resolvido_por = :usuarioId
         WHERE id = :id`
      )
      .run({ id, status, usuarioId })
  }
}
