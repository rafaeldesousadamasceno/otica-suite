import { describe, expect, it } from 'vitest'
import { produtoInputSchema } from './ipc'

const BASE = {
  descricao: 'Armação teste',
  categoria: 'armacao' as const,
  unidade: 'UN'
}

describe('produtoInputSchema - dinheiro em formato brasileiro (PRD 10.4: centavos, inteiro)', () => {
  it('converte "89,90" em 8990 centavos', () => {
    const r = produtoInputSchema.parse({ ...BASE, custoCentavos: '89,90', margem: '0', precoVendaCentavos: '89,90' })
    expect(r.custoCentavos).toBe(8990)
    expect(r.precoVendaCentavos).toBe(8990)
  })

  it('trata o ponto como separador de milhar: "1.234,56" -> 123456 centavos', () => {
    const r = produtoInputSchema.parse({ ...BASE, custoCentavos: '1.234,56', margem: '0', precoVendaCentavos: '0' })
    expect(r.custoCentavos).toBe(123456)
  })

  it('string vazia vira zero, nunca NaN', () => {
    const r = produtoInputSchema.parse({ ...BASE, custoCentavos: '', margem: '0', precoVendaCentavos: '0' })
    expect(r.custoCentavos).toBe(0)
  })

  it('aceita numero puro (ja em centavos) sem reinterpretar', () => {
    const r = produtoInputSchema.parse({ ...BASE, custoCentavos: 5000, margem: '0', precoVendaCentavos: 5000 })
    expect(r.custoCentavos).toBe(5000)
  })

  it('rejeita valor negativo', () => {
    expect(() =>
      produtoInputSchema.parse({ ...BASE, custoCentavos: '-10,00', margem: '0', precoVendaCentavos: '0' })
    ).toThrow()
  })

  it('margem aceita percentual com virgula', () => {
    const r = produtoInputSchema.parse({ ...BASE, custoCentavos: '0', margem: '35,5', precoVendaCentavos: '0' })
    expect(r.margem).toBe(35.5)
  })
})
