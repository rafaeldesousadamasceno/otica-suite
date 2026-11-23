import { type KeyboardEvent, type ReactNode, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import { usePreferenciasStore } from '@renderer/state/preferenciasStore'
import { formatarDioptria, interpretarDioptria, normalizarDioptria, passoDioptria, PASSO_DIOPTRIA } from '@shared/dioptria'

interface Props {
  /** Valor em dioptrias (-1.25); `null` = ainda sem valor. */
  value: number | null
  onChange: (valor: number | null) => void
  min?: number
  max?: number
  /** Passo das setas e do arredondamento. Padrao 0,25. */
  step?: number
  readOnly?: boolean
  /** Mostra o sinal (+1,25). Padrao: sim; adicao e grau da lente podem ficar sem. */
  signed?: boolean
  invalid?: boolean
  disabled?: boolean
  id?: string
  className?: string
  'aria-label'?: string
  placeholder?: string
}

/**
 * Campo de dioptria com [▼] valor [▲] (RG-03). Digitacao livre; ao sair do campo
 * o valor vai ao multiplo do passo mais proximo e respeita minimo e maximo.
 * As setas do teclado (↑/↓) fazem o mesmo que os botoes. O formato (+1,25 ou
 * +125) vem da preferencia deste computador.
 */
export function DioptriaInput({
  value,
  onChange,
  min,
  max,
  step = PASSO_DIOPTRIA,
  readOnly,
  signed = true,
  invalid,
  disabled,
  id,
  className,
  placeholder,
  'aria-label': ariaLabel
}: Props): ReactNode {
  const formato = usePreferenciasStore((s) => s.formatoNumero)
  const limites = { min, max, step }
  const texto = (v: number | null): string => formatarDioptria(v, { signed, formato })

  const [digitado, setDigitado] = useState(texto(value))
  const [editando, setEditando] = useState(false)

  // Fora da digitacao, a caixa sempre mostra o valor atual (e muda junto com a preferencia de formato).
  useEffect(() => {
    if (!editando) setDigitado(texto(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, formato, signed, editando])

  function aplicar(novo: number | null): void {
    setDigitado(texto(novo))
    if (novo !== value) onChange(novo)
  }

  function aoSair(): void {
    setEditando(false)
    if (digitado.trim() === '') {
      aplicar(null)
      return
    }
    const lido = interpretarDioptria(digitado, formato)
    // Texto que nao e numero: volta ao que estava, em vez de apagar o valor.
    aplicar(lido === null ? value : normalizarDioptria(lido, limites))
  }

  function mover(direcao: 1 | -1): void {
    if (readOnly || disabled) return
    // Se ha texto digitado ainda nao confirmado, o passo parte dele.
    const lido = editando ? interpretarDioptria(digitado, formato) : value
    aplicar(passoDioptria(lido ?? value, direcao, limites))
  }

  function aoTeclar(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      mover(e.key === 'ArrowUp' ? 1 : -1)
    }
  }

  const bloqueado = readOnly || disabled
  // O "!" da borda de erro e proposital: o `* { border-color }` global do index.css vence as cores de borda do Tailwind.
  const botao = cn(
    'flex h-9 w-8 shrink-0 items-center justify-center border border-[var(--rule-strong)] bg-[var(--surface-2)] text-[var(--ink-2)] transition-colors',
    'hover:bg-[var(--rule)] hover:text-[var(--ink)] focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
    'disabled:pointer-events-none disabled:opacity-40'
  )

  return (
    <div className={cn('flex w-full min-w-0', className)}>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Diminuir"
        disabled={bloqueado}
        onClick={() => mover(-1)}
        className={cn(botao, 'rounded-l-md border-r-0')}
      >
        <ChevronDown className="size-4" />
      </button>
      <input
        id={id}
        aria-label={ariaLabel}
        inputMode="decimal"
        autoComplete="off"
        readOnly={readOnly}
        disabled={disabled}
        placeholder={placeholder ?? texto(0)}
        title={formato === 'inteiro' && !bloqueado ? 'Formato inteiro: digite 125 para +1,25' : undefined}
        value={digitado}
        onFocus={(e) => {
          setEditando(true)
          e.currentTarget.select()
        }}
        onChange={(e) => setDigitado(e.target.value)}
        onBlur={aoSair}
        onKeyDown={aoTeclar}
        className={cn(
          'h-9 w-full min-w-0 border bg-[var(--surface)] px-1.5 text-center font-mono-tab text-sm text-[var(--ink)]',
          'placeholder:text-[var(--ink-3)] focus:z-10 focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-[var(--accent)]',
          invalid ? 'border-[var(--danger)]!' : 'border-[var(--rule-strong)]',
          bloqueado && 'cursor-default bg-[var(--surface-2)] text-[var(--ink-2)]'
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Aumentar"
        disabled={bloqueado}
        onClick={() => mover(1)}
        className={cn(botao, 'rounded-r-md border-l-0')}
      >
        <ChevronUp className="size-4" />
      </button>
    </div>
  )
}
