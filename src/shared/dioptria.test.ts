import { describe, expect, it } from 'vitest'
import { formatarDioptria, interpretarDioptria, normalizarDioptria, passoDioptria, validarFaixaDeGrau } from './dioptria'

describe('normalizarDioptria (stepper de 0,25)', () => {
  it('vai para o multiplo do passo mais proximo', () => {
    expect(normalizarDioptria(-1.3)).toBe(-1.25)
    expect(normalizarDioptria(1.1)).toBe(1)
    expect(normalizarDioptria(1.2)).toBe(1.25)
    expect(normalizarDioptria(0.12)).toBe(0)
  })

  it('empate vai para longe do zero, nos dois sinais', () => {
    expect(normalizarDioptria(1.125)).toBe(1.25)
    expect(normalizarDioptria(-1.125)).toBe(-1.25)
  })

  it('valor acima do maximo vira o maximo; abaixo do minimo, o minimo', () => {
    expect(normalizarDioptria(35, { min: -30, max: 30 })).toBe(30)
    expect(normalizarDioptria(-31.4, { min: -30, max: 30 })).toBe(-30)
    expect(normalizarDioptria(-0.5, { min: 0, max: 4 })).toBe(0)
  })

  it('nunca devolve -0', () => {
    expect(Object.is(normalizarDioptria(-0.1), 0)).toBe(true)
  })

  it('respeita outro passo', () => {
    expect(normalizarDioptria(0.6, { step: 0.5 })).toBe(0.5)
    expect(normalizarDioptria(0.8, { step: 0.5 })).toBe(1)
  })
})

describe('passoDioptria (setas)', () => {
  it('sobe e desce 0,25 sem acumular erro de ponto flutuante', () => {
    let v: number | null = null
    for (let i = 0; i < 40; i++) v = passoDioptria(v, 1)
    expect(v).toBe(10)
    for (let i = 0; i < 40; i++) v = passoDioptria(v, -1)
    expect(v).toBe(0)
  })

  it('para no limite', () => {
    expect(passoDioptria(4, 1, { min: 0, max: 4 })).toBe(4)
    expect(passoDioptria(0, -1, { min: 0, max: 4 })).toBe(0)
  })

  it('partindo de vazio comeca do zero', () => {
    expect(passoDioptria(null, 1)).toBe(0.25)
    expect(passoDioptria(null, -1)).toBe(-0.25)
  })
})

describe('formatarDioptria', () => {
  it('decimal: sempre com duas casas e sinal', () => {
    expect(formatarDioptria(1.25)).toBe('+1,25')
    expect(formatarDioptria(-0.5)).toBe('-0,50')
    expect(formatarDioptria(0)).toBe('0,00')
    expect(formatarDioptria(-0)).toBe('0,00')
    expect(formatarDioptria(null)).toBe('')
  })

  it('sem sinal (adicao, grau)', () => {
    expect(formatarDioptria(2, { signed: false })).toBe('2,00')
    expect(formatarDioptria(-1, { signed: false })).toBe('-1,00')
  })

  it('inteiro: os centesimos sem virgula', () => {
    expect(formatarDioptria(1.25, { formato: 'inteiro' })).toBe('+125')
    expect(formatarDioptria(-0.5, { formato: 'inteiro' })).toBe('-50')
    expect(formatarDioptria(0, { formato: 'inteiro' })).toBe('0')
  })
})

describe('interpretarDioptria', () => {
  it('decimal aceita virgula, ponto e sinal', () => {
    expect(interpretarDioptria('1,25')).toBe(1.25)
    expect(interpretarDioptria('+1.25')).toBe(1.25)
    expect(interpretarDioptria(' -0,5 ')).toBe(-0.5)
    expect(interpretarDioptria('2')).toBe(2)
  })

  it('inteiro: 125 vale 1,25; com virgula continua sendo dioptria', () => {
    expect(interpretarDioptria('125', 'inteiro')).toBe(1.25)
    expect(interpretarDioptria('-50', 'inteiro')).toBe(-0.5)
    expect(interpretarDioptria('1,25', 'inteiro')).toBe(1.25)
  })

  it('vazio, so sinal ou texto invalido viram null', () => {
    for (const t of ['', '  ', '+', '-', 'abc', '1,2,3', '--1']) expect(interpretarDioptria(t)).toBeNull()
  })

  it('ida e volta nos dois formatos', () => {
    for (const formato of ['decimal', 'inteiro'] as const) {
      for (const v of [-30, -1.25, -0.25, 0, 0.75, 4, 30]) {
        expect(interpretarDioptria(formatarDioptria(v, { formato }), formato)).toBe(v)
      }
    }
  })
})

describe('validarFaixaDeGrau (produto lente)', () => {
  it('mínimo menor ou igual ao máximo passa; vazio passa', () => {
    expect(validarFaixaDeGrau(-6, 4)).toBeNull()
    expect(validarFaixaDeGrau(-2, -2)).toBeNull()
    expect(validarFaixaDeGrau(null, null)).toBeNull()
    expect(validarFaixaDeGrau(-6, null)).toBeNull()
    expect(validarFaixaDeGrau(null, 4)).toBeNull()
  })

  it('mínimo maior que o máximo é recusado, apontando o máximo', () => {
    expect(validarFaixaDeGrau(2, -2)).toEqual({ campo: 'max', mensagem: 'O grau mínimo não pode ser maior que o grau máximo' })
  })

  it('fora de -30 a +30 ou fora do passo de 0,25 é recusado, apontando o campo', () => {
    expect(validarFaixaDeGrau(-30.25, 0)?.campo).toBe('min')
    expect(validarFaixaDeGrau(0, 30.25)?.campo).toBe('max')
    expect(validarFaixaDeGrau(-6.1, 0)?.campo).toBe('min')
    expect(validarFaixaDeGrau(-30, 30)).toBeNull()
    expect(validarFaixaDeGrau(-6.1, 0)?.mensagem).toBe('Grau mínimo: o valor vai de -30,00 a +30,00, em passos de 0,25')
  })
})
