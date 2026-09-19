import { type ReactNode, useState } from 'react'
import { ChartTooltip } from './ChartTooltip'
import { formatarBRLCompacto, niceTicks, retanguloTopoArredondado, useElementWidth } from './chartUtils'

export interface SerieColuna {
  nome: string
  /** Variavel CSS da cor (ex.: 'var(--viz-1)'). */
  cor: string
  valores: number[]
}

interface Props {
  categorias: string[]
  /** Titulo do tooltip de cada categoria (ex.: "setembro de 2026"). */
  titulosCategoria: string[]
  series: SerieColuna[]
  formatarValor: (valor: number) => string
  ariaLabel: string
  altura?: number
}

const MARGEM = { topo: 12, direita: 16, base: 26, esquerda: 56 }
const ESPESSURA_MAXIMA = 24
const FOLGA = 2

/**
 * Colunas agrupadas: no maximo 24px de espessura, ponta de cima arredondada
 * (4px) e base reta na linha zero, 2px de respiro entre colunas vizinhas.
 * Cada coluna e o proprio alvo do hover, com uma area de acerto que ocupa a
 * fatia inteira da categoria - nunca so os pixels pintados.
 */
export function ColumnChart({
  categorias,
  titulosCategoria,
  series,
  formatarValor,
  ariaLabel,
  altura = 220
}: Props): ReactNode {
  const [ref, larguraMedida] = useElementWidth<HTMLDivElement>()
  const [ativa, setAtiva] = useState<{ categoria: number; serie: number } | null>(null)

  const largura = Math.max(larguraMedida, 240)
  const x0 = MARGEM.esquerda
  const x1 = largura - MARGEM.direita
  const y0 = MARGEM.topo
  const y1 = altura - MARGEM.base

  const maximo = Math.max(0, ...series.flatMap((s) => s.valores))
  const ticks = niceTicks(maximo)
  const topoEscala = ticks[ticks.length - 1]
  const yEm = (valor: number): number => y1 - (valor / topoEscala) * (y1 - y0)

  const larguraFaixa = (x1 - x0) / categorias.length
  const espessura = Math.min(ESPESSURA_MAXIMA, (larguraFaixa * 0.7 - FOLGA * (series.length - 1)) / series.length)
  const larguraGrupo = espessura * series.length + FOLGA * (series.length - 1)

  const colunaAtiva = ativa ? series[ativa.serie] : null
  const xColunaAtiva = ativa
    ? x0 + ativa.categoria * larguraFaixa + (larguraFaixa - larguraGrupo) / 2 + ativa.serie * (espessura + FOLGA) + espessura / 2
    : 0

  return (
    <div ref={ref} className="relative w-full" style={{ height: altura }}>
      <svg width={largura} height={altura} role="img" aria-label={ariaLabel} className="absolute left-0 top-0 overflow-visible">
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

        {categorias.map((rotulo, c) => {
          const xGrupo = x0 + c * larguraFaixa + (larguraFaixa - larguraGrupo) / 2
          return (
            <g key={rotulo}>
              <text
                x={x0 + c * larguraFaixa + larguraFaixa / 2}
                y={y1 + 16}
                textAnchor="middle"
                fontSize={11}
                style={{ fill: 'var(--ink-3)' }}
              >
                {rotulo}
              </text>

              {series.map((serie, s) => {
                const valor = serie.valores[c]
                const x = xGrupo + s * (espessura + FOLGA)
                const alturaColuna = y1 - yEm(valor)
                const emFoco = ativa?.categoria === c && ativa.serie === s
                return (
                  <g key={serie.nome}>
                    {alturaColuna > 0 && (
                      <path
                        d={retanguloTopoArredondado(x, yEm(valor), espessura, alturaColuna, 4)}
                        style={{ fill: serie.cor, filter: emFoco ? 'brightness(1.12)' : undefined }}
                      />
                    )}
                    <rect
                      x={x - FOLGA / 2}
                      y={y0}
                      width={espessura + FOLGA}
                      height={y1 - y0}
                      fill="transparent"
                      tabIndex={0}
                      role="img"
                      aria-label={`${titulosCategoria[c]}: ${serie.nome} ${formatarValor(valor)}`}
                      className="outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                      onPointerEnter={() => setAtiva({ categoria: c, serie: s })}
                      onPointerLeave={() => setAtiva(null)}
                      onFocus={() => setAtiva({ categoria: c, serie: s })}
                      onBlur={() => setAtiva(null)}
                    />
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>

      {ativa && colunaAtiva && (
        <ChartTooltip
          x={xColunaAtiva}
          y={y0}
          larguraContainer={largura}
          titulo={titulosCategoria[ativa.categoria]}
          linhas={[
            {
              cor: colunaAtiva.cor,
              nome: colunaAtiva.nome,
              valor: formatarValor(colunaAtiva.valores[ativa.categoria])
            }
          ]}
        />
      )}
    </div>
  )
}
