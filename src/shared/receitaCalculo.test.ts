import { describe, expect, it } from 'vitest'
import {
  calcularPertoEsf,
  formatarGrau,
  juntarTratamentos,
  paraNumeroGrau,
  separarTratamentos
} from './receitaCalculo'

describe('paraNumeroGrau / formatarGrau', () => {
  it('lê vírgula, ponto, sinal e espaços', () => {
    expect(paraNumeroGrau('1,25')).toBe(1.25)
    expect(paraNumeroGrau('+1.25')).toBe(1.25)
    expect(paraNumeroGrau(' -0,5 ')).toBe(-0.5)
  })

  it('vazio ou digitação incompleta viram null (sem quebrar enquanto se digita)', () => {
    for (const t of ['', '  ', '-', '+', ',', 'abc']) expect(paraNumeroGrau(t)).toBeNull()
  })

  it('formata com duas casas e vírgula', () => {
    expect(formatarGrau(1)).toBe('1,00')
    expect(formatarGrau(-0.5)).toBe('-0,50')
    expect(formatarGrau(null)).toBe('')
  })
})

describe('calcularPertoEsf (RN-02)', () => {
  it('soma a adição ao esférico de longe', () => {
    expect(calcularPertoEsf(-1, 2)).toBe(1)
    expect(calcularPertoEsf(1.5, 2.25)).toBe(3.75)
    expect(calcularPertoEsf(-3.25, 1.75)).toBe(-1.5)
  })

  it('sem longe ou sem adição não calcula', () => {
    expect(calcularPertoEsf(null, 2)).toBeNull()
    expect(calcularPertoEsf(-1, null)).toBeNull()
  })

  it('arredonda para passos de 0,25 e nunca devolve -0', () => {
    expect(calcularPertoEsf(1, 1.1)).toBe(2)
    expect(calcularPertoEsf(-1, 1)).toBe(0)
    expect(Object.is(calcularPertoEsf(-1, 1), -0)).toBe(false)
  })
})

describe('tratamentos (vários por receita)', () => {
  it('junta e separa de volta, na mesma ordem', () => {
    const texto = juntarTratamentos(['ANTIRREFLEXO', 'FILTRO AZUL', 'ANTIRRISCO'])
    expect(texto).toBe('ANTIRREFLEXO + FILTRO AZUL + ANTIRRISCO')
    expect(separarTratamentos(texto)).toEqual(['ANTIRREFLEXO', 'FILTRO AZUL', 'ANTIRRISCO'])
  })

  it('lista vazia vira null, e null/vazio vira lista vazia', () => {
    expect(juntarTratamentos([])).toBeNull()
    expect(juntarTratamentos(['', '  '])).toBeNull()
    expect(separarTratamentos(null)).toEqual([])
    expect(separarTratamentos('')).toEqual([])
  })

  it('valor antigo (um só, ou texto livre da importação) continua sendo um item inteiro', () => {
    expect(separarTratamentos('ANTIRREFLEXO')).toEqual(['ANTIRREFLEXO'])
    expect(separarTratamentos('AR, FOTO')).toEqual(['AR, FOTO'])
    expect(separarTratamentos('AR+FOTO')).toEqual(['AR+FOTO'])
  })

  it('ignora repetidos e espaços sobrando', () => {
    expect(separarTratamentos('FILTRO AZUL +  FILTRO AZUL  + ANTIRRISCO')).toEqual(['FILTRO AZUL', 'ANTIRRISCO'])
  })
})
