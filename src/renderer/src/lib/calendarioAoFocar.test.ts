import { describe, expect, it, vi } from 'vitest'
import { abrirCalendarioAoFocar, instalarCalendarioAoFocar } from './calendarioAoFocar'

const campo = (extra: Record<string, unknown> = {}) => ({ tagName: 'INPUT', type: 'date', showPicker: vi.fn(), ...extra })

describe('abrirCalendarioAoFocar', () => {
  it('campo de data abre o calendário', () => {
    const c = campo()
    expect(abrirCalendarioAoFocar(c)).toBe(true)
    expect(c.showPicker).toHaveBeenCalledOnce()
  })

  it('também data e hora e mês', () => {
    for (const type of ['datetime-local', 'month']) {
      const c = campo({ type })
      expect(abrirCalendarioAoFocar(c)).toBe(true)
    }
  })

  it('outros campos não abrem nada', () => {
    for (const extra of [{ type: 'text' }, { type: 'number' }, { tagName: 'SELECT' }, { tagName: 'TEXTAREA', type: 'textarea' }]) {
      const c = campo(extra)
      expect(abrirCalendarioAoFocar(c)).toBe(false)
      expect(c.showPicker).not.toHaveBeenCalled()
    }
    expect(abrirCalendarioAoFocar(null)).toBe(false)
    expect(abrirCalendarioAoFocar({})).toBe(false)
  })

  it('campo bloqueado ou só leitura não abre', () => {
    for (const extra of [{ disabled: true }, { readOnly: true }]) {
      const c = campo(extra)
      expect(abrirCalendarioAoFocar(c)).toBe(false)
      expect(c.showPicker).not.toHaveBeenCalled()
    }
  })

  it('se o navegador recusar (sem gesto do usuário), não quebra o foco', () => {
    const c = campo({ showPicker: vi.fn(() => { throw new Error('NotAllowedError') }) })
    expect(abrirCalendarioAoFocar(c)).toBe(false)
  })
})

describe('instalarCalendarioAoFocar', () => {
  it('liga no focusin do documento e desliga', () => {
    let ouvinte: ((e: Event) => void) | null = null
    const doc = {
      addEventListener: vi.fn((_t: string, fn: (e: Event) => void) => { ouvinte = fn }),
      removeEventListener: vi.fn()
    }
    const desligar = instalarCalendarioAoFocar(doc as never)
    expect(doc.addEventListener).toHaveBeenCalledWith('focusin', expect.any(Function))

    const c = campo()
    ouvinte!({ target: c } as unknown as Event)
    expect(c.showPicker).toHaveBeenCalledOnce()

    desligar()
    expect(doc.removeEventListener).toHaveBeenCalledWith('focusin', ouvinte)
  })
})
