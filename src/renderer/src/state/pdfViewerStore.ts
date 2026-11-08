import { create } from 'zustand'
import type { PdfVisualizacao } from '@shared/types'

interface PdfViewerState {
  /** PDF aberto no visualizador; um por vez. */
  atual: PdfVisualizacao | null
  abrir: (pdf: PdfVisualizacao) => void
  fechar: () => void
}

/** Avisa o main que o PDF pode sair da memoria. Falhar aqui nao importa: ele vence sozinho em 10 min. */
function descartar(id: string): void {
  void window.api.pdf.descartar({ id }).catch(() => undefined)
}

export const usePdfViewerStore = create<PdfViewerState>((set, get) => ({
  atual: null,
  abrir: (pdf) => {
    const anterior = get().atual
    if (anterior && anterior.id !== pdf.id) descartar(anterior.id)
    set({ atual: pdf })
  },
  fechar: () => {
    const atual = get().atual
    if (atual) descartar(atual.id)
    set({ atual: null })
  }
}))
