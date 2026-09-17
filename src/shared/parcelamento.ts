/**
 * RN-06: a soma das parcelas e SEMPRE exatamente igual ao total: o
 * residuo de arredondamento vai na primeira parcela, nunca se perde.
 *
 * Ex.: R$ 10,00 em 3x -> [3,34 , 3,33 , 3,33] (soma = 10,00 exato).
 */
export function calcularParcelas(valorCentavos: number, numParcelas: number): number[] {
  if (numParcelas <= 1) return [valorCentavos]

  const base = Math.floor(valorCentavos / numParcelas)
  const resto = valorCentavos - base * numParcelas

  return Array.from({ length: numParcelas }, (_, i) => (i === 0 ? base + resto : base))
}

/** Vencimentos mensais a partir da data da venda - primeira parcela em 30 dias. */
export function calcularVencimentos(dataVendaISO: string, numParcelas: number): string[] {
  const [ano, mes, dia] = dataVendaISO.split('-').map(Number)
  return Array.from({ length: numParcelas }, (_, i) => {
    const d = new Date(Date.UTC(ano, mes - 1, dia))
    d.setUTCMonth(d.getUTCMonth() + (i + 1))
    return d.toISOString().slice(0, 10)
  })
}
