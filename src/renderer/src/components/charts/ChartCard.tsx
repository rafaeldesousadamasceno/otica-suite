import { type ReactNode, useState } from 'react'
import { BarChart3, Table2 } from 'lucide-react'
import { Card, CardBody } from '@renderer/components/ui/Card'
import { cn } from '@renderer/lib/cn'

export interface TabelaDados {
  colunas: string[]
  /** Tudo ja formatado como texto - a primeira coluna e o rotulo, as demais sao numericas. */
  linhas: string[][]
}

export interface LegendaItem {
  nome: string
  cor: string
}

interface Props {
  titulo: string
  icone?: ReactNode
  subtitulo?: string
  /** So aparece com 2 ou mais series: uma serie so ja e nomeada pelo titulo. */
  legenda?: LegendaItem[]
  tabela: TabelaDados
  vazio: boolean
  mensagemVazia: string
  className?: string
  children: ReactNode
}

/**
 * Moldura padrao dos graficos do painel. Todo grafico tem um "gemeo" em
 * tabela (o botao no canto), que e tambem a forma de ler os valores sem
 * depender de hover ou de cor.
 */
export function ChartCard({
  titulo,
  icone,
  subtitulo,
  legenda,
  tabela,
  vazio,
  mensagemVazia,
  className,
  children
}: Props): ReactNode {
  const [emTabela, setEmTabela] = useState(false)
  const mostrarTabela = emTabela && !vazio

  return (
    <Card className={cn('min-w-0', className)}>
      <CardBody className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--ink)]">
              {icone}
              {titulo}
            </h2>
            {subtitulo && <p className="text-xs text-[var(--ink-3)]">{subtitulo}</p>}
          </div>

          {!vazio && (
            <button
              type="button"
              onClick={() => setEmTabela((v) => !v)}
              aria-pressed={emTabela}
              aria-label={emTabela ? `Ver gráfico: ${titulo}` : `Ver dados em tabela: ${titulo}`}
              title={emTabela ? 'Ver gráfico' : 'Ver dados em tabela'}
              className="shrink-0 rounded p-1.5 text-[var(--ink-3)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
            >
              {emTabela ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}
            </button>
          )}
        </div>

        {legenda && legenda.length >= 2 && !mostrarTabela && (
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {legenda.map((item) => (
              <li key={item.nome} className="flex items-center gap-1.5 text-xs text-[var(--ink-2)]">
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: item.cor }} />
                {item.nome}
              </li>
            ))}
          </ul>
        )}

        {vazio ? (
          <p className="py-8 text-center text-sm text-[var(--ink-3)]">{mensagemVazia}</p>
        ) : mostrarTabela ? (
          <div className="max-h-56 overflow-auto rounded-md border border-[var(--rule)]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--surface-2)]">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                  {tabela.colunas.map((coluna, i) => (
                    <th key={coluna} className={`px-3 py-2 ${i > 0 ? 'text-right' : ''}`}>
                      {coluna}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tabela.linhas.map((linha) => (
                  <tr key={linha[0]} className="border-t border-[var(--rule)]">
                    {linha.map((celula, i) => (
                      <td
                        key={`${linha[0]}-${tabela.colunas[i]}`}
                        className={`px-3 py-1.5 ${i > 0 ? 'text-right font-mono-tab text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}
                      >
                        {celula}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </CardBody>
    </Card>
  )
}
