/**
 * Telefone (RG-05): o que se grava sao so os digitos; a mascara e so de tela.
 * Celular com 11 digitos "(85) 9 9999-9999", fixo com 10 "(85) 3333-3333".
 * (Os cadastros antigos seguem com `mascararTelefone` de mascaras.ts.)
 */

/** So os digitos, sem cortar; o "55" do pais, quando colado com DDD e numero (12 ou 13 digitos), sai. */
export function digitosTelefoneCompleto(texto: string | null | undefined): string {
  const d = (texto ?? '').replace(/\D/g, '')
  return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d
}

/** Para a mascara enquanto se digita: no maximo 11 digitos. */
export function digitosTelefone(texto: string | null | undefined): string {
  return digitosTelefoneCompleto(texto).slice(0, 11)
}

/** Aplica a mascara enquanto se digita; aceita texto ja mascarado. */
export function mascararTelefoneBr(texto: string | null | undefined): string {
  const d = digitosTelefone(texto)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  const ddd = d.slice(0, 2)
  const resto = d.slice(2)
  // Celular comecam com 9; fixo, com 2 a 5. Com 11 digitos so pode ser celular.
  if (resto.startsWith('9') || d.length > 10) {
    const [nove, ...demais] = resto
    const numero = demais.join('')
    if (numero.length === 0) return `(${ddd}) ${nove}`
    if (numero.length <= 4) return `(${ddd}) ${nove} ${numero}`
    return `(${ddd}) ${nove} ${numero.slice(0, 4)}-${numero.slice(4)}`
  }
  if (resto.length <= 4) return `(${ddd}) ${resto}`
  return `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4)}`
}

/** Vazio e permitido (campo opcional); preenchido precisa de 10 ou 11 digitos. */
export function telefoneValido(texto: string | null | undefined): boolean {
  // Sem cortar em 11: um numero com digitos a mais NAO e valido (cortado, viraria outro numero).
  const n = digitosTelefoneCompleto(texto).length
  return n === 0 || n === 10 || n === 11
}
