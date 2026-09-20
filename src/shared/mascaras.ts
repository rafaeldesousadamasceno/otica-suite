/**
 * Máscaras de digitação (CPF, CNPJ, telefone, CEP). Recebem o que o usuário
 * digitou/colou/o que veio do banco e devolvem o texto formatado, aproveitando
 * só os dígitos - por isso servem tanto no onChange quanto ao carregar um
 * cadastro antigo (o CPF é guardado só com números).
 * Formatam de forma progressiva: "1234" -> "123.4", sem exigir o valor completo.
 */
function digitos(texto: string | null | undefined, max: number): string {
  return (texto ?? '').replace(/\D/g, '').slice(0, max)
}

export function mascararCpf(texto: string | null | undefined): string {
  const d = digitos(texto, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function mascararCnpj(texto: string | null | undefined): string {
  const d = digitos(texto, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

/** Fixo (00) 0000-0000 ou celular (00) 00000-0000, conforme a quantidade de dígitos. */
export function mascararTelefone(texto: string | null | undefined): string {
  const d = digitos(texto, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  const ddd = d.slice(0, 2)
  const resto = d.slice(2)
  if (d.length <= 6) return `(${ddd}) ${resto}`
  if (d.length <= 10) return `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4)}`
  return `(${ddd}) ${resto.slice(0, 5)}-${resto.slice(5)}`
}

export function mascararCep(texto: string | null | undefined): string {
  const d = digitos(texto, 8)
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`
}
