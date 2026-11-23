/**
 * Dioptrias (esferico, cilindrico, adicao, grau da lente): arredondamento,
 * limites e texto. Funcao pura, usada pelo campo da tela (`DioptriaInput`) e
 * pelas validacoes.
 *
 * O banco continua guardando o numero decimal (-1.25); toda a conta aqui e
 * feita em CENTESIMOS (inteiros: -125), para nao acumular erro de ponto
 * flutuante ao somar e subtrair passos de 0,25.
 */

/** Como o usuario ve e digita os graus: `decimal` = +1,25 / `inteiro` = +125 (os mesmos centesimos, sem a virgula). */
export type FormatoNumero = 'decimal' | 'inteiro'

export const FORMATO_NUMERO_PADRAO: FormatoNumero = 'decimal'

export const PASSO_DIOPTRIA = 0.25

/** -1.25 -> -125. */
export function paraCentesimos(valor: number): number {
  // Pelo modulo (Math.round(-112.5) daria -112) e com folga para 1,005 x 100 = 100,49999...
  return Math.sign(valor) * Math.round(Math.abs(valor) * 100 * (1 + 1e-12)) + 0
}

/** -125 -> -1.25. */
export function deCentesimos(centesimos: number): number {
  return centesimos / 100 + 0
}

export interface LimitesDioptria {
  min?: number
  max?: number
  step?: number
}

/**
 * Leva o valor ao multiplo do passo mais proximo (empate vai para longe do
 * zero: 1,125 -> 1,25 e -1,125 -> -1,25) e depois aplica minimo e maximo.
 * Devolve o numero decimal (-1.25).
 */
export function normalizarDioptria(valor: number, { min, max, step = PASSO_DIOPTRIA }: LimitesDioptria = {}): number {
  const passo = Math.max(1, paraCentesimos(step))
  const c = paraCentesimos(valor)
  const arredondado = Math.sign(c) * Math.round(Math.abs(c) / passo) * passo
  let limitado = arredondado
  if (max !== undefined) limitado = Math.min(limitado, paraCentesimos(max))
  if (min !== undefined) limitado = Math.max(limitado, paraCentesimos(min))
  return deCentesimos(limitado)
}

/** Um passo para cima (`+1`) ou para baixo (`-1`) a partir do valor atual; sem valor, parte do zero. */
export function passoDioptria(valor: number | null, direcao: 1 | -1, limites: LimitesDioptria = {}): number {
  const passo = limites.step ?? PASSO_DIOPTRIA
  const base = valor === null ? 0 : normalizarDioptria(valor, { step: passo })
  return normalizarDioptria(base + direcao * passo, limites)
}

interface OpcoesFormato {
  /** Com sinal (+1,25 / -0,50). O zero nunca leva sinal. Padrao: true. */
  signed?: boolean
  formato?: FormatoNumero
}

/** +1,25 / -0,50 / 0,00 no formato decimal; +125 / -50 / 0 no inteiro. Sem valor, vazio. */
export function formatarDioptria(valor: number | null, { signed = true, formato = FORMATO_NUMERO_PADRAO }: OpcoesFormato = {}): string {
  if (valor === null || !Number.isFinite(valor)) return ''
  const c = paraCentesimos(valor)
  const sinal = c < 0 ? '-' : signed && c > 0 ? '+' : ''
  const modulo = Math.abs(c)
  if (formato === 'inteiro') return `${sinal}${modulo}`
  return `${sinal}${(modulo / 100).toFixed(2).replace('.', ',')}`
}

/**
 * Texto digitado -> numero decimal; vazio ou invalido -> null.
 * No formato inteiro "125" vale 1,25 e "-50" vale -0,50. Quem digita virgula ou
 * ponto esta escrevendo o valor em dioptrias ("1,25"), e isso vale nos dois formatos.
 */
export function interpretarDioptria(texto: string, formato: FormatoNumero = FORMATO_NUMERO_PADRAO): number | null {
  const limpo = texto.trim().replace(/\s/g, '').replace(',', '.')
  if (limpo === '' || limpo === '+' || limpo === '-') return null
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(limpo)) return null
  const n = Number(limpo)
  if (!Number.isFinite(n)) return null
  if (formato === 'inteiro' && !limpo.includes('.')) return deCentesimos(n)
  return n
}
