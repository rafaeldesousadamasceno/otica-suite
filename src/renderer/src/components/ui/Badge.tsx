import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'accent'

const tones: Record<Tone, string> = {
  neutral: 'bg-[var(--surface-2)] text-[var(--ink-2)]',
  ok: 'bg-[var(--ok-wash)] text-[var(--ok)]',
  warn: 'bg-[var(--warn-wash)] text-[var(--warn)]',
  danger: 'bg-[var(--danger-wash)] text-[var(--danger)]',
  accent: 'bg-[var(--accent)]/15 text-[var(--accent)]'
}

interface Props extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

export function Badge({ tone = 'neutral', className, ...props }: Props): ReactNode {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tones[tone],
        className
      )}
      {...props}
    />
  )
}
