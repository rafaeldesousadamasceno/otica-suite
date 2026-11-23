/** Validacao do CNPJ pelos dois digitos verificadores. A mascara e em mascaras.ts (`mascararCnpj`). */

export function digitosCnpj(texto: string | null | undefined): string {
  return (texto ?? '').replace(/\D/g, '').slice(0, 14)
}

function digitoVerificador(base: string): number {
  // Pesos de 2 a 9 da direita para a esquerda, recomecando em 2 (o CNPJ tem 12 e depois 13 digitos de base).
  let soma = 0
  let peso = 2
  for (let i = base.length - 1; i >= 0; i--) {
    soma += Number(base[i]) * peso
    peso = peso === 9 ? 2 : peso + 1
  }
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

/** 14 digitos com os dois verificadores certos; "00000000000000" e outras repeticoes nao valem. */
export function cnpjValido(texto: string | null | undefined): boolean {
  const d = (texto ?? '').replace(/\D/g, '')
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const d1 = digitoVerificador(d.slice(0, 12))
  const d2 = digitoVerificador(d.slice(0, 12) + d1)
  return d1 === Number(d[12]) && d2 === Number(d[13])
}
