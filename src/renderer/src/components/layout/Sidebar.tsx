import { type ReactNode, useEffect, useId, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useAuthStore } from '@renderer/state/authStore'
import { usePreferenciasStore } from '@renderer/state/preferenciasStore'
import { unwrap } from '@renderer/lib/ipc'
import { NAV_GRUPOS, NAV_RODAPE, type NavGrupo, type NavItem } from './navConfig'
import { cn } from '@renderer/lib/cn'
import { licencaPedeAtencao } from '@shared/licenca'

/** Ponto vermelho de "a licença precisa de atenção". No menu recolhido ele vai para o canto do ícone. */
function PontoLicenca({ recolhido }: { recolhido: boolean }): ReactNode {
  return (
    <span
      role="img"
      aria-label="A licença precisa de atenção"
      className={cn('size-2 shrink-0 rounded-full bg-[var(--danger)]', recolhido ? 'absolute right-2 top-1.5' : 'ml-auto')}
    />
  )
}

function ItemMenu({ item, licencaAlerta, recolhido }: { item: NavItem; licencaAlerta: boolean; recolhido: boolean }): ReactNode {
  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      // Recolhido, só o ícone aparece: o nome vira dica ao passar o mouse e nome acessível.
      title={recolhido ? item.label : undefined}
      aria-label={recolhido ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'relative flex items-center rounded-md py-2 text-sm font-medium transition-colors',
          recolhido ? 'justify-center px-0' : 'gap-2.5 px-3',
          isActive
            ? 'bg-[var(--accent)]/12 text-[var(--accent)]'
            : 'text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]'
        )
      }
    >
      <item.icon className="size-4.5 shrink-0" />
      {!recolhido && item.label}
      {item.alertaLicenca && licencaAlerta && <PontoLicenca recolhido={recolhido} />}
    </NavLink>
  )
}

const tituloGrupo = 'px-3 pb-1 pt-4 text-xs font-medium text-[var(--ink-3)]'
/** Recolhido, o título do grupo dá lugar a um traço fino entre os grupos. */
const divisorRecolhido = 'mt-2 border-t border-[var(--rule)] pt-2'

/**
 * Um grupo do menu. O grupo "recolhível" (Administração) começa fechado e abre sozinho quando a tela atual é uma das
 * dele; fechado, ainda mostra o ponto vermelho se a licença pede atenção, para o aviso não ficar escondido.
 * Com o menu recolhido (só ícones), o grupo recolhível vira um botão de ícone que abre e fecha a lista.
 */
export function GrupoMenu({
  grupo,
  licencaAlerta,
  recolhido = false
}: {
  grupo: NavGrupo
  licencaAlerta: boolean
  recolhido?: boolean
}): ReactNode {
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
        <ItemMenu key={item.path} item={item} licencaAlerta={licencaAlerta} recolhido={recolhido} />
      ))}
    </div>
  )

  if (!grupo.titulo) return itens

  if (!grupo.recolhivel) {
    return (
      <div role="group" aria-label={grupo.titulo} className={recolhido ? divisorRecolhido : undefined}>
        {!recolhido && <p className={tituloGrupo}>{grupo.titulo}</p>}
        {itens}
      </div>
    )
  }

  const avisoEscondido = !aberto && licencaAlerta && grupo.itens.some((i) => i.alertaLicenca)
  const Icone = grupo.icone ?? ChevronRight
  return (
    <div role="group" aria-label={grupo.titulo} className={recolhido ? divisorRecolhido : undefined}>
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={idLista}
        aria-label={recolhido ? grupo.titulo : undefined}
        title={recolhido ? grupo.titulo : undefined}
        onClick={() => setAberto((a) => !a)}
        className={
          recolhido
            ? 'relative flex w-full items-center justify-center rounded-md py-2 text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]'
            : cn(tituloGrupo, 'flex w-full items-center gap-1 rounded-md text-left hover:text-[var(--ink)]')
        }
      >
        {recolhido ? (
          <Icone className="size-4.5" />
        ) : (
          <ChevronRight className={cn('size-3.5 shrink-0 transition-transform', aberto && 'rotate-90')} />
        )}
        {!recolhido && grupo.titulo}
        {avisoEscondido && <PontoLicenca recolhido={recolhido} />}
      </button>
      <div id={idLista} hidden={!aberto}>
        {itens}
      </div>
    </div>
  )
}

export function Sidebar(): ReactNode {
  const sessao = useAuthStore((s) => s.sessao)
  const recolhido = usePreferenciasStore((s) => s.menuRecolhido)
  const setMenuRecolhido = usePreferenciasStore((s) => s.setMenuRecolhido)
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
  const nomeOtica = empresa.data?.nomeFantasia ?? 'OptiAleph'
  const rotuloBotao = recolhido ? 'Expandir menu' : 'Recolher menu'
  const IconeBotao = recolhido ? PanelLeftOpen : PanelLeftClose

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-[var(--rule)] bg-[var(--surface)] transition-[width] duration-150',
        recolhido ? 'w-16' : 'w-60'
      )}
    >
      <div className={cn('flex items-center border-b border-[var(--rule)]', recolhido ? 'justify-center px-2 py-3' : 'gap-3 px-4 py-4')} title={recolhido ? nomeOtica : undefined}>
        {empresa.data?.logoPath ? (
          <div
            className={cn(
              'flex shrink-0 items-center justify-center overflow-hidden border border-[var(--rule)] bg-[var(--surface-2)]',
              recolhido ? 'size-10' : 'size-12'
            )}
          >
            <img src={empresa.data.logoPath} alt="" className="size-full object-cover" />
          </div>
        ) : (
          <div
            className={cn(
              'flex shrink-0 items-center justify-center bg-[var(--accent)] font-bold text-[var(--accent-ink)]',
              recolhido ? 'size-10 text-base' : 'size-12 text-lg'
            )}
          >
            {nomeOtica[0]}
          </div>
        )}
        {!recolhido && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--ink)]">{nomeOtica}</p>
            <p className="truncate text-xs text-[var(--ink-3)]">{perfil === 'admin' ? 'Administrador' : 'Vendedor'}</p>
          </div>
        )}
      </div>

      <nav aria-label="Menu principal" className={cn('flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto', recolhido ? 'p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : 'p-3')}>
        {NAV_GRUPOS[perfil].map((grupo, i) => (
          <GrupoMenu key={grupo.titulo ?? `grupo-${i}`} grupo={grupo} licencaAlerta={licencaAlerta} recolhido={recolhido} />
        ))}
      </nav>

      <div className={cn('flex flex-col gap-0.5 border-t border-[var(--rule)]', recolhido ? 'p-2' : 'p-3')}>
        {NAV_RODAPE[perfil].map((item) => (
          <ItemMenu key={item.path} item={item} licencaAlerta={licencaAlerta} recolhido={recolhido} />
        ))}
        <button
          type="button"
          onClick={() => setMenuRecolhido(!recolhido)}
          aria-label={rotuloBotao}
          title={recolhido ? rotuloBotao : undefined}
          aria-pressed={recolhido}
          className={cn(
            'flex items-center rounded-md py-2 text-sm font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]',
            recolhido ? 'justify-center px-0' : 'gap-2.5 px-3'
          )}
        >
          <IconeBotao className="size-4.5 shrink-0" />
          {!recolhido && rotuloBotao}
        </button>
      </div>
    </aside>
  )
}
