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
  /** Mostrar a DP (distancia pupilar) na prescricao e nas impressoes. Desligado por padrao: ela e sempre gravada. */
  exibirDp: boolean
}

const PADRAO: Preferencias = { formatoNumero: FORMATO_NUMERO_PADRAO, exibirDp: false }

function ler(): Preferencias {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as Partial<Preferencias>
    return {
      formatoNumero: bruto.formatoNumero === 'inteiro' ? 'inteiro' : PADRAO.formatoNumero,
      exibirDp: bruto.exibirDp === true
    }
  } catch {
    return PADRAO
  }
}

interface PreferenciasState extends Preferencias {
  setFormatoNumero: (formato: FormatoNumero) => void
  setExibirDp: (exibir: boolean) => void
}

function gravar(p: Preferencias): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(p))
  } catch {
    // sem armazenamento local: vale ate fechar o app
  }
}

export const usePreferenciasStore = create<PreferenciasState>((set, get) => ({
  ...ler(),
  setFormatoNumero: (formatoNumero) => {
    set({ formatoNumero })
    gravar({ formatoNumero, exibirDp: get().exibirDp })
  },
  setExibirDp: (exibirDp) => {
    set({ exibirDp })
    gravar({ formatoNumero: get().formatoNumero, exibirDp })
  }
}))
