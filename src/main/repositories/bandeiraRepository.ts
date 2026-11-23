import { getDb } from '@main/db/connection'
import { maiusculo, maiusculoOuNulo, termoBusca } from '@shared/texto'
import type { BandeiraConfig, FaixaCredito } from '@shared/vendaCalculo'
import type { Bandeira } from '@shared/types'
import type { BandeiraInput, BandeirasListQuery } from '@shared/ipc'

interface BandeiraRow {
  id: number
  nome: string
  adquirente: string | null
  aceita_debito: number
  aceita_credito: number
  debito_taxa_bp: number | null
  debito_prazo_dias: number | null
  ativo: number
  vendas_vinculadas: number
}

interface FaixaRow {
  bandeira_id: number
  parcelas: number
  taxa_bp: number
  prazo_dias: number
  desconto_cliente_bp: number
}

const SELECT = `
  SELECT b.id, b.nome, b.adquirente, b.aceita_debito, b.aceita_credito, b.debito_taxa_bp, b.debito_prazo_dias, b.ativo,
         (SELECT COUNT(*) FROM venda_pagamento vp WHERE vp.bandeira_id = b.id) AS vendas_vinculadas
  FROM bandeira b
`

function faixasDe(ids: number[]): Map<number, FaixaCredito[]> {
  const porBandeira = new Map<number, FaixaCredito[]>()
  if (ids.length === 0) return porBandeira
  // Um parametro nomeado por id (o node:sqlite recusa parametro a mais ou a menos).
  const params: Record<string, number> = {}
  const marcadores = ids.map((id, i) => {
    params[`b${i}`] = id
    return `:b${i}`
  })
  const rows = getDb()
    .prepare(
      `SELECT bandeira_id, parcelas, taxa_bp, prazo_dias, desconto_cliente_bp
       FROM bandeira_faixa WHERE bandeira_id IN (${marcadores.join(', ')}) ORDER BY bandeira_id, parcelas`
    )
    .all(params) as unknown as FaixaRow[]
  for (const r of rows) {
    const lista = porBandeira.get(r.bandeira_id) ?? []
    lista.push({ parcelas: r.parcelas, taxaBp: r.taxa_bp, prazoDias: r.prazo_dias, descontoClienteBp: r.desconto_cliente_bp })
    porBandeira.set(r.bandeira_id, lista)
  }
  return porBandeira
}

function montar(rows: BandeiraRow[]): Bandeira[] {
  const faixas = faixasDe(rows.map((r) => r.id))
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    adquirente: r.adquirente,
    aceitaDebito: r.aceita_debito === 1,
    aceitaCredito: r.aceita_credito === 1,
    debitoTaxaBp: r.debito_taxa_bp,
    debitoPrazoDias: r.debito_prazo_dias,
    faixas: faixas.get(r.id) ?? [],
    ativo: r.ativo === 1,
    vendasVinculadas: r.vendas_vinculadas
  }))
}

