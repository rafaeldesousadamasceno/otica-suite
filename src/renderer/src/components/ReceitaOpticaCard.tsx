import type { ReactNode } from 'react'
import { Card } from '@renderer/components/ui/Card'
import { Badge } from '@renderer/components/ui/Badge'
import type { ReceitaOptica } from '@shared/types'

function fmt(v: number | null, casas = 2): string {
  if (v === null) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

function formatarDataBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

export function ReceitaOpticaCard({ receita }: { receita: ReceitaOptica }): ReactNode {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--rule)] bg-[var(--surface-2)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--ink)]">
            {formatarDataBr(receita.dataExame)}
          </span>
          <Badge tone="accent">versão {receita.versao}</Badge>
        </div>
        {receita.profissionalNome && (
          <span className="text-xs text-[var(--ink-3)]">Dr(a). {receita.profissionalNome}</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-px bg-[var(--rule)] sm:grid-cols-2">
        {(
          [
            ['Longe', receita.longeOdEsf, receita.longeOdCil, receita.longeOdEixo, receita.longeOdDnp,
             receita.longeOeEsf, receita.longeOeCil, receita.longeOeEixo, receita.longeOeDnp],
            ['Perto', receita.pertoOdEsf, receita.pertoOdCil, receita.pertoOdEixo, receita.pertoOdDnp,
             receita.pertoOeEsf, receita.pertoOeCil, receita.pertoOeEixo, receita.pertoOeDnp]
          ] as const
        ).map(([titulo, odEsf, odCil, odEixo, odDnp, oeEsf, oeCil, oeEixo, oeDnp]) => (
          <div key={titulo} className="bg-[var(--surface)] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">{titulo}</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--ink-3)]">
                  <th className="w-8 text-left font-normal"></th>
                  <th className="font-normal">Esf</th>
                  <th className="font-normal">Cil</th>
                  <th className="font-normal">Eixo</th>
                  <th className="font-normal">DNP</th>
                </tr>
              </thead>
              <tbody className="font-mono-tab text-[var(--ink)]">
                <tr>
                  <td className="text-[var(--ink-3)]">OD</td>
                  <td className="text-center">{fmt(odEsf)}</td>
                  <td className="text-center">{fmt(odCil)}</td>
                  <td className="text-center">{odEixo ?? '—'}°</td>
                  <td className="text-center">{fmt(odDnp, 1)}</td>
                </tr>
                <tr>
                  <td className="text-[var(--ink-3)]">OE</td>
                  <td className="text-center">{fmt(oeEsf)}</td>
                  <td className="text-center">{fmt(oeCil)}</td>
                  <td className="text-center">{oeEixo ?? '—'}°</td>
                  <td className="text-center">{fmt(oeDnp, 1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-[var(--rule)] px-4 py-2.5 text-xs text-[var(--ink-2)]">
        <span>Adição: <b className="font-mono-tab text-[var(--ink)]">{fmt(receita.adicao)}</b></span>
        {receita.tipoLente && <span>Lente: <b className="text-[var(--ink)]">{receita.tipoLente}</b></span>}
        {receita.tratamentos && <span>Tratamento: <b className="text-[var(--ink)]">{receita.tratamentos}</b></span>}
        {receita.armacao && <span>Armação: <b className="text-[var(--ink)]">{receita.armacao}</b></span>}
      </div>
      {receita.observacao && (
        <p className="border-t border-[var(--rule)] px-4 py-2.5 text-xs text-[var(--ink-2)]">{receita.observacao}</p>
      )}
    </Card>
  )
}
