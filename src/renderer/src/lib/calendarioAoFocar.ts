/**
 * Campo de data que ganha o foco ja abre o calendario (pedido do dono): vale para TODO
 * <input type="date"> do sistema, instalado uma vez em main.tsx - nenhuma tela precisa lembrar.
 *
 * `showPicker()` e do Chromium (o Electron). Ele recusa quando nao ha um gesto do usuario
 * (ex.: foco por script) ou o campo esta bloqueado: nesses casos nao faz nada, o campo
 * continua funcionando normalmente, so sem o calendario aberto.
 */
const TIPOS_COM_CALENDARIO = new Set(['date', 'datetime-local', 'month', 'week'])

interface CampoComCalendario {
  tagName?: string
  type?: string
  disabled?: boolean
  readOnly?: boolean
  showPicker?: () => void
}

export function abrirCalendarioAoFocar(alvo: unknown): boolean {
  const campo = alvo as CampoComCalendario | null
  if (!campo || campo.tagName !== 'INPUT' || !campo.type || !TIPOS_COM_CALENDARIO.has(campo.type)) return false
  if (campo.disabled || campo.readOnly || typeof campo.showPicker !== 'function') return false
  try {
    campo.showPicker()
    return true
  } catch {
    return false
  }
}

/** Liga o comportamento em todo o documento. Devolve a funcao que desliga (usada nos testes). */
export function instalarCalendarioAoFocar(doc: Pick<Document, 'addEventListener' | 'removeEventListener'> = document): () => void {
  const aoFocar = (e: Event): void => {
    abrirCalendarioAoFocar(e.target)
  }
  doc.addEventListener('focusin', aoFocar)
  return () => doc.removeEventListener('focusin', aoFocar)
}
