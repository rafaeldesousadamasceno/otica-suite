import { type ReactNode, useState } from 'react'
import { arcoRosca } from '@shared/graficos'

export interface FatiaRosca {
  id: string
  rotulo: string
  valor: number
  /** Variavel CSS da cor. A cor segue a categoria, nunca a posicao na lista. */
  cor: string
}

interface Props {
  fatias: FatiaRosca[]
  formatarValor: (valor: number) => string
  /** Texto grande no centro (o total) e o que ele e. */
  centro: { valor: string; rotulo: string }
  ariaLabel: string
}

const TAMANHO = 168
const RAIO_EXTERNO = 80
const RAIO_INTERNO = 52

/**
 * Rosca com a lista ao lado (cor, nome, valor e %). A lista e a leitura
 * confiavel: a cor sozinha nunca carrega a informacao. Passar o mouse numa
 * fatia (ou na linha da lista) destaca as duas.
 */
export function DonutChart({ fatias, formatarValor, centro, ariaLabel }: Props): ReactNode {
  const [ativa, setAtiva] = useState<string | null>(null)
  const total = fatias.reduce((s, f) => s + f.valor, 0)

  let angulo = 0
  const arcos = fatias.map((f) => {
    const a0 = angulo
    angulo += total > 0 ? (f.valor / total) * Math.PI * 2 : 0
    return { fatia: f, d: arcoRosca(TAMANHO / 2, TAMANHO / 2, RAIO_EXTERNO, RAIO_INTERNO, a0, angulo) }
  })

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={TAMANHO} height={TAMANHO} viewBox={`0 0 ${TAMANHO} ${TAMANHO}`} role="img" aria-label={ariaLabel} className="shrink-0">
        {arcos.map(({ fatia, d }) => (
          <path
            key={fatia.id}
            d={d}
            strokeWidth={2}
            strokeLinejoin="round"
            onPointerEnter={() => setAtiva(fatia.id)}
            onPointerLeave={() => setAtiva(null)}
            style={{
              fill: fatia.cor,
              stroke: 'var(--surface)',
              opacity: ativa && ativa !== fatia.id ? 0.45 : 1,
              transition: 'opacity 120ms'
            }}
          />
        ))}
        <text x={TAMANHO / 2} y={TAMANHO / 2 - 2} textAnchor="middle" fontSize={16} fontWeight={600} style={{ fill: 'var(--ink)' }}>
          {centro.valor}
        </text>
        <text x={TAMANHO / 2} y={TAMANHO / 2 + 14} textAnchor="middle" fontSize={11} style={{ fill: 'var(--ink-3)' }}>
          {centro.rotulo}
        </text>
      </svg>

      <ul className="min-w-48 flex-1">
        {fatias.map((f) => (
          <li
            key={f.id}
            onPointerEnter={() => setAtiva(f.id)}
            onPointerLeave={() => setAtiva(null)}
            className="flex items-center gap-2 border-b border-[var(--rule)] py-1.5 text-sm last:border-0 hover:bg-[var(--surface-2)]"
          >
            <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: f.cor }} />
            <span className="flex-1 truncate text-[var(--ink-2)]">{f.rotulo}</span>
            <span className="font-mono-tab text-[var(--ink)]">{formatarValor(f.valor)}</span>
            <span className="w-12 text-right font-mono-tab text-xs text-[var(--ink-3)]">
              {total > 0 ? `${((f.valor / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
