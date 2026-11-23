import { type ReactNode, createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog'
import { montarConfirmacao, type ConfirmacaoMontada, type OpcoesConfirmacao } from '@shared/confirmacao'

type Confirmar = (opcoes: OpcoesConfirmacao) => Promise<boolean>

const ConfirmContext = createContext<Confirmar | null>(null)

/**
 * Mecanismo unico de confirmacao (RG-01): no lugar de `window.confirm`.
 *
 *   const confirmar = useConfirm()
 *   if (!(await confirmar({ variante: 'excluir', entidade: 'cliente', item: c.nome }))) return
 *
 * Fica no topo do app (main.tsx), entao funciona de dentro de qualquer janela.
 */
export function ConfirmProvider({ children }: { children: ReactNode }): ReactNode {
  const [aberta, setAberta] = useState<ConfirmacaoMontada | null>(null)
  const resolverRef = useRef<((confirmou: boolean) => void) | null>(null)

  const responder = useCallback((confirmou: boolean) => {
    resolverRef.current?.(confirmou)
    resolverRef.current = null
    setAberta(null)
  }, [])

  const confirmar = useCallback<Confirmar>((opcoes) => {
    // Pergunta nova com outra ainda aberta: a antiga conta como "nao".
    resolverRef.current?.(false)
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
      setAberta(montarConfirmacao(opcoes))
    })
  }, [])

  const valor = useMemo(() => confirmar, [confirmar])

  return (
    <ConfirmContext.Provider value={valor}>
      {children}
      <ConfirmDialog confirmacao={aberta} onResponder={responder} />
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): Confirmar {
  const confirmar = useContext(ConfirmContext)
  if (!confirmar) throw new Error('useConfirm precisa estar dentro de <ConfirmProvider>.')
  return confirmar
}
