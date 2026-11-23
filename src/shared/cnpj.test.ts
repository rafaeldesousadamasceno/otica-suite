import { describe, expect, it } from 'vitest'
import { cnpjValido, digitosCnpj } from './cnpj'

describe('cnpjValido', () => {
  it('aceita CNPJ com os dígitos verificadores certos, com ou sem máscara', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true)
    expect(cnpjValido('11222333000181')).toBe(true)
    expect(cnpjValido('45.997.418/0001-53')).toBe(true)
  })

  it('recusa dígito verificador errado, tamanho errado e repetições', () => {
    expect(cnpjValido('11.222.333/0001-82')).toBe(false)
    expect(cnpjValido('11.222.333/0001-8')).toBe(false)
    expect(cnpjValido('00000000000000')).toBe(false)
    expect(cnpjValido('11111111111111')).toBe(false)
    expect(cnpjValido('')).toBe(false)
    expect(cnpjValido(null)).toBe(false)
  })

  it('digitosCnpj guarda só os números, até 14', () => {
    expect(digitosCnpj('11.222.333/0001-81')).toBe('11222333000181')
    expect(digitosCnpj('112223330001819999')).toBe('11222333000181')
  })
})
