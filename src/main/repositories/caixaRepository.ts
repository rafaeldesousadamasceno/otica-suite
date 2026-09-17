import { getDb } from '@main/db/connection'
import type { CaixaResumo } from '@shared/types'

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

interface CaixaAbertoRow {
  id: number
  data_abertura: string
  saldo_inicial_centavos: number
  usuario_abertura_nome: string
}

export interface CaixaAbertoRepo {
  id: number
  dataAbertura: string
  saldoInicialCentavos: number
  usuarioAberturaNome: string
}

interface CaixaHistoricoRow {
  id: number
  data_abertura: string
  data_fechamento: string | null
  saldo_inicial_centavos: number
  saldo_final_centavos: number | null
  usuario_abertura_nome: string
  usuario_fechamento_nome: string | null
}

/**
 * RF-11.3: caixa - abertura/fechamento de sessao, sangria/suprimento.
 *
 * Simplificacao aceita (documentada em shared/types.ts junto de
 * `CaixaAberto`): `lancamento.data` so guarda a data (sem hora) e nao
 * existe `caixa_id` em `lancamento`, entao o "saldo esperado" soma TODO
 * lancamento do dia civil da abertura - se dois caixas abrirem no mesmo
 * dia, o esperado de cada um inclui o movimento do dia inteiro. Aceito
 * para o v1; nao tentar reconstruir precisao de horario aqui.
 */
export const caixaRepository = {
  buscarAberto(): CaixaAbertoRepo | null {
    const row = getDb()
      .prepare(
        `SELECT c.id, c.data_abertura, c.saldo_inicial_centavos, u.nome AS usuario_abertura_nome
         FROM caixa c
         INNER JOIN usuario u ON u.id = c.usuario_abertura_id
         WHERE c.data_fechamento IS NULL
         ORDER BY c.id DESC
         LIMIT 1`
      )
      .get() as CaixaAbertoRow | undefined

    if (!row) return null
    return {
      id: row.id,
      dataAbertura: row.data_abertura,
      saldoInicialCentavos: row.saldo_inicial_centavos,
      usuarioAberturaNome: row.usuario_abertura_nome
    }
  },

  /**
   * `dataAberturaCompleta` chega como 'YYYY-MM-DD HH:MM:SS' (formato do
   * `datetime('now')` do SQLite) - usa `date()` do proprio SQLite pra
   * extrair so a parte da data, em vez de fatiar string em JS, pra ficar
   * robusto a qualquer variacao de formato que o SQLite produza.
   */
  calcularSaldoEsperado(dataAberturaCompleta: string, saldoInicialCentavos: number): number {
    const somas = getDb()
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN tipo = 'RECEITA' THEN valor_centavos ELSE 0 END), 0) AS receitas,
           COALESCE(SUM(CASE WHEN tipo = 'DESPESA' THEN valor_centavos ELSE 0 END), 0) AS despesas
         FROM lancamento
         WHERE data = date(:dataAbertura)`
      )
      .get({ dataAbertura: dataAberturaCompleta }) as { receitas: number; despesas: number }

    return saldoInicialCentavos + somas.receitas - somas.despesas
  },

  abrir(saldoInicialCentavos: number, usuarioId: number): number {
    const info = getDb()
      .prepare(
        `INSERT INTO caixa (data_abertura, saldo_inicial_centavos, usuario_abertura_id)
         VALUES (datetime('now'), :saldo, :usuarioId)`
      )
      .run({ saldo: saldoInicialCentavos, usuarioId })
    return Number(info.lastInsertRowid)
  },

  fechar(id: number, saldoContadoCentavos: number, usuarioId: number): void {
    getDb()
      .prepare(
        `UPDATE caixa
         SET data_fechamento = datetime('now'), saldo_final_centavos = :saldo, usuario_fechamento_id = :usuarioId
         WHERE id = :id`
      )
      .run({ id, saldo: saldoContadoCentavos, usuarioId })
  },

  listarHistorico(): CaixaResumo[] {
    const rows = getDb()
      .prepare(
        `SELECT c.id, c.data_abertura, c.data_fechamento, c.saldo_inicial_centavos, c.saldo_final_centavos,
                ua.nome AS usuario_abertura_nome, uf.nome AS usuario_fechamento_nome
         FROM caixa c
         INNER JOIN usuario ua ON ua.id = c.usuario_abertura_id
         LEFT JOIN usuario uf ON uf.id = c.usuario_fechamento_id
         ORDER BY c.id DESC
         LIMIT 200`
      )
      .all() as unknown as CaixaHistoricoRow[]

    return rows.map((row) => ({
      id: row.id,
      dataAbertura: row.data_abertura,
      dataFechamento: row.data_fechamento,
      saldoInicialCentavos: row.saldo_inicial_centavos,
      saldoFinalCentavos: row.saldo_final_centavos,
      saldoEsperadoCentavos: caixaRepository.calcularSaldoEsperado(row.data_abertura, row.saldo_inicial_centavos),
      usuarioAberturaNome: row.usuario_abertura_nome,
      usuarioFechamentoNome: row.usuario_fechamento_nome
    }))
  },

  /** Sangria/suprimento sao lancamentos comuns - sem vinculo formal com `caixa.id` (schema atual nao tem essa FK). */
  registrarMovimento(
    tipo: 'RECEITA' | 'DESPESA',
    categoria: 'SUPRIMENTO' | 'SANGRIA',
    valorCentavos: number,
    descricao: string,
    usuarioId: number
  ): void {
    getDb()
      .prepare(
        `INSERT INTO lancamento (tipo, categoria, descricao, valor_centavos, data, usuario_id)
         VALUES (:tipo, :categoria, :descricao, :valor, :data, :usuarioId)`
      )
      .run({ tipo, categoria, descricao, valor: valorCentavos, data: hoje(), usuarioId })
  }
}
