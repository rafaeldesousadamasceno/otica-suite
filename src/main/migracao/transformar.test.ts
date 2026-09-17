import { describe, expect, it } from 'vitest'
import {
  normalizarNomeProprio,
  dataOuNull,
  cpfOuNull,
  celularOuNull,
  paraNumero,
  paraCentavos,
  mapearSituacaoOS
} from './transformar'

describe('transformar (migracao do MD Óculos - PRD secao 11)', () => {
  it('normaliza nome em CAIXA ALTA para capitalizacao de nome proprio', () => {
    expect(normalizarNomeProprio('JOÃO DA SILVA')).toBe('João Da Silva')
    expect(normalizarNomeProprio('maria   pereira')).toBe('Maria Pereira')
  })

  it('converte a data-sentinela 1111-11-11 em null, preserva data valida', () => {
    expect(dataOuNull('1111-11-11')).toBeNull()
    expect(dataOuNull(null)).toBeNull()
    expect(dataOuNull('2024-06-11')).toBe('2024-06-11')
  })

  it('converte o cpf-sentinela em null, preserva cpf real', () => {
    expect(cpfOuNull('888.888.888-88')).toBeNull()
    expect(cpfOuNull('123.456.789-00')).toBe('123.456.789-00')
  })

  it('converte o celular-sentinela em null, preserva celular real', () => {
    expect(celularOuNull('(85)91234-1234')).toBeNull()
    expect(celularOuNull('(85)98888-7777')).toBe('(85)98888-7777')
  })

  it('converte string decimal (vinda do mysql2) e number em number', () => {
    expect(paraNumero('1.25')).toBe(1.25)
    expect(paraNumero(90)).toBe(90)
    expect(paraNumero(null)).toBeNull()
    expect(paraNumero('não é número')).toBeNull()
  })

  it('converte decimal para centavos como inteiro', () => {
    expect(paraCentavos('150.50')).toBe(15050)
    expect(paraCentavos(null)).toBe(0)
  })

  it('mapeia situacao de OS conhecida, cai em EM ABERTO se desconhecida', () => {
    expect(mapearSituacaoOS('LABORATÓRIO')).toBe('LABORATÓRIO')
    expect(mapearSituacaoOS('entregue')).toBe('ENTREGUE')
    expect(mapearSituacaoOS('valor-invalido')).toBe('EM ABERTO')
    expect(mapearSituacaoOS(null)).toBe('EM ABERTO')
  })
})
