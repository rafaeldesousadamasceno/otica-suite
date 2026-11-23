/**
 * Dinheiro e percentual (RG-04), em funcoes puras:
 * - dinheiro em CENTAVOS (inteiro);
 * - percentual em PONTOS-BASE (8,99% = 899), tambem inteiro;
 * - arredondamento "half-up" no centavo (meio centavo sobe, em modulo).
 *
 * Divisao em parcelas continua sendo `calcularParcelas` (shared/parcelamento):
 * a diferenca de centavos fica na PRIMEIRA parcela, como o sistema ja fazia.
 */

/** Arredonda ao inteiro mais proximo; o meio sobe em modulo (2,5 -> 3 e -2,5 -> -3). */
export function arredondarMeioParaCima(valor: number): number {
  return Math.sign(valor) * Math.round(Math.abs(valor)) + 0
}

/** Parte de um valor em centavos: `percentualBp` em pontos-base. 90000 centavos x 899 bp = 8091 centavos. */
export function aplicarPercentualBp(centavos: number, percentualBp: number): number {
  return arredondarMeioParaCima((centavos * percentualBp) / 10000)
}

/** Valor com o percentual retirado (taxa, desconto): 90000 menos 8,99% = 81909. */
export function descontarPercentualBp(centavos: number, percentualBp: number): number {
  return centavos - aplicarPercentualBp(centavos, percentualBp)
}

/** Valor com o percentual somado (acrescimo): 90000 mais 5% = 94500. */
export function acrescentarPercentualBp(centavos: number, percentualBp: number): number {
  return centavos + aplicarPercentualBp(centavos, percentualBp)
}

/** "8,99" ou 8.99 -> 899 pontos-base; vazio ou invalido -> null. */
export function percentualParaBp(valor: string | number): number | null {
  const n = typeof valor === 'number' ? valor : Number(valor.trim().replace(',', '.'))
  if (typeof valor === 'string' && valor.trim() === '') return null
  return Number.isFinite(n) ? Math.round(n * 100) + 0 : null
}

/**
 * Percentual para exibir: o valor exato, so com as casas que ele tem, seguido
 * de "%" (10 -> "10%", 8,99 -> "8,99%", 0,5 -> "0,5%"). Nunca arredonda para inteiro.
 */
export function formatarPercentualExato(percentual: number): string {
  const texto = percentual.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })
  return `${texto}%`
}

/** Mesmo que `formatarPercentualExato`, partindo de pontos-base (899 -> "8,99%"). */
export function formatarBp(percentualBp: number): string {
  return formatarPercentualExato(percentualBp / 100)
}
