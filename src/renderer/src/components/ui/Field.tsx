import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'

interface Props {
  label: string
  htmlFor?: string
  error?: string
  hint?: string
  required?: boolean
  className?: string
  children: ReactNode
}

/** Campo de formulario padrao: label + controle + erro, sempre no mesmo lugar. */
export function Field({ label, htmlFor, error, hint, required, className, children }: Props): ReactNode {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-[var(--ink-2)]">
        {label}
        {required && <span className="text-[var(--danger)]"> *</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-[var(--danger)]">{error}</p>
      ) : hint ? (
        <p className="text-xs text-[var(--ink-3)]">{hint}</p>
      ) : null}
    </div>
  )
}
