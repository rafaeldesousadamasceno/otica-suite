import { describe, expect, it } from 'vitest'
import { digitosTelefone, digitosTelefoneCompleto, mascararTelefoneBr, telefoneValido } from './telefone'

describe('mascararTelefoneBr', () => {
  it('celular de 11 digitos', () => {
    expect(mascararTelefoneBr('85999998888')).toBe('(85) 9 9999-8888')
  })

  it('fixo de 10 digitos', () => {
    expect(mascararTelefoneBr('8533334444')).toBe('(85) 3333-4444')
  })

  it('vai montando a mascara enquanto digita', () => {
    expect(mascararTelefoneBr('8')).toBe('(8')
    expect(mascararTelefoneBr('85')).toBe('(85')
    expect(mascararTelefoneBr('859')).toBe('(85) 9')
    expect(mascararTelefoneBr('85999')).toBe('(85) 9 99')
    expect(mascararTelefoneBr('859999988')).toBe('(85) 9 9999-88')
    expect(mascararTelefoneBr('853333')).toBe('(85) 3333')
    expect(mascararTelefoneBr('85333344')).toBe('(85) 3333-44')
  })

  it('aceita o texto ja mascarado e ignora o que passa de 11 digitos', () => {
    expect(mascararTelefoneBr('(85) 9 9999-8888')).toBe('(85) 9 9999-8888')
    expect(mascararTelefoneBr('859999988889999')).toBe('(85) 9 9999-8888')
  })

  it('vazio fica vazio', () => {
    expect(mascararTelefoneBr('')).toBe('')
    expect(mascararTelefoneBr(null)).toBe('')
    expect(mascararTelefoneBr('abc')).toBe('')
  })
})

describe('telefoneValido', () => {
  it('10 ou 11 digitos, ou vazio', () => {
    expect(telefoneValido('')).toBe(true)
    expect(telefoneValido('(85) 3333-4444')).toBe(true)
    expect(telefoneValido('(85) 9 9999-8888')).toBe(true)
    expect(telefoneValido('85999')).toBe(false)
    expect(telefoneValido('859999988')).toBe(false)
  })

  it('mais de 11 dígitos não é válido (nada de cortar em silêncio)', () => {
    expect(telefoneValido('859999988889')).toBe(false)
    expect(telefoneValido('85999998888999')).toBe(false)
  })

  it('número colado com +55 perde o código do país', () => {
    expect(telefoneValido('+55 85 99999-8888')).toBe(true)
    expect(digitosTelefone('+55 85 99999-8888')).toBe('85999998888')
    expect(digitosTelefoneCompleto('+55 85 3333-4444')).toBe('8533334444')
    // DDD 55 de verdade (RS), com 11 digitos, nao e mexido
    expect(digitosTelefone('55 9 9999-8888')).toBe('55999998888')
  })

  it('guarda so os digitos', () => {
    expect(digitosTelefone('(85) 9 9999-8888')).toBe('85999998888')
  })
})
