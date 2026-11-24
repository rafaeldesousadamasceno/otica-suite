import { describe, expect, it } from 'vitest'
import { TERMO_NUVEM_TEXTO, TERMO_NUVEM_VERSAO } from './termoNuvem'

describe('termo da nuvem', () => {
  it('o termo cita São Paulo, senha, dado de saúde e desligar', () => {
    const texto = TERMO_NUVEM_TEXTO.join('\n')
    for (const palavra of ['São Paulo', 'senha', 'saúde', 'desligar']) {
      expect(texto).toContain(palavra)
    }
    expect(TERMO_NUVEM_VERSAO).toBe(1)
  })
})
