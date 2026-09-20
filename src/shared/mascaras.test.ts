import { describe, expect, it } from 'vitest'
import { mascararCep, mascararCnpj, mascararCpf, mascararTelefone } from './mascaras'

describe('mascaras', () => {
  it('CPF: progressivo, completo e a partir de digitos puros', () => {
    expect(mascararCpf('1234')).toBe('123.4')
    expect(mascararCpf('12345678909')).toBe('123.456.789-09')
    expect(mascararCpf('123.456.789-09999')).toBe('123.456.789-09')
    expect(mascararCpf(null)).toBe('')
  })
  it('CNPJ', () => {
    expect(mascararCnpj('11222333000181')).toBe('11.222.333/0001-81')
    expect(mascararCnpj('112223')).toBe('11.222.3')
  })
  it('telefone: fixo e celular', () => {
    expect(mascararTelefone('1')).toBe('(1')
    expect(mascararTelefone('11987')).toBe('(11) 987')
    expect(mascararTelefone('1133334444')).toBe('(11) 3333-4444')
    expect(mascararTelefone('11987654321')).toBe('(11) 98765-4321')
    expect(mascararTelefone('(11) 98765-4321')).toBe('(11) 98765-4321')
    expect(mascararTelefone('')).toBe('')
  })
  it('apagar o ultimo digito nao trava na pontuacao', () => {
    expect(mascararTelefone('(11) 9')).toBe('(11) 9')
    expect(mascararTelefone('(11)')).toBe('(11')
    expect(mascararCpf('123.')).toBe('123')
  })
  it('CEP', () => {
    expect(mascararCep('01310100')).toBe('01310-100')
    expect(mascararCep('0131')).toBe('0131')
  })
})
