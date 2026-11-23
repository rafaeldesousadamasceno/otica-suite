import { create } from 'zustand'
import { FORMATO_NUMERO_PADRAO, type FormatoNumero } from '@shared/dioptria'

/**
 * Preferencias deste computador (nao viajam na sincronizacao, nao dependem do
 * usuario logado). Ficam no armazenamento local da janela: o app e offline e
 * isto so muda como a tela mostra e recebe o numero, nunca o que e gravado.
 */
const CHAVE = 'optialeph.preferencias'

interface Preferencias {
  formatoNumero: FormatoNumero
}

function ler(): Preferencias {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as Partial<Preferencias>
    return { formatoNumero: bruto.formatoNumero === 'inteiro' ? 'inteiro' : FORMATO_NUMERO_PADRAO }
  } catch {
    return { formatoNumero: FORMATO_NUMERO_PADRAO }
  }
}

interface PreferenciasState extends Preferencias {
  setFormatoNumero: (formato: FormatoNumero) => void
}

export const usePreferenciasStore = create<PreferenciasState>((set, get) => ({
  ...ler(),
  setFormatoNumero: (formatoNumero) => {
    set({ formatoNumero })
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ formatoNumero: get().formatoNumero }))
    } catch {
      // sem armazenamento local: vale ate fechar o app
    }
  }
}))
