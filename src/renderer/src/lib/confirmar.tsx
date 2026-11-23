import { type ReactNode, createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog'
import { montarConfirmacao, type ConfirmacaoExcluir, type ConfirmacaoMontada, type OpcoesConfirmacao } from '@shared/confirmacao'

type Confirmar = (opcoes: OpcoesConfirmacao) => Promise<boolean>
/** Exclusao que pergunta o motivo (opcional): devolve o motivo digitado (pode ser vazio) ou `null` se cancelou. */
type ConfirmarComMotivo = (opcoes: Omit<ConfirmacaoExcluir, 'variante' | 'pedirMotivo'>) => Promise<{ motivo: string } | null>

interface Resposta {
  confirmou: boolean
  motivo: string
}

const ConfirmContext = createContext<{ confirmar: Confirmar; confirmarComMotivo: ConfirmarComMotivo } | null>(null)

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
  const resolverRef = useRef<((resposta: Resposta) => void) | null>(null)

  const responder = useCallback((confirmou: boolean, motivo = '') => {
    resolverRef.current?.({ confirmou, motivo })
    resolverRef.current = null
    setAberta(null)
  }, [])

  const abrir = useCallback((opcoes: OpcoesConfirmacao): Promise<Resposta> => {
    // Pergunta nova com outra ainda aberta: a antiga conta como "nao".
    resolverRef.current?.({ confirmou: false, motivo: '' })
    return new Promise<Resposta>((resolve) => {
      resolverRef.current = resolve
      setAberta(montarConfirmacao(opcoes))
    })
  }, [])

  const valor = useMemo(
    () => ({
      confirmar: (opcoes: OpcoesConfirmacao) => abrir(opcoes).then((r) => r.confirmou),
      confirmarComMotivo: (opcoes: Omit<ConfirmacaoExcluir, 'variante' | 'pedirMotivo'>) =>
        abrir({ ...opcoes, variante: 'excluir', pedirMotivo: true }).then((r) => (r.confirmou ? { motivo: r.motivo.trim() } : null))
    }),
    [abrir]
  )

  return (
    <ConfirmContext.Provider value={valor}>
      {children}
      <ConfirmDialog confirmacao={aberta} onResponder={responder} />
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): Confirmar {
  const contexto = useContext(ConfirmContext)
  if (!contexto) throw new Error('useConfirm precisa estar dentro de <ConfirmProvider>.')
  return contexto.confirmar
}

/** Como `useConfirm` para excluir, mas com o campo "Motivo (opcional)" na mesma caixa de confirmacao. */
export function useConfirmComMotivo(): ConfirmarComMotivo {
  const contexto = useContext(ConfirmContext)
  if (!contexto) throw new Error('useConfirmComMotivo precisa estar dentro de <ConfirmProvider>.')
  return contexto.confirmarComMotivo
}
