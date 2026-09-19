import type { ReactNode } from 'react'

export interface TooltipLinha {
  /** Cor da serie - vira um tracinho ao lado do valor (nunca o texto colorido). */
  cor: string
  nome: string
  valor: string
}

interface Props {
  x: number
  y: number
  /** Largura do container do grafico, para virar o tooltip pro lado esquerdo perto da borda direita. */
  larguraContainer: number
  titulo: string
  linhas: TooltipLinha[]
}

/**
 * Tooltip de grafico: o valor lidera (forte), o nome da serie vem depois
 * (secundario). So enriquece - todo valor mostrado aqui tambem existe na
 * visao em tabela do card.
 */
export function ChartTooltip({ x, y, larguraContainer, titulo, linhas }: Props): ReactNode {
  const viraPraEsquerda = x > larguraContainer / 2

  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 min-w-36 rounded-md border border-[var(--rule)] bg-[var(--surface)] px-2.5 py-2 shadow-md"
      style={{
        left: x,
        top: y,
        transform: viraPraEsquerda ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)'
      }}
    >
      <p className="mb-1 text-xs text-[var(--ink-3)]">{titulo}</p>
      <div className="flex flex-col gap-1">
        {linhas.map((l) => (
          <div key={l.nome} className="flex items-center gap-2 text-xs">
            <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: l.cor }} />
            <span className="font-semibold text-[var(--ink)]">{l.valor}</span>
            <span className="text-[var(--ink-2)]">{l.nome}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