export const bandeiraRepository = {
  listar(query: BandeirasListQuery): Bandeira[] {
    const rows = getDb()
      .prepare(
        `${SELECT}
         WHERE b.excluido_em IS NULL
           AND (:apenasAtivos = 0 OR b.ativo = 1)
           AND (sem_acento(b.nome) LIKE :termo OR sem_acento(b.adquirente) LIKE :termo)
         ORDER BY sem_acento(b.nome), sem_acento(b.adquirente)
         LIMIT 500`
      )
      .all({ termo: termoBusca(query.busca), apenasAtivos: query.apenasAtivos === false ? 0 : 1 }) as unknown as BandeiraRow[]
    return montar(rows)
  },

  buscarPorId(id: number): Bandeira | null {
    const row = getDb().prepare(`${SELECT} WHERE b.id = :id AND b.excluido_em IS NULL`).get({ id }) as unknown as BandeiraRow | undefined
    return row ? montar([row])[0] : null
  },

  /** A configuracao que o calculo da venda usa. Inativa e excluida nao servem para venda nova. */
  configParaVenda(id: number): BandeiraConfig | null {
    const b = bandeiraRepository.buscarPorId(id)
    if (!b || !b.ativo) return null
    return {
      id: b.id,
      nome: b.nome,
      aceitaDebito: b.aceitaDebito,
      aceitaCredito: b.aceitaCredito,
      debitoTaxaBp: b.debitoTaxaBp,
      debitoPrazoDias: b.debitoPrazoDias,
      faixas: b.faixas
    }
  },

  /** Outra bandeira (nao excluida) com este nome NA MESMA maquininha? */
  nomeEmUso(nome: string, adquirente: string | null | undefined, ignorarId = 0): boolean {
    const row = getDb()
      .prepare(
        `SELECT 1 FROM bandeira
         WHERE nome = :nome COLLATE NOCASE AND COALESCE(adquirente, '') = :adquirente COLLATE NOCASE
           AND excluido_em IS NULL AND id != :id`
      )
      .get({ nome: maiusculo(nome), adquirente: maiusculoOuNulo(adquirente) ?? '', id: ignorarId })
    return row !== undefined
  },

  /** Cria a bandeira e as faixas do credito de uma vez (uma transacao). */
  criar(d: BandeiraInput): number {
    const db = getDb()
    db.exec('BEGIN IMMEDIATE')
    try {
      const info = db
        .prepare(
          `INSERT INTO bandeira (nome, adquirente, aceita_debito, aceita_credito, debito_taxa_bp, debito_prazo_dias)
           VALUES (:nome, :adquirente, :aceitaDebito, :aceitaCredito, :debitoTaxaBp, :debitoPrazoDias)`
        )
        .run({
          nome: maiusculo(d.nome),
          adquirente: maiusculoOuNulo(d.adquirente),
          aceitaDebito: d.aceitaDebito ? 1 : 0,
          aceitaCredito: d.aceitaCredito ? 1 : 0,
          debitoTaxaBp: d.debitoTaxaBp,
          debitoPrazoDias: d.debitoPrazoDias
        })
      const id = Number(info.lastInsertRowid)
      gravarFaixas(id, d)
      db.exec('COMMIT')
      return id
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  },

  /**
   * Atualiza a bandeira e a tabela de faixas. Alterar taxa NUNCA mexe em venda antiga: cada venda
   * guarda o snapshot da taxa que usou (RG-02). As faixas sao atualizadas no lugar (nao apagadas e
   * recriadas) para a sincronizacao ver so o que mudou.
   */
  atualizar(id: number, d: BandeiraInput): void {
    const db = getDb()
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(
        `UPDATE bandeira SET nome = :nome, adquirente = :adquirente, aceita_debito = :aceitaDebito, aceita_credito = :aceitaCredito,
           debito_taxa_bp = :debitoTaxaBp, debito_prazo_dias = :debitoPrazoDias
         WHERE id = :id AND excluido_em IS NULL`
      ).run({
        id,
        nome: maiusculo(d.nome),
        adquirente: maiusculoOuNulo(d.adquirente),
        aceitaDebito: d.aceitaDebito ? 1 : 0,
        aceitaCredito: d.aceitaCredito ? 1 : 0,
        debitoTaxaBp: d.debitoTaxaBp,
        debitoPrazoDias: d.debitoPrazoDias
      })
      gravarFaixas(id, d)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  },

  setAtivo(id: number, ativo: boolean): void {
    getDb().prepare('UPDATE bandeira SET ativo = :ativo WHERE id = :id').run({ id, ativo: ativo ? 1 : 0 })
  },

  excluir(id: number, motivo: string | null): void {
    getDb()
      .prepare("UPDATE bandeira SET excluido_em = datetime('now'), excluido_motivo = :motivo WHERE id = :id AND excluido_em IS NULL")
      .run({ id, motivo })
  }
}

/** Faixas do formulario: atualiza as que ja existem, cria as novas e remove as que sairam da tabela. */
function gravarFaixas(bandeiraId: number, d: BandeiraInput): void {
  const db = getDb()
  const existentes = db.prepare('SELECT parcelas FROM bandeira_faixa WHERE bandeira_id = :bandeiraId').all({ bandeiraId }) as unknown as { parcelas: number }[]
  const novas = new Set(d.faixas.map((f) => f.parcelas))
  for (const e of existentes) {
    if (!novas.has(e.parcelas)) {
      db.prepare('DELETE FROM bandeira_faixa WHERE bandeira_id = :bandeiraId AND parcelas = :parcelas').run({ bandeiraId, parcelas: e.parcelas })
    }
  }
  const jaExistem = new Set(existentes.map((e) => e.parcelas))
  for (const f of d.faixas) {
    const params = { bandeiraId, parcelas: f.parcelas, taxaBp: f.taxaBp, prazoDias: f.prazoDias, descontoClienteBp: f.descontoClienteBp }
    if (jaExistem.has(f.parcelas)) {
      db.prepare(
        `UPDATE bandeira_faixa SET taxa_bp = :taxaBp, prazo_dias = :prazoDias, desconto_cliente_bp = :descontoClienteBp
         WHERE bandeira_id = :bandeiraId AND parcelas = :parcelas`
      ).run(params)
    } else {
      db.prepare(
        `INSERT INTO bandeira_faixa (bandeira_id, parcelas, taxa_bp, prazo_dias, desconto_cliente_bp)
         VALUES (:bandeiraId, :parcelas, :taxaBp, :prazoDias, :descontoClienteBp)`
      ).run(params)
    }
  }
}
