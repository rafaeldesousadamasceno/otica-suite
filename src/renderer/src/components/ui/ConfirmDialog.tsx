import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@renderer/components/ui/Button'
import type { ConfirmacaoMontada } from '@shared/confirmacao'

interface Props {
  confirmacao: ConfirmacaoMontada | null
  /** `motivo` so vem quando a confirmacao pediu o campo "Motivo (opcional)". */
  onResponder: (confirmou: boolean, motivo?: string) => void
}

/**
 * Caixa de confirmacao (RG-01). Cancelar abre com o foco e Esc tambem cancela:
 * apertar Enter sem olhar nunca exclui. Fica acima de qualquer outra janela e
 * "come" o Esc, para ele nao fechar tambem a janela que esta por baixo.
 */
export function ConfirmDialog({ confirmacao, onResponder }: Props): ReactNode {
  const cancelarRef = useRef<HTMLButtonElement>(null)
  const confirmarRef = useRef<HTMLButtonElement>(null)
  const motivoRef = useRef<HTMLInputElement>(null)
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    if (!confirmacao) return
    setMotivo('')
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelarRef.current?.focus()

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        onResponder(false)
      } else if (e.key === 'Tab') {
        // O foco fica preso dentro da caixa: o campo do motivo (se houver), Cancelar e o botao de confirmar.
        e.preventDefault()
        const ordem: HTMLElement[] = []
        for (const el of [motivoRef.current, cancelarRef.current, confirmarRef.current]) if (el) ordem.push(el)
        const atual = ordem.indexOf(document.activeElement as HTMLElement)
        const proximo = (atual + (e.shiftKey ? -1 : 1) + ordem.length) % ordem.length
        ordem[proximo]?.focus()
      }
    }
    // Captura: roda antes do Esc das outras janelas (que ouvem na fase normal).
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      anterior?.focus()
    }
  }, [confirmacao, onResponder])

  if (!confirmacao) return null

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-titulo"
        aria-describedby="confirm-mensagem"
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-[var(--rule)] bg-[var(--surface)] p-5 shadow-xl"
      >
        <div className="flex items-start gap-3">
          {confirmacao.destrutiva && (
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--danger-wash)] text-[var(--danger)]">
              <TriangleAlert className="size-5" />
            </span>
          )}
          <div id="confirm-mensagem" className="flex min-w-0 flex-col gap-1.5">
            <h2 id="confirm-titulo" className="text-base font-semibold text-[var(--ink)]">
              {confirmacao.titulo}
            </h2>
            {confirmacao.mensagens.map((m, i) => (
              <p key={i} className={i === 0 && confirmacao.destrutiva ? 'break-words text-sm font-medium text-[var(--ink)]' : 'break-words text-sm text-[var(--ink-2)]'}>
                {m}
              </p>
            ))}
            {confirmacao.aviso && <p className="text-sm font-medium text-[var(--danger)]">{confirmacao.aviso}</p>}
          </div>
        </div>
        {confirmacao.pedirMotivo && (
          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--ink-2)]">
            Motivo (opcional)
            <input
              ref={motivoRef}
              value={motivo}
              maxLength={200}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Por que está excluindo?"
              className="h-9 w-full rounded-md border border-[var(--rule-strong)] bg-[var(--surface)] px-3 text-sm font-normal text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-[var(--accent)]"
            />
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button ref={cancelarRef} type="button" variant="secondary" onClick={() => onResponder(false)}>
            {confirmacao.rotuloCancelar}
          </Button>
          <Button
            ref={confirmarRef}
            type="button"
            variant={confirmacao.destrutiva ? 'danger' : 'primary'}
            onClick={() => onResponder(true, confirmacao.pedirMotivo ? motivo : undefined)}
          >
            {confirmacao.rotuloConfirmar}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
