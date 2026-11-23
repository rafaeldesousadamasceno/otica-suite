import { type ReactNode, useId, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@renderer/lib/cn'

interface Props {
  titulo: string
  /** Texto curto no cabecalho, visivel mesmo fechada (ex.: um resumo do que esta preenchido). */
  resumo?: ReactNode
  /** Aberta ao montar. Padrao: fechada. */
  abertaInicial?: boolean
  /** Controle de fora: quando informado, o estado e de quem chama. */
  aberta?: boolean
  onAlternar?: (aberta: boolean) => void
  /** Realce de erro no cabecalho (ex.: ha um campo invalido la dentro). */
  comErro?: boolean
  className?: string
  children: ReactNode
}

/**
 * Secao recolhivel (sanfona) para campos opcionais. O conteudo continua montado
 * quando fechada (so escondido), entao o que foi digitado la dentro nao se perde.
 */
export function SecaoRecolhivel({ titulo, resumo, abertaInicial = false, aberta, onAlternar, comErro, className, children }: Props): ReactNode {
  const [interna, setInterna] = useState(abertaInicial)
  const idConteudo = useId()
  const estaAberta = aberta ?? interna

  function alternar(): void {
    const nova = !estaAberta
    if (aberta === undefined) setInterna(nova)
    onAlternar?.(nova)
  }

  return (
    <section className={cn('rounded-md border border-[var(--rule)]', comErro && 'border-[var(--danger)]!', className)}>
      <button
        type="button"
        aria-expanded={estaAberta}
        aria-controls={idConteudo}
        onClick={alternar}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left hover:bg-[var(--surface-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        {estaAberta ? <ChevronDown className="size-4 shrink-0 text-[var(--ink-3)]" /> : <ChevronRight className="size-4 shrink-0 text-[var(--ink-3)]" />}
        <span className="text-sm font-semibold text-[var(--ink)]">{titulo}</span>
        {resumo ? <span className="ml-auto truncate pl-3 font-mono-tab text-xs text-[var(--ink-3)]">{resumo}</span> : null}
      </button>
      <div id={idConteudo} hidden={!estaAberta} className="border-t border-[var(--rule)] p-3">
        {children}
      </div>
    </section>
  )
}
