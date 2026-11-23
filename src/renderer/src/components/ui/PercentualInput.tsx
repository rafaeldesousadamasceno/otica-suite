import { type ReactNode, useEffect, useState } from 'react'
import { cn } from '@renderer/lib/cn'
import { percentualParaBp } from '@shared/dinheiro'

interface Props {
  /** Percentual em PONTOS-BASE (8,99% = 899); `null` = vazio. */
  value: number | null
  onChange: (bp: number | null) => void
  /** Maximo em pontos-base (padrao 100% = 10000). */
  max?: number
  invalid?: boolean
  disabled?: boolean
  readOnly?: boolean
  id?: string
  className?: string
  placeholder?: string
  'aria-label'?: string
  autoFocus?: boolean
}

/** 899 -> "8,99"; 1000 -> "10"; 50 -> "0,5": o valor exato, so com as casas que ele tem (o "%" fica no campo). */
export function textoPercentual(bp: number | null): string {
  if (bp === null) return ''
  return (bp / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2, useGrouping: false })
}

/**
 * Percentual com virgula e o simbolo "%" dentro do campo. Guarda em pontos-base (inteiro) para nao ter
 * erro de ponto flutuante em dinheiro. Vazio fica vazio; acima do maximo vai ao maximo ao sair do campo.
 */
export function PercentualInput({
  value,
  onChange,
  max = 10000,
  invalid,
  disabled,
  readOnly,
  id,
  className,
  placeholder,
  autoFocus,
  'aria-label': ariaLabel
}: Props): ReactNode {
  const [texto, setTexto] = useState(textoPercentual(value))
  const [editando, setEditando] = useState(false)

  useEffect(() => {
    if (!editando) setTexto(textoPercentual(value))
  }, [value, editando])

  function aoSair(): void {
    setEditando(false)
    if (texto.trim() === '') {
      if (value !== null) onChange(null)
      setTexto('')
      return
    }
    const bp = percentualParaBp(texto)
    if (bp === null) {
      setTexto(textoPercentual(value)) // nao e numero: volta ao que estava
      return
    }
    const limitado = Math.min(Math.max(bp, 0), max)
    setTexto(textoPercentual(limitado))
    if (limitado !== value) onChange(limitado)
  }

  return (
    <div className={cn('relative w-full min-w-0', className)}>
      <input
        id={id}
        aria-label={ariaLabel}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        readOnly={readOnly}
        disabled={disabled}
        placeholder={placeholder}
        value={texto}
        onFocus={(e) => {
          setEditando(true)
          e.currentTarget.select()
        }}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={aoSair}
        className={cn(
          'h-9 w-full rounded-md border bg-[var(--surface)] pl-2 pr-7 text-center font-mono-tab text-sm text-[var(--ink)]',
          'placeholder:text-[var(--ink-3)] focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-[var(--accent)]',
          invalid ? 'border-[var(--danger)]!' : 'border-[var(--rule-strong)]',
          (readOnly || disabled) && 'cursor-default bg-[var(--surface-2)] text-[var(--ink-2)]',
          disabled && 'opacity-60'
        )}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-3)]">%</span>
    </div>
  )
}
