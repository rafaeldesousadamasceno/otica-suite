import type { ReactNode } from 'react'

export interface BarraItem {
  id: string | number
  rotulo: string
  valor: number
  /** Variavel CSS da cor; omitida = a cor 1 (categorias nominais usam todas a mesma). */
  cor?: string
}

interface Props {
  itens: BarraItem[]
  formatarValor: (valor: number) => string
  ariaLabel: string
}

/**
 * Barras horizontais: 16px de espessura, ponta de dados arredondada (4px) e
 * lado do rotulo reto, valor na ponta de cada barra. A barra nunca ocupa a
 * faixa inteira - a margem direita reservada e o lugar do valor da maior
 * barra, entao o rotulo nunca e cortado.
 */
export function BarChartH({ itens, formatarValor, ariaLabel }: Props): ReactNode {
  const maximo = Math.max(...itens.map((i) => i.valor), 0)

  return (
    <ul role="list" aria-label={ariaLabel} className="flex flex-col gap-2.5">
      {itens.map((item) => {
        const pct = maximo > 0 ? (item.valor / maximo) * 100 : 0
        return (
          <li
            key={item.id}
            title={`${item.rotulo}: ${formatarValor(item.valor)}`}
            className="grid grid-cols-[minmax(84px,132px)_1fr] items-center gap-3 rounded px-1 py-0.5 hover:bg-[var(--surface-2)]"
          >
            <span className="truncate text-sm text-[var(--ink-2)]">{item.rotulo}</span>
            <div className="relative mr-24 h-4">
              <div
                className="absolute inset-y-0 left-0 rounded-r"
                style={{ width: `${pct}%`, backgroundColor: item.cor ?? 'var(--viz-1)' }}
              />
              <span
                className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-xs font-medium text-[var(--ink)]"
                style={{ left: `calc(${pct}% + 8px)`, fontVariantNumeric: 'tabular-nums' }}
              >
                {formatarValor(item.valor)}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
