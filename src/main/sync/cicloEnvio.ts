import type { DatabaseSync } from 'node:sqlite'
import type { ClienteNuvem } from './clienteNuvem'
import { lerInfoTabela, lerLote, montarConsultaEnvio, UUID_MAXIMO, type PosicaoLote } from './consultaEnvio'
import type { EstadoNuvem } from './estadoNuvem'
import { TABELAS_SINCRONIZAVEIS } from './tabelasSincronizaveis'

export interface DepsCiclo {
  db: DatabaseSync
  cliente: ClienteNuvem
  lerEstado(): EstadoNuvem
  gravarEstado(e: EstadoNuvem): void
  fingerprint: string
  agora(): Date
  /** A nuvem continua ligada? Conferido antes de cada chamada à nuvem; false para o ciclo na hora. */
  continuar(): boolean
  tamanhoLote?: number
}

export interface ResultadoCiclo {
  enviados: number
  excluidos: number
  varredura: boolean
  cursor: number
  /** Desligada no meio: nada local foi gravado (cursor e sync_exclusao como estavam). */
  interrompido: boolean
}

const TAMANHO_LOTE_PADRAO = 500

/**
 * Um ciclo de envio: manda o que mudou depois do cursor (ou tudo, na varredura), as exclusões e,
 * só então, grava o novo cursor e limpa sync_exclusao. Qualquer erro sobe sem tocar em nada local.
 * Se a nuvem for desligada no meio (`continuar()` false), para antes da próxima chamada, também sem
 * tocar em nada local.
 */
export async function executarCiclo(d: DepsCiclo): Promise<ResultadoCiclo> {
  const tamanho = d.tamanhoLote ?? TAMANHO_LOTE_PADRAO
  const n = (d.db.prepare('SELECT valor FROM sync_contador WHERE id = 1').get() as { valor: number }).valor
  const estado = d.lerEstado()
  const varredura = estado.cursor === 0 || estado.cursor > n
  const cursor = varredura ? 0 : estado.cursor
  const recebidoEm = d.agora().toISOString()
  // Backup restaurado: lembra no estado (cursor 0) para o próximo ciclo varrer mesmo que o contador volte a passar do cursor antigo.
  if (estado.cursor > n) d.gravarEstado({ fingerprint: d.fingerprint, cursor: 0 })
  let enviados = 0
  let excluidos = 0
  const interrompido = (): ResultadoCiclo => ({ enviados, excluidos, varredura, cursor: d.lerEstado().cursor, interrompido: true })

  for (const t of TABELAS_SINCRONIZAVEIS) {
    const sql = montarConsultaEnvio(t, lerInfoTabela(d.db, t.nome))
    let posicao: PosicaoLote = varredura ? { rev: 0, uuid: '' } : { rev: cursor, uuid: UUID_MAXIMO }
    for (;;) {
      const linhas = lerLote(d.db, sql, posicao, n, tamanho)
      if (linhas.length > 0) {
        if (!d.continuar()) return interrompido()
        await d.cliente.upsert(t.nome, linhas, recebidoEm)
        enviados += linhas.length
        const ultima = linhas[linhas.length - 1]
        posicao = { rev: Number(ultima.sync_rev), uuid: String(ultima.uuid) }
      }
      if (linhas.length < tamanho) break
    }
  }

  if (!varredura) {
    const nomes = new Set(TABELAS_SINCRONIZAVEIS.map((t) => t.nome))
    const rows = d.db
      .prepare('SELECT tabela, uuid FROM sync_exclusao WHERE sync_rev > ? AND sync_rev <= ? ORDER BY id')
      .all(cursor, n) as { tabela: string; uuid: string }[]
    const porTabela = new Map<string, string[]>()
    for (const r of rows) {
      if (!nomes.has(r.tabela)) continue
      const l = porTabela.get(r.tabela) ?? []
      l.push(r.uuid)
      porTabela.set(r.tabela, l)
    }
    for (const [tabela, uuids] of porTabela) {
      if (!d.continuar()) return interrompido()
      await d.cliente.apagar(tabela, uuids)
      excluidos += uuids.length
    }
  } else {
    if (!d.continuar()) return interrompido()
    await d.cliente.varrer(
      TABELAS_SINCRONIZAVEIS.map((t) => t.nome),
      recebidoEm
    )
  }

  d.gravarEstado({ fingerprint: d.fingerprint, cursor: n })
  d.db.prepare('DELETE FROM sync_exclusao WHERE sync_rev <= ?').run(n)
  return { enviados, excluidos, varredura, cursor: n, interrompido: false }
}
