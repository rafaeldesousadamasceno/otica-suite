import type { ReactNode } from 'react'
import { CheckCircle2, XCircle, X } from 'lucide-react'
import { useToastStore } from '@renderer/state/toastStore'
import { cn } from '@renderer/lib/cn'

export function Toaster(): ReactNode {
  const { toasts, dismiss } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex items-center gap-2 rounded-md border px-3 py-2 text-sm shadow-lg',
            t.tone === 'ok'
              ? 'border-[var(--ok)]/30 bg-[var(--ok-wash)] text-[var(--ok)]'
              : 'border-[var(--danger)]/30 bg-[var(--danger-wash)] text-[var(--danger)]'
          )}
        >
          {t.tone === 'ok' ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />}
          <span className="text-[var(--ink)]">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="ml-1 opacity-60 hover:opacity-100">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
