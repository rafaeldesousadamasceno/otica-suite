import { describe, expect, it } from 'vitest'
import { cpfValido, formatarCpf, limparCpf } from './cpf'

describe('cpfValido', () => {
  it('aceita um CPF valido conhecido', () => {
    expect(cpfValido('529.982.247-25')).toBe(true)
    expect(cpfValido('52998224725')).toBe(true)
  })

  it('rejeita digito verificador incorreto', () => {
    expect(cpfValido('529.982.247-26')).toBe(false)
  })

  it('rejeita sequencias de digitos repetidos', () => {
    expect(cpfValido('111.111.111-11')).toBe(false)
    expect(cpfValido('000.000.000-00')).toBe(false)
  })

  it('rejeita tamanho incorreto', () => {
    expect(cpfValido('123')).toBe(false)
    expect(cpfValido('')).toBe(false)
  })

  // A sentinela do sistema anterior (D6/D10-like problema no campo CPF)
  // nunca pode passar como "valido".
  it('rejeita a sentinela do sistema anterior', () => {
    expect(cpfValido('888.888.888-88')).toBe(false)
  })
})

describe('limparCpf / formatarCpf', () => {
  it('remove pontuacao e reaplica a mascara', () => {
    expect(limparCpf('529.982.247-25')).toBe('52998224725')
    expect(formatarCpf('52998224725')).toBe('529.982.247-25')
  })
})
