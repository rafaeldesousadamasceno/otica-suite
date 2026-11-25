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
      <p className="flex flex-wrap items-center gap-x-1 text-xs text-[var(--ink-3)]">
        <Minus className="size-3 shrink-0" />
        <span>Sem base: antes</span>
        <span className="whitespace-nowrap">{formatar(comparado.anterior)}</span>
      </p>
    )
  }
  const igual = Math.abs(pct) < 0.05
  const subiu = pct > 0
  const bom = subiu === maisEBom
  const cor = igual ? 'text-[var(--ink-3)]' : bom ? 'text-[var(--ok)]' : 'text-[var(--danger)]'
  const Seta = igual ? Minus : subiu ? ArrowUp : ArrowDown

  return (
    <p className={`flex flex-wrap items-center gap-x-1 text-xs ${cor}`}>
      <Seta className="size-3 shrink-0" aria-hidden />
      <span className="whitespace-nowrap font-semibold">{igual ? '0%' : pctTexto(pct)}</span>
      <span className="text-[var(--ink-3)]">
        antes <span className="whitespace-nowrap">{formatar(comparado.anterior)}</span>
      </span>
    </p>
  )
}

/**
 * O cartão é um "container": o tamanho da fonte do valor acompanha a largura dele (11% da largura menos 4px, entre 16px
 * e 24px), para um valor de até ~15 caracteres (R$ 1.234.567,89) caber mesmo numa janela estreita. O ícone fica na
 * linha do título, para o valor poder usar a largura toda, e o valor nunca quebra linha (nem no sinal de menos).
 */
export function KpiCard({ icone, rotulo, valor, comparado, formatar, maisEBom = true, explicacao, extra, tom = 'neutro' }: Props): ReactNode {
  return (
    <Card className="@container">
      <CardBody className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <div className={`flex size-8 shrink-0 items-center justify-center rounded-full ${TOM_ICONE[tom]}`}>{icone}</div>
          <p className="flex min-w-0 items-center gap-1.5 text-sm text-[var(--ink-3)]">
            <span className="min-w-0">{rotulo}</span>
            <span title={explicacao} aria-label={explicacao} role="img" className="shrink-0 cursor-help text-[var(--ink-3)]">
              <Info className="size-3.5" />
            </span>
          </p>
        </div>
        <div className="min-w-0">
          <p className="font-mono-tab whitespace-nowrap text-[length:clamp(1rem,calc(11cqw_-_4px),1.5rem)] font-semibold leading-tight text-[var(--ink)]">
            {valor}
          </p>
          {comparado && formatar && <Variacao comparado={comparado} formatar={formatar} maisEBom={maisEBom} />}
          {extra}
        </div>
      </CardBody>
    </Card>
  )
}
