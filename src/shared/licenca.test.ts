import { describe, expect, it } from 'vitest'
import { licencaPedeAtencao } from './licenca'

describe('licencaPedeAtencao', () => {
  it('avisa quando esta perto de vencer, em carencia, vencida ou teste encerrado', () => {
    for (const e of ['proxima_vencimento', 'carencia', 'vencida', 'teste_encerrado'] as const) {
      expect(licencaPedeAtencao(e)).toBe(true)
    }
  })
  it('fica quieto com licenca ativa ou teste em andamento', () => {
    expect(licencaPedeAtencao('ativa')).toBe(false)
    expect(licencaPedeAtencao('teste')).toBe(false)
  })
})
