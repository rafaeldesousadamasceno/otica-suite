import { type ReactNode, useEffect, useState } from 'react'
import { cn } from '@renderer/lib/cn'

interface Props {
  /** `null` = vazio. */
  value: number | null
  onChange: (valor: number | null) => void
  /** Casas decimais mostradas e gravadas (mm: 1; prisma: 2; eixo: 0). */
  casas?: number
  /** Multiplos aceitos (DNP: 0,5). O valor digitado vai ao mais proximo ao sair do campo. */
  passo?: number
  /** Sufixo fixo dentro do campo: "mm", "Δ", "°". */
  unidade?: string
  invalid?: boolean
  readOnly?: boolean
  disabled?: boolean
  id?: string
  className?: string
  placeholder?: string
  'aria-label'?: string
  onFocus?: () => void
}

/**
 * Numero decimal com virgula, de tamanho conhecido. NAO limita ao min/max de
 * proposito: o valor fora da faixa precisa ficar a vista, marcado como erro
 * pela validacao, em vez de ser trocado em silencio.
 */
export function NumeroInput({
  value,
  onChange,
  casas = 1,
  passo,
  unidade,
  invalid,
  readOnly,
  disabled,
  id,
  className,
  placeholder,
  onFocus,
  'aria-label': ariaLabel
}: Props): ReactNode {
  const mostrar = (v: number | null): string => (v === null ? '' : v.toFixed(casas).replace('.', ','))
  const [texto, setTexto] = useState(mostrar(value))
  const [editando, setEditando] = useState(false)

  useEffect(() => {
    if (!editando) setTexto(mostrar(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, casas, editando])

  function aoSair(): void {
    setEditando(false)
    const limpo = texto.trim().replace(',', '.')
    if (limpo === '') {
      if (value !== null) onChange(null)
      setTexto('')
      return
    }
    const n = Number(limpo)
    if (!Number.isFinite(n)) {
      setTexto(mostrar(value)) // nao e numero: volta ao que estava
      return
    }
    const arredondado = passo ? Math.round(n / passo) * passo : n
    const novo = Math.round(arredondado * 10 ** casas) / 10 ** casas
    setTexto(mostrar(novo))
    if (novo !== value) onChange(novo)
  }

  const bloqueado = readOnly || disabled
  return (
    <div className={cn('relative w-full min-w-0', className)}>
      <input
        id={id}
        aria-label={ariaLabel}
        inputMode={casas === 0 ? 'numeric' : 'decimal'}
        autoComplete="off"
        readOnly={readOnly}
        disabled={disabled}
        placeholder={placeholder}
        value={texto}
        onFocus={(e) => {
          setEditando(true)
          e.currentTarget.select()
          onFocus?.()
        }}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={aoSair}
        className={cn(
          'h-9 w-full rounded-md border bg-[var(--surface)] px-2 text-center font-mono-tab text-sm text-[var(--ink)]',
          unidade && 'pr-7',
          'placeholder:text-[var(--ink-3)] focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-[var(--accent)]',
          invalid ? 'border-[var(--danger)]!' : 'border-[var(--rule-strong)]',
          bloqueado && 'cursor-default bg-[var(--surface-2)] text-[var(--ink-2)]',
          disabled && 'opacity-60'
        )}
      />
      {unidade && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-3)]">{unidade}</span>}
    </div>
  )
}
