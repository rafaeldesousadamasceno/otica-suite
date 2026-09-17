import { create } from 'zustand'
import type { Sessao } from '@shared/types'

interface AuthState {
  sessao: Sessao | null
  setSessao: (sessao: Sessao | null) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  sessao: null,
  setSessao: (sessao) => set({ sessao })
}))
