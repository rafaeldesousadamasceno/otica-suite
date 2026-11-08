/**
 * Tratamento de texto digitado: padroniza o que e SALVO (maiusculas) e o que e
 * COMPARADO na busca (sem acento e sem diferenca de maiuscula).
 */

/** Maiusculas com acento preservado ("Priscila" -> "PRISCILA", "joão" -> "JOÃO"). */
export function maiusculo(valor: string): string {
  return valor.trim().toLocaleUpperCase('pt-BR')
}

/** Igual a `maiusculo`, mas devolve null para vazio/ausente (campo opcional). */
export function maiusculoOuNulo(valor: string | null | undefined): string | null {
  const v = valor?.trim()
  return v ? v.toLocaleUpperCase('pt-BR') : null
}

/** Minusculas e sem acento ("PRÍSCILA" -> "priscila"). Base da busca. */
export function semAcento(valor: string): string {
  return valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Padrao para `sem_acento(coluna) LIKE :termo`: o digitado, sem acento, contido em qualquer parte. */
export function termoBusca(busca: string | null | undefined): string {
  return `%${semAcento((busca ?? '').trim())}%`
}

/**
 * Busca em texto ja carregado na tela (a busca no banco usa `termoBusca`): ignora
 * acento e maiuscula, e acha numero digitado sem pontuacao ("01876812340" acha
 * "018.768.123-40"). Numeros so casam dentro do mesmo numero (CPF, codigo), nunca
 * emendando digitos de numeros diferentes.
 */
export function contemBusca(texto: string, busca: string): boolean {
  const termo = semAcento(busca.trim())
  if (!termo) return true
  if (semAcento(texto).includes(termo)) return true
  const digitos = termo.replace(/\D/g, '')
  if (digitos.length < 3) return false
  return (texto.match(/\d[\d.\-/]*/g) ?? []).some((numero) => numero.replace(/\D/g, '').includes(digitos))
}
