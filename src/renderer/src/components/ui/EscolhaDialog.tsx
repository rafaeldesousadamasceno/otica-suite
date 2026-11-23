import { type ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@renderer/components/ui/Button'

export interface OpcaoEscolha {
  chave: string
  rotulo: string
  /** Botao vermelho (a opcao apaga algo). */
  destrutiva?: boolean
}

interface Props {
  aberto: boolean
  titulo: string
  /** Primeira linha identifica o item; as demais explicam o efeito de cada opcao. */
  mensagens: string[]
  /** Linha de aviso em vermelho ("Esta acao nao pode ser desfeita."). */
  aviso?: string
  opcoes: OpcaoEscolha[]
  rotuloCancelar?: string
  /** `null` quando a pessoa cancela (botao Cancelar ou Esc). */
  onEscolher: (chave: string | null) => void
  /** Campo extra entre a mensagem e os botoes (ex.: motivo opcional). */
  children?: ReactNode
}

/**
 * Caixa de escolha entre mais de uma acao (a `useConfirm` so responde sim ou nao). Mesmo visual e mesmas
 * regras do ConfirmDialog (RG-01): Cancelar abre com o foco, Esc cancela, o foco fica preso na caixa e
 * ela fica acima de qualquer outra janela.
 */
export function EscolhaDialog({ aberto, titulo, mensagens, aviso, opcoes, rotuloCancelar = 'Cancelar', onEscolher, children }: Props): ReactNode {
  const cancelarRef = useRef<HTMLButtonElement>(null)
  const caixaRef = useRef<HTMLDivElement>(null)
  // O efeito nao pode depender de `onEscolher` (muda a cada render e tiraria o foco do campo extra).
  const escolherRef = useRef(onEscolher)
  escolherRef.current = onEscolher

  useEffect(() => {
    if (!aberto) return
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelarRef.current?.focus()

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        escolherRef.current(null)
      } else if (e.key === 'Tab') {
        const focaveis = Array.from(caixaRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? [])
        if (focaveis.length === 0) return
        const indice = focaveis.indexOf(document.activeElement as HTMLElement)
        const proximo = e.shiftKey ? (indice <= 0 ? focaveis.length - 1 : indice - 1) : indice === focaveis.length - 1 ? 0 : indice + 1
        e.preventDefault()
        focaveis[proximo].focus()
      }
    }
    // Captura: roda antes do Esc das outras janelas (que ouvem na fase normal).
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      anterior?.focus()
    }
  }, [aberto])

  if (!aberto) return null

  const destrutiva = opcoes.some((o) => o.destrutiva)

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div
        ref={caixaRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="escolha-titulo"
        aria-describedby="escolha-mensagem"
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-[var(--rule)] bg-[var(--surface)] p-5 shadow-xl"
      >
        <div className="flex items-start gap-3">
          {destrutiva && (
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--danger-wash)] text-[var(--danger)]">
              <TriangleAlert className="size-5" />
            </span>
          )}
          <div id="escolha-mensagem" className="flex min-w-0 flex-col gap-1.5">
            <h2 id="escolha-titulo" className="text-base font-semibold text-[var(--ink)]">
              {titulo}
            </h2>
            {mensagens.map((m, i) => (
              <p key={i} className={i === 0 && destrutiva ? 'break-words text-sm font-medium text-[var(--ink)]' : 'break-words text-sm text-[var(--ink-2)]'}>
                {m}
              </p>
            ))}
            {aviso && <p className="text-sm font-medium text-[var(--danger)]">{aviso}</p>}
          </div>
        </div>
        {children}
        <div className="flex flex-col gap-2">
          {opcoes.map((o) => (
            <Button key={o.chave} type="button" variant={o.destrutiva ? 'danger' : 'primary'} className="h-auto min-h-10 w-full whitespace-normal py-2" onClick={() => onEscolher(o.chave)}>
              {o.rotulo}
            </Button>
          ))}
          <Button ref={cancelarRef} type="button" variant="secondary" className="w-full" onClick={() => onEscolher(null)}>
            {rotuloCancelar}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
