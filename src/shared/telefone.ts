/**
 * Telefone (RG-05): o que se grava sao so os digitos; a mascara e so de tela.
 * Celular com 11 digitos "(85) 9 9999-9999", fixo com 10 "(85) 3333-3333".
 * (Os cadastros antigos seguem com `mascararTelefone` de mascaras.ts.)
 */

export function digitosTelefone(texto: string | null | undefined): string {
  return (texto ?? '').replace(/\D/g, '').slice(0, 11)
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
  const d = digitosTelefone(texto)
  return d.length === 0 || d.length === 10 || d.length === 11
}
