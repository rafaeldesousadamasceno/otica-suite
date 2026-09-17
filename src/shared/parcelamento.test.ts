import { describe, expect, it } from 'vitest'
import { calcularParcelas, calcularVencimentos } from './parcelamento'

describe('calcularParcelas (RN-06)', () => {
  it('a vista (1x) e o valor inteiro numa parcela so', () => {
    expect(calcularParcelas(10000, 1)).toEqual([10000])
  })

  it('divide igualmente quando o total e multiplo do numero de parcelas', () => {
    expect(calcularParcelas(9000, 3)).toEqual([3000, 3000, 3000])
  })

  it('joga o residuo na primeira parcela, soma sempre bate com o total', () => {
    const parcelas = calcularParcelas(1000, 3) // 333,33...
    expect(parcelas).toEqual([334, 333, 333])
    expect(parcelas.reduce((a, b) => a + b, 0)).toBe(1000)
  })

  it('bate a soma exata em varios casos, mesmo com resto grande', () => {
    for (const [valor, n] of [[9999, 7], [100, 3], [1, 3], [123456, 11]] as const) {
      const parcelas = calcularParcelas(valor, n)
      expect(parcelas).toHaveLength(n)
      expect(parcelas.reduce((a, b) => a + b, 0)).toBe(valor)
    }
  })
})

describe('calcularVencimentos', () => {
  it('primeira parcela vence em 30 dias (1 mes), depois mensal', () => {
    const vencimentos = calcularVencimentos('2026-09-07', 3)
    expect(vencimentos).toEqual(['2026-10-07', '2026-11-07', '2026-12-07'])
  })

  it('atravessa a virada de ano corretamente', () => {
    const vencimentos = calcularVencimentos('2026-11-15', 2)
    expect(vencimentos).toEqual(['2026-12-15', '2027-01-15'])
  })
})
