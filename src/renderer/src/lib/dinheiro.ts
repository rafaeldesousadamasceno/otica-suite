/**
 * "1.234,56" ou "89,90" -> 123456 / 8990 centavos. Espelha o parser do
 * backend (`dinheiroCentavos` em shared/ipc.ts) só para cálculo ao vivo
 * na tela - quem valida e converte de verdade pro banco é sempre o main.
 */
export function textoParaCentavos(texto: string): number {
  const limpo = texto.trim().replace(/\./g, '').replace(',', '.')
  const n = Math.round(Number(limpo || '0') * 100)
  return Number.isFinite(n) ? n : 0
}

/** Centavos -> "1234,56" (para preencher um campo de edição). */
export function centavosParaTexto(centavos: number): string {
  return (centavos / 100).toFixed(2).replace('.', ',')
}

/** Centavos -> "R$ 1.234,56" (para exibição, nunca para reenviar ao backend). */
export function centavosParaBRL(centavos: number | null): string {
  if (centavos === null) return '—'
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
