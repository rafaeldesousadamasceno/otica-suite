import { type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@renderer/lib/cn'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  className?: string
  children: ReactNode
}

export function Dialog({ open, onClose, title, description, className, children }: Props): ReactNode {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={cn(
          'flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border border-[var(--rule)] bg-[var(--surface)] shadow-xl',
          className
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--rule)] px-5 py-4">
          <div>
            <h2 id="dialog-title" className="text-base font-semibold text-[var(--ink)]">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-[var(--ink-3)]">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-1 text-[var(--ink-3)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body
  )
}
