import { type ReactNode, useEffect, useId, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { useAuthStore } from '@renderer/state/authStore'
import { unwrap } from '@renderer/lib/ipc'
import { NAV_GRUPOS, NAV_RODAPE, type NavGrupo, type NavItem } from './navConfig'
import { cn } from '@renderer/lib/cn'
import { licencaPedeAtencao } from '@shared/licenca'

function ItemMenu({ item, licencaAlerta }: { item: NavItem; licencaAlerta: boolean }): ReactNode {
  return (
    <NavLink
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
      {item.alertaLicenca && licencaAlerta && (
        <span
          role="img"
          aria-label="A licença precisa de atenção"
          className="ml-auto size-2 shrink-0 rounded-full bg-[var(--danger)]"
        />
      )}
    </NavLink>
  )
}

const tituloGrupo = 'px-3 pb-1 pt-4 text-xs font-medium text-[var(--ink-3)]'

/**
 * Um grupo do menu. O grupo "recolhível" (Administração) começa fechado e abre sozinho quando a tela atual é uma das
 * dele; fechado, ainda mostra o ponto vermelho se a licença pede atenção, para o aviso não ficar escondido.
 */
export function GrupoMenu({ grupo, licencaAlerta }: { grupo: NavGrupo; licencaAlerta: boolean }): ReactNode {
  const { pathname } = useLocation()
  const idLista = useId()
  const contemTelaAtual = grupo.itens.some((i) => (i.path === '/' ? pathname === '/' : pathname === i.path || pathname.startsWith(`${i.path}/`)))
  const [aberto, setAberto] = useState(contemTelaAtual)

  useEffect(() => {
    if (contemTelaAtual) setAberto(true)
  }, [contemTelaAtual])

  const itens = (
    <div className="flex flex-col gap-0.5">
      {grupo.itens.map((item) => (
        <ItemMenu key={item.path} item={item} licencaAlerta={licencaAlerta} />
      ))}
    </div>
  )

  if (!grupo.titulo) return itens

  if (!grupo.recolhivel) {
    return (
      <div role="group" aria-label={grupo.titulo}>
        <p className={tituloGrupo}>{grupo.titulo}</p>
        {itens}
      </div>
    )
  }

  const avisoEscondido = !aberto && licencaAlerta && grupo.itens.some((i) => i.alertaLicenca)
  return (
    <div role="group" aria-label={grupo.titulo}>
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={idLista}
        onClick={() => setAberto((a) => !a)}
        className={cn(tituloGrupo, 'flex w-full items-center gap-1 rounded-md text-left hover:text-[var(--ink)]')}
      >
        <ChevronRight className={cn('size-3.5 shrink-0 transition-transform', aberto && 'rotate-90')} />
        {grupo.titulo}
        {avisoEscondido && (
          <span
            role="img"
            aria-label="A licença precisa de atenção"
            className="ml-auto size-2 shrink-0 rounded-full bg-[var(--danger)]"
          />
        )}
      </button>
      <div id={idLista} hidden={!aberto}>
        {itens}
      </div>
    </div>
  )
}

export function Sidebar(): ReactNode {
  const sessao = useAuthStore((s) => s.sessao)
  const empresa = useQuery({
    queryKey: ['empresa'],
    queryFn: () => unwrap(window.api.empresa.get())
  })

  // Mesma chave da tela Licenca: ao ativar uma chave nova o ponto some junto.
  const licenca = useQuery({
    queryKey: ['licencaStatus'],
    queryFn: () => unwrap(window.api.licenca.status()),
    enabled: sessao?.usuario.perfil === 'admin',
    // O main guarda 5 min de cache; reconsultar cobre a virada do dia com o app aberto.
    refetchInterval: 10 * 60 * 1000
  })

  if (!sessao) return null
  const licencaAlerta = licenca.data ? licencaPedeAtencao(licenca.data.estado) : false
  const perfil = sessao.usuario.perfil

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
          <p className="truncate text-xs text-[var(--ink-3)]">{perfil === 'admin' ? 'Administrador' : 'Vendedor'}</p>
        </div>
      </div>

      <nav aria-label="Menu principal" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        {NAV_GRUPOS[perfil].map((grupo, i) => (
          <GrupoMenu key={grupo.titulo ?? `grupo-${i}`} grupo={grupo} licencaAlerta={licencaAlerta} />
        ))}
      </nav>

      <div className="flex flex-col gap-0.5 border-t border-[var(--rule)] p-3">
        {NAV_RODAPE[perfil].map((item) => (
          <ItemMenu key={item.path} item={item} licencaAlerta={licencaAlerta} />
        ))}
      </div>
    </aside>
  )
}
