import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const CHAVE = 'optialeph.preferencias'

function armazenamentoFalso(inicial?: string): Map<string, string> {
  const m = new Map<string, string>()
  if (inicial !== undefined) m.set(CHAVE, inicial)
  vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) })
  return m
}

async function carregar() {
  return (await import('./preferenciasStore')).usePreferenciasStore
}

describe('preferências deste computador: menu recolhido', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.unstubAllGlobals())

  it('começa com o menu aberto', async () => {
    armazenamentoFalso()
    expect((await carregar()).getState().menuRecolhido).toBe(false)
  })

  it('lembra que o menu estava recolhido ao reabrir o programa', async () => {
    armazenamentoFalso('{"menuRecolhido":true}')
    expect((await carregar()).getState().menuRecolhido).toBe(true)
  })

  it('preferências antigas, sem essa chave, continuam valendo e o menu fica aberto', async () => {
    armazenamentoFalso('{"formatoNumero":"inteiro","exibirDp":true}')
    const s = (await carregar()).getState()
    expect(s.menuRecolhido).toBe(false)
    expect(s.formatoNumero).toBe('inteiro')
    expect(s.exibirDp).toBe(true)
  })

  it('recolher grava a escolha sem perder as outras preferências', async () => {
    const m = armazenamentoFalso('{"formatoNumero":"inteiro","exibirDp":true}')
    const loja = await carregar()
    loja.getState().setMenuRecolhido(true)
    expect(JSON.parse(m.get(CHAVE) ?? '{}')).toEqual({ formatoNumero: 'inteiro', exibirDp: true, menuRecolhido: true })
  })

  it('mudar outra preferência não desfaz o menu recolhido', async () => {
    const m = armazenamentoFalso('{"menuRecolhido":true}')
    const loja = await carregar()
    loja.getState().setExibirDp(true)
    expect(JSON.parse(m.get(CHAVE) ?? '{}').menuRecolhido).toBe(true)
  })

  it('sem armazenamento local o programa abre normalmente, com o menu aberto', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('sem armazenamento')
      },
      setItem: () => {
        throw new Error('sem armazenamento')
      }
    })
    const loja = await carregar()
    expect(loja.getState().menuRecolhido).toBe(false)
    expect(() => loja.getState().setMenuRecolhido(true)).not.toThrow()
    expect(loja.getState().menuRecolhido).toBe(true)
  })
})
