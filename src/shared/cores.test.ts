import { describe, expect, it } from 'vitest'
import { COR_DESTAQUE_PADRAO, contraste, derivarTonsDestaque, misturar } from './cores'

describe('contraste', () => {
  it('segue a escala WCAG: preto x branco = 21, cor x ela mesma = 1', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contraste('#0d6a70', '#0d6a70')).toBeCloseTo(1, 5)
  })
})

describe('misturar', () => {
  it('t = 0 devolve a cor, t = 1 devolve o alvo', () => {
    expect(misturar('#0d6a70', '#ffffff', 0)).toBe('#0d6a70')
    expect(misturar('#0d6a70', '#ffffff', 1)).toBe('#ffffff')
    expect(misturar('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})

describe('derivarTonsDestaque', () => {
  it('cor padrao (escura): texto branco e o proprio tom como titulo', () => {
    const t = derivarTonsDestaque(COR_DESTAQUE_PADRAO)
    expect(t.base).toBe('#0d6a70')
    expect(t.tinta).toBe('#ffffff')
    expect(t.forte).toBe('#0d6a70')
  })

  it('cor clara (amarelo): texto escuro e titulo escurecido ate ficar legivel', () => {
    const t = derivarTonsDestaque('#F2C94C')
    expect(t.tinta).toBe('#111111')
    expect(contraste(t.forte, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('branco e preto continuam legiveis', () => {
    expect(contraste(derivarTonsDestaque('#ffffff').forte, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(derivarTonsDestaque('#000000').tinta).toBe('#ffffff')
  })

  it('cor invalida ou vazia cai na cor padrao', () => {
    expect(derivarTonsDestaque('azul').base).toBe('#0d6a70')
    expect(derivarTonsDestaque(null).base).toBe('#0d6a70')
    expect(derivarTonsDestaque('#abc').base).toBe('#aabbcc')
  })

  it('fundos claros ficam bem mais claros que a cor', () => {
    const t = derivarTonsDestaque('#0d6a70')
    expect(contraste(t.suave, '#ffffff')).toBeLessThan(1.3)
    expect(contraste(t.zebra, '#ffffff')).toBeLessThan(1.1)
  })
})
