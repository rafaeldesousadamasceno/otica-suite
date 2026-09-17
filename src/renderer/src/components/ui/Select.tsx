import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@renderer/lib/cn'

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { className, invalid, children, ...props },
  ref
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'h-9 w-full appearance-none rounded-md border bg-[var(--surface)] px-3 pr-8 text-sm text-[var(--ink)]',
          'focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-[var(--accent)]',
          'disabled:opacity-50',
          invalid ? 'border-[var(--danger)]' : 'border-[var(--rule-strong)]',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-3)]" />
    </div>
  )
})
