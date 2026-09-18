import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@renderer/state/authStore'
import { unwrap } from '@renderer/lib/ipc'
import { NAV_ITEMS } from './navConfig'
import { cn } from '@renderer/lib/cn'

export function Sidebar(): ReactNode {
  const sessao = useAuthStore((s) => s.sessao)
  const empresa = useQuery({
    queryKey: ['empresa'],
    queryFn: () => unwrap(window.api.empresa.get())
  })

  if (!sessao) return null
  const items = NAV_ITEMS[sessao.usuario.perfil]

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--rule)] bg-[var(--surface)]">
      <div className="flex items-center gap-3 border-b border-[var(--rule)] px-4 py-4">
        {empresa.data?.logoPath ? (
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden border border-[var(--rule)] bg-[var(--surface-2)]">
            <img src={empresa.data.logoPath} alt="" className="size-full object-cover" />
          </div>
        ) : (
          <div className="flex size-12 shrink-0 items-center justify-center bg-[var(--accent)] text-lg font-bold text-[var(--accent-ink)]">
            {(empresa.data?.nomeFantasia ?? 'O')[0]}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--ink)]">{empresa.data?.nomeFantasia ?? 'OptiAleph'}</p>
          <p className="truncate text-xs text-[var(--ink-3)]">
            {sessao.usuario.perfil === 'admin' ? 'Administrador' : 'Vendedor'}
          </p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[var(--accent)]/12 text-[var(--accent)]'
                  : 'text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]'
              )
            }
          >
            <item.icon className="size-4.5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
