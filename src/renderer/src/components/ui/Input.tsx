import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@renderer/lib/cn'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { className, invalid, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-md border bg-[var(--surface)] px-3 text-sm text-[var(--ink)]',
        'placeholder:text-[var(--ink-3)]',
        'focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-[var(--accent)]',
        'disabled:opacity-50 disabled:bg-[var(--surface-2)]',
        invalid ? 'border-[var(--danger)]' : 'border-[var(--rule-strong)]',
        className
      )}
      {...props}
    />
  )
})
