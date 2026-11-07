import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CheckCircle2, Info, Lightbulb, OctagonAlert } from 'lucide-react'
import { Card, CardBody } from '@renderer/components/ui/Card'
import type { Insight, SeveridadeInsight } from '@shared/types'

const ESTILO: Record<SeveridadeInsight, { icone: ReactNode; cor: string; rotulo: string }> = {
  critico: { icone: <OctagonAlert className="size-4" />, cor: 'text-[var(--danger)] bg-[var(--danger-wash)]', rotulo: 'Crítico' },
  atencao: { icone: <AlertTriangle className="size-4" />, cor: 'text-[var(--warn)] bg-[var(--warn-wash)]', rotulo: 'Atenção' },
  info: { icone: <Info className="size-4" />, cor: 'text-[var(--ink-2)] bg-[var(--surface-2)]', rotulo: 'Informação' },
  positivo: { icone: <CheckCircle2 className="size-4" />, cor: 'text-[var(--ok)] bg-[var(--ok-wash)]', rotulo: 'Boa notícia' }
}

/** "Insights da Ótica": o que merece atenção, em linguagem direta, cada um levando ao registro. */
export function InsightsCard({ insights }: { insights: Insight[] }): ReactNode {
  const navigate = useNavigate()
  if (insights.length === 0) return null

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--ink)]">
          <Lightbulb className="size-4 text-[var(--warn)]" /> Insights da Ótica
        </h2>
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {insights.map((i) => {
            const estilo = ESTILO[i.severidade]
            const conteudo = (
              <>
                <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${estilo.cor}`} title={estilo.rotulo}>
                  {estilo.icone}
                  <span className="sr-only">{estilo.rotulo}:</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[var(--ink)]">{i.titulo}</span>
                  <span className="block text-xs text-[var(--ink-3)]">{i.detalhe}</span>
                </span>
                {i.link && <ArrowRight className="mt-1 size-4 shrink-0 text-[var(--ink-3)]" />}
              </>
            )
            return (
              <li key={i.id}>
                {i.link ? (
                  <button
                    type="button"
                    onClick={() => navigate(i.link!)}
                    className="flex w-full items-start gap-3 rounded-md border border-[var(--rule)] p-3 text-left transition-colors hover:bg-[var(--surface-2)]"
                  >
                    {conteudo}
                  </button>
                ) : (
                  <div className="flex items-start gap-3 rounded-md border border-[var(--rule)] p-3">{conteudo}</div>
                )}
              </li>
            )
          })}
        </ul>
      </CardBody>
    </Card>
  )
}
