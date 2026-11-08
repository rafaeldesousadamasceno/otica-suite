import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, Info, Minus } from 'lucide-react'
import { Card, CardBody } from '@renderer/components/ui/Card'
import { variacaoPct } from '@shared/periodos'
import type { ValorComparado } from '@shared/types'

interface Props {
  icone: ReactNode
  rotulo: string
  valor: ReactNode
  /** Quando ha comparacao: mostra a variacao e o valor anterior. */
  comparado?: ValorComparado
  formatar?: (n: number) => string
  /** Despesa: subir e ruim e cair e bom (as cores da variacao se invertem). */
  maisEBom?: boolean
  /** Explicacao do indicador e da regra de calculo (aparece ao passar o mouse no "i"). */
  explicacao: string
  extra?: ReactNode
  /** Cor do icone: tom do valor (ex.: resultado negativo). */
  tom?: 'neutro' | 'ok' | 'perigo'
}

const TOM_ICONE: Record<NonNullable<Props['tom']>, string> = {
  neutro: 'bg-[var(--accent)]/12 text-[var(--accent)]',
  ok: 'bg-[var(--ok-wash)] text-[var(--ok)]',
  perigo: 'bg-[var(--danger-wash)] text-[var(--danger)]'
}

const pctTexto = (v: number): string => `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

/** Variacao em relacao ao periodo de comparacao, com seta, cor e texto (nunca so a cor). */
function Variacao({
  comparado,
  formatar,
  maisEBom
}: {
  comparado: ValorComparado
  formatar: (n: number) => string
  maisEBom: boolean
}): ReactNode {
  if (comparado.anterior === null) return null
  const pct = variacaoPct(comparado.atual, comparado.anterior)

  if (pct === null) {
    return (
      <p className="flex items-center gap-1 text-xs text-[var(--ink-3)]">
        <Minus className="size-3" /> Sem base: antes {formatar(comparado.anterior)}
      </p>
    )
  }
  const igual = Math.abs(pct) < 0.05
  const subiu = pct > 0
  const bom = subiu === maisEBom
  const cor = igual ? 'text-[var(--ink-3)]' : bom ? 'text-[var(--ok)]' : 'text-[var(--danger)]'
  const Seta = igual ? Minus : subiu ? ArrowUp : ArrowDown

  return (
    <p className={`flex items-center gap-1 text-xs ${cor}`}>
      <Seta className="size-3" aria-hidden />
      <span className="font-semibold">{igual ? '0%' : pctTexto(pct)}</span>
      <span className="text-[var(--ink-3)]">antes {formatar(comparado.anterior)}</span>
    </p>
  )
}

export function KpiCard({ icone, rotulo, valor, comparado, formatar, maisEBom = true, explicacao, extra, tom = 'neutro' }: Props): ReactNode {
  return (
    <Card>
      <CardBody className="flex items-start gap-3.5">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-full ${TOM_ICONE[tom]}`}>{icone}</div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm text-[var(--ink-3)]">
            {rotulo}
            <span title={explicacao} aria-label={explicacao} role="img" className="cursor-help text-[var(--ink-3)]">
              <Info className="size-3.5" />
            </span>
          </p>
          <p className="font-mono-tab text-2xl font-semibold text-[var(--ink)]">{valor}</p>
          {comparado && formatar && <Variacao comparado={comparado} formatar={formatar} maisEBom={maisEBom} />}
          {extra}
        </div>
      </CardBody>
    </Card>
  )
}
