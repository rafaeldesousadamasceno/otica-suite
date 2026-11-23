import { describe, expect, it } from 'vitest'
import {
  acrescentarPercentualBp,
  aplicarPercentualBp,
  arredondarMeioParaCima,
  descontarPercentualBp,
  formatarBp,
  formatarPercentualExato,
  percentualParaBp
} from './dinheiro'

describe('arredondamento half-up', () => {
  it('meio centavo sobe, em modulo', () => {
    expect(arredondarMeioParaCima(2.5)).toBe(3)
    expect(arredondarMeioParaCima(-2.5)).toBe(-3)
    expect(arredondarMeioParaCima(2.4)).toBe(2)
    expect(Object.is(arredondarMeioParaCima(-0.2), 0)).toBe(true)
  })
})

describe('percentual em pontos-base', () => {
  it('cartao: R$ 900,00 com taxa de 8,99% fica em R$ 819,09 liquido', () => {
    expect(aplicarPercentualBp(90000, 899)).toBe(8091)
    expect(descontarPercentualBp(90000, 899)).toBe(81909)
  })

  it('acrescimo: R$ 900,00 mais 5% = R$ 945,00 (3 x 315,00)', () => {
    expect(acrescentarPercentualBp(90000, 500)).toBe(94500)
  })

  it('desconto: 10% sobre R$ 1.000,00 = R$ 900,00', () => {
    expect(descontarPercentualBp(100000, 1000)).toBe(90000)
  })

  it('arredonda o centavo que sobra para cima quando for meio', () => {
    // 1,5% de R$ 0,50 = 0,75 centavo -> 1
    expect(aplicarPercentualBp(50, 150)).toBe(1)
    // 1,5% de R$ 0,30 = 0,45 centavo -> 0
    expect(aplicarPercentualBp(30, 150)).toBe(0)
  })

  it('texto digitado vira pontos-base', () => {
    expect(percentualParaBp('8,99')).toBe(899)
    expect(percentualParaBp('10')).toBe(1000)
    expect(percentualParaBp(0.5)).toBe(50)
    expect(percentualParaBp('')).toBeNull()
    expect(percentualParaBp('abc')).toBeNull()
  })
})

describe('percentual exibido', () => {
  it('mostra o valor exato, mesmo quebrado, sempre com %', () => {
    expect(formatarBp(899)).toBe('8,99%')
    expect(formatarBp(1000)).toBe('10%')
    expect(formatarBp(50)).toBe('0,5%')
    expect(formatarBp(0)).toBe('0%')
    expect(formatarPercentualExato(12.345)).toBe('12,345%')
    expect(formatarPercentualExato(100)).toBe('100%')
  })
})
