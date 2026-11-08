import { describe, expect, it } from 'vitest'
import { contemBusca, maiusculo, maiusculoOuNulo, semAcento, termoBusca } from './texto'

describe('maiusculo', () => {
  it('passa para maiusculas preservando o acento', () => {
    expect(maiusculo('  Príscila da Conceição ')).toBe('PRÍSCILA DA CONCEIÇÃO')
    expect(maiusculo('joão')).toBe('JOÃO')
  })
})

describe('maiusculoOuNulo', () => {
  it('devolve null para vazio, so espacos ou ausente', () => {
    expect(maiusculoOuNulo('')).toBeNull()
    expect(maiusculoOuNulo('   ')).toBeNull()
    expect(maiusculoOuNulo(null)).toBeNull()
    expect(maiusculoOuNulo(undefined)).toBeNull()
  })
  it('converte quando ha texto', () => {
    expect(maiusculoOuNulo(' bairro são josé ')).toBe('BAIRRO SÃO JOSÉ')
  })
})

describe('semAcento', () => {
  it('tira acento e diferenca de maiuscula', () => {
    expect(semAcento('PRÍSCILA')).toBe('priscila')
    expect(semAcento('Conceição')).toBe('conceicao')
    expect(semAcento('ÀÉÎÕÜ Ç')).toBe('aeiou c')
  })
})

describe('termoBusca', () => {
  it('monta o padrao de contido, sem acento', () => {
    expect(termoBusca(' Príscila ')).toBe('%priscila%')
  })
  it('busca vazia ou ausente casa tudo', () => {
    expect(termoBusca('')).toBe('%%')
    expect(termoBusca(undefined)).toBe('%%')
  })
})

describe('contemBusca', () => {
  const motivo = 'O CPF 018.768.123-40 de PATRÍCIA MIRANDA BASTOS (cliente nº 161 deste sistema) não é um CPF válido.'

  it('acha com ou sem acento e sem diferenca de maiuscula', () => {
    expect(contemBusca(motivo, 'patricia')).toBe(true)
    expect(contemBusca(motivo, 'PATRÍCIA')).toBe(true)
    expect(contemBusca(motivo, 'patr')).toBe(true)
    expect(contemBusca(motivo, 'valido')).toBe(true)
  })

  it('acha o CPF digitado so com numeros ou so um pedaco', () => {
    expect(contemBusca(motivo, '01876812340')).toBe(true)
    expect(contemBusca(motivo, '018.768')).toBe(true)
    expect(contemBusca(motivo, '768123')).toBe(true)
  })

  it('a letra continua precisando corresponder e numeros nao se emendam', () => {
    expect(contemBusca(motivo, 'patrecia')).toBe(false)
    // 123-40 e 161 sao numeros diferentes: "12340161" nao existe em nenhum deles.
    expect(contemBusca(motivo, '12340161')).toBe(false)
  })

  it('busca vazia casa tudo', () => {
    expect(contemBusca(motivo, '   ')).toBe(true)
  })
})
