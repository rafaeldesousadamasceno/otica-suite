import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { unwrap } from '@renderer/lib/ipc'
import { useAuthStore } from '@renderer/state/authStore'
import { descreverBanner } from '@shared/licenca'

/** Faixa fina, sempre visivel, com a validade da licenca. Some so na propria tela Licenca. */
export function BannerLicenca(): ReactNode {
  const { pathname } = useLocation()
  const perfil = useAuthStore((s) => s.sessao?.usuario.perfil)
  const { data } = useQuery({
    queryKey: ['licenca', 'banner'],
    queryFn: () => unwrap(window.api.licenca.banner()),
    // O main ja guarda 5 min de cache; reconsultar de vez em quando cobre a virada do dia.
    refetchInterval: 10 * 60 * 1000
  })

  if (!data || pathname === '/licenca') return null

  const { tom, texto, acao } = descreverBanner(data, perfil === 'admin')
  const erro = tom === 'erro'
  const Icone = erro ? AlertTriangle : ShieldCheck

  return (
    <div
      role={erro ? 'alert' : 'status'}
      className={`flex items-center gap-2 border-b px-6 py-1.5 text-xs ${
        erro
          ? 'border-[var(--danger)]/30 bg-[var(--danger)]/10 font-medium text-[var(--danger)]'
          : 'border-[var(--rule)] bg-[var(--surface-2)] text-[var(--ink-2)]'
      }`}
    >
      <Icone className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{texto}</span>
      {acao && (
        <Link to="/licenca" className="shrink-0 font-semibold underline underline-offset-2">
          {acao}
        </Link>
      )}
    </div>
  )
}
