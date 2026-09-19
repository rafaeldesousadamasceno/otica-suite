import { type KeyboardEvent, type PointerEvent, type ReactNode, useState } from 'react'
import { ChartTooltip } from './ChartTooltip'
import { formatarBRLCompacto, niceTicks, useElementWidth } from './chartUtils'

export interface PontoSerie {
  /** Identificador do ponto no eixo X (aqui, a data ISO). */
  chave: string
  valor: number
}

interface Props {
  pontos: PontoSerie[]
  nomeSerie: string
  formatarEixoX: (chave: string) => string
  formatarTitulo: (chave: string) => string
  formatarValor: (valor: number) => string
  ariaLabel: string
  altura?: number
}

const MARGEM = { topo: 12, direita: 16, base: 26, esquerda: 56 }

/**
 * Linha de 2px sobre uma area de ~10% de opacidade, uma unica serie na cor
 * 1. O crosshair "encontra o X": segue o ponteiro e prende no ponto mais
 * proximo; as setas do teclado fazem o mesmo.
 */
export function LineAreaChart({
  pontos,
  nomeSerie,
  formatarEixoX,
  formatarTitulo,
  formatarValor,
  ariaLabel,
  altura = 220
}: Props): ReactNode {
  const [ref, larguraMedida] = useElementWidth<HTMLDivElement>()
  const [ativo, setAtivo] = useState<number | null>(null)

  const largura = Math.max(larguraMedida, 240)
  const x0 = MARGEM.esquerda
  const x1 = largura - MARGEM.direita
  const y0 = MARGEM.topo
  const y1 = altura - MARGEM.base
  const n = pontos.length

  const maximo = Math.max(0, ...pontos.map((p) => p.valor))
  const ticks = niceTicks(maximo)
  const topoEscala = ticks[ticks.length - 1]

  const xEm = (i: number): number => (n === 1 ? (x0 + x1) / 2 : x0 + (i / (n - 1)) * (x1 - x0))
  const yEm = (valor: number): number => y1 - (valor / topoEscala) * (y1 - y0)

  const linha = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'}${xEm(i)},${yEm(p.valor)}`).join(' ')
  const area = `${linha} L${xEm(n - 1)},${y1} L${xEm(0)},${y1} Z`

  const qtdRotulosX = Math.max(2, Math.min(6, Math.floor((x1 - x0) / 70)))
  const indicesRotulo = [
    ...new Set(Array.from({ length: qtdRotulosX }, (_, k) => Math.round((k * (n - 1)) / (qtdRotulosX - 1))))
  ]

  function aoMoverPonteiro(e: PointerEvent<SVGRectElement>): void {
    const caixa = ref.current?.getBoundingClientRect()
    if (!caixa) return
    const px = e.clientX - caixa.left
    const indice = Math.round(((px - x0) / (x1 - x0)) * (n - 1))
    setAtivo(Math.min(n - 1, Math.max(0, indice)))
  }

  function aoTeclar(e: KeyboardEvent<SVGSVGElement>): void {
    if (e.key === 'ArrowRight') setAtivo((a) => (a === null ? n - 1 : Math.min(n - 1, a + 1)))
    else if (e.key === 'ArrowLeft') setAtivo((a) => (a === null ? n - 1 : Math.max(0, a - 1)))
    else if (e.key === 'Home') setAtivo(0)
    else if (e.key === 'End') setAtivo(n - 1)
    else if (e.key === 'Escape') setAtivo(null)
    else return
    e.preventDefault()
  }

  const pontoAtivo = ativo !== null ? pontos[ativo] : null
  const ultimo = pontos[n - 1]

  return (
    <div ref={ref} className="relative w-full" style={{ height: altura }}>
      <svg
        width={largura}
        height={altura}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={aoTeclar}
        onFocus={() => setAtivo((a) => a ?? n - 1)}
        onBlur={() => setAtivo(null)}
        className="absolute left-0 top-0 overflow-visible rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={x0}
              x2={x1}
              y1={yEm(t)}
              y2={yEm(t)}
              strokeWidth={1}
              style={{ stroke: t === 0 ? 'var(--rule-strong)' : 'var(--rule)' }}
            />
            <text
              x={x0 - 8}
              y={yEm(t)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={11}
              style={{ fill: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}
            >
              {formatarBRLCompacto(t)}
            </text>
          </g>
        ))}

        {indicesRotulo.map((i, k) => (
          <text
            key={pontos[i].chave}
            x={xEm(i)}
            y={y1 + 16}
            textAnchor={k === 0 ? 'start' : k === indicesRotulo.length - 1 ? 'end' : 'middle'}
            fontSize={11}
            style={{ fill: 'var(--ink-3)' }}
          >
            {formatarEixoX(pontos[i].chave)}
          </text>
        ))}

        <path d={area} style={{ fill: 'var(--viz-1)', opacity: 0.1 }} />
        <path
          d={linha}
          fill="none"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ stroke: 'var(--viz-1)' }}
        />

        {ativo === null && (
          <>
            <circle cx={xEm(n - 1)} cy={yEm(ultimo.valor)} r={6} style={{ fill: 'var(--surface)' }} />
            <circle cx={xEm(n - 1)} cy={yEm(ultimo.valor)} r={4} style={{ fill: 'var(--viz-1)' }} />
          </>
        )}

        {ativo !== null && pontoAtivo && (
          <>
            <line
              x1={xEm(ativo)}
              x2={xEm(ativo)}
              y1={y0}
              y2={y1}
              strokeWidth={1}
              style={{ stroke: 'var(--rule-strong)' }}
            />
            <circle cx={xEm(ativo)} cy={yEm(pontoAtivo.valor)} r={6} style={{ fill: 'var(--surface)' }} />
            <circle cx={xEm(ativo)} cy={yEm(pontoAtivo.valor)} r={4} style={{ fill: 'var(--viz-1)' }} />
          </>
        )}

        <rect
          x={x0 - 8}
          y={y0}
          width={x1 - x0 + 16}
          height={y1 - y0 + 8}
          fill="transparent"
          onPointerMove={aoMoverPonteiro}
          onPointerLeave={() => setAtivo(null)}
        />
      </svg>

      {ativo !== null && pontoAtivo && (
        <ChartTooltip
          x={xEm(ativo)}
          y={y0}
          larguraContainer={largura}
          titulo={formatarTitulo(pontoAtivo.chave)}
          linhas={[{ cor: 'var(--viz-1)', nome: nomeSerie, valor: formatarValor(pontoAtivo.valor) }]}
        />
      )}
    </div>
  )
}
