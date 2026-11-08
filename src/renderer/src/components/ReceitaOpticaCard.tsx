import type { ReactNode } from 'react'
import { Card } from '@renderer/components/ui/Card'
import { Badge } from '@renderer/components/ui/Badge'
import { Button } from '@renderer/components/ui/Button'
import { Pencil } from 'lucide-react'
import type { ReceitaOptica } from '@shared/types'

function fmt(v: number | null, casas = 2): string {
  if (v === null) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

function formatarDataBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

export function ReceitaOpticaCard({ receita, onEditar }: { receita: ReceitaOptica; onEditar?: () => void }): ReactNode {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--rule)] bg-[var(--surface-2)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--ink)]">
            {formatarDataBr(receita.dataExame)}
          </span>
          <Badge tone="accent">versão {receita.versao}</Badge>
        </div>
        <div className="flex items-center gap-3">
          {receita.profissionalNome && (
            <span className="text-xs text-[var(--ink-3)]">Dr(a). {receita.profissionalNome}</span>
          )}
          {onEditar && (
            <Button variant="ghost" size="sm" onClick={onEditar} aria-label={`Editar a receita de ${formatarDataBr(receita.dataExame)}`}>
              <Pencil className="size-3.5" /> Editar
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-px bg-[var(--rule)] sm:grid-cols-2">
        {(
          [
            ['Longe', receita.longeOdEsf, receita.longeOdCil, receita.longeOdEixo, receita.longeOdDnp, receita.longeOdDp,
             receita.longeOeEsf, receita.longeOeCil, receita.longeOeEixo, receita.longeOeDnp, receita.longeOeDp],
            ['Perto', receita.pertoOdEsf, receita.pertoOdCil, receita.pertoOdEixo, receita.pertoOdDnp, receita.pertoOdDp,
             receita.pertoOeEsf, receita.pertoOeCil, receita.pertoOeEixo, receita.pertoOeDnp, receita.pertoOeDp]
          ] as const
        ).map(([titulo, odEsf, odCil, odEixo, odDnp, odDp, oeEsf, oeCil, oeEixo, oeDnp, oeDp]) => (
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
                  <th className="font-normal">DP</th>
                </tr>
              </thead>
              <tbody className="font-mono-tab text-[var(--ink)]">
                <tr>
                  <td className="text-[var(--ink-3)]">OD</td>
                  <td className="text-center">{fmt(odEsf)}</td>
                  <td className="text-center">{fmt(odCil)}</td>
                  <td className="text-center">{odEixo ?? '—'}°</td>
                  <td className="text-center">{fmt(odDnp, 1)}</td>
                  <td className="text-center">{fmt(odDp, 1)}</td>
                </tr>
                <tr>
                  <td className="text-[var(--ink-3)]">OE</td>
                  <td className="text-center">{fmt(oeEsf)}</td>
                  <td className="text-center">{fmt(oeCil)}</td>
                  <td className="text-center">{oeEixo ?? '—'}°</td>
                  <td className="text-center">{fmt(oeDnp, 1)}</td>
                  <td className="text-center">{fmt(oeDp, 1)}</td>
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
