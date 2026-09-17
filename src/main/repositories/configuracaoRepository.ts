import { getDb } from '@main/db/connection'

/**
 * Leitura das opcoes operacionais (RF-01: limite de desconto, comissao
 * padrao, prefixo da OS etc.), seedadas em 001_seed.sql. Sem cache aqui
 * de proposito - e uma tabela minuscula, e sempre refletir o valor atual
 * evita bug de "mudei a configuracao e nada aconteceu".
 */
export const configuracaoRepository = {
  obter(chave: string): string | null {
    const row = getDb().prepare('SELECT valor FROM configuracao WHERE chave = :chave').get({ chave }) as
      | { valor: string }
      | undefined
    return row?.valor ?? null
  },

  obterNumero(chave: string, padrao: number): number {
    const valor = this.obter(chave)
    if (valor === null) return padrao
    const n = Number(valor)
    return Number.isFinite(n) ? n : padrao
  },

  definir(chave: string, valor: string): void {
    getDb()
      .prepare(
        `INSERT INTO configuracao (chave, valor) VALUES (:chave, :valor)
         ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`
      )
      .run({ chave, valor })
  }
}
