import { type ReactNode, useId } from 'react'
import { DioptriaInput } from '@renderer/components/ui/DioptriaInput'
import { NumeroInput } from '@renderer/components/ui/NumeroInput'
import { Select } from '@renderer/components/ui/Select'
import { IconeOlho } from '@renderer/components/prescricao/IconeOlho'
import { normalizarOlho, type EstadoOlho } from '@renderer/components/prescricao/estado'
import { cn } from '@renderer/lib/cn'
import { formatarDioptria } from '@shared/dioptria'
import { usePreferenciasStore } from '@renderer/state/preferenciasStore'
import { BASES_PRISMA, FAIXAS, ROTULO_BASE_PRISMA, ROTULO_OLHO, calcularPerto, type Olho } from '@shared/prescricao'

interface Props {
  olho: Olho
  valor: EstadoOlho
  onChange: (novo: EstadoOlho) => void
  /** Campos com problema (`Esf`, `Cil`, `Eixo`, `Dnp`, `Alt`, `Prisma`, `BasePrisma`, `Adicao`, `PertoDnp`): borda vermelha. */
  invalidos: ReadonlySet<string>
  /** Perto gravado antes do formato atual, so para mostrar ao lado do calculado. */
  pertoOriginal?: { esf: number | null; cil: number | null; eixo: number | null } | null
}

function Rotulo({ children, htmlFor, destaque }: { children: ReactNode; htmlFor?: string; destaque?: boolean }): ReactNode {
  return (
    <label htmlFor={htmlFor} className={cn('text-xs font-medium', destaque ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]')}>
      {children}
    </label>
  )
}

/**
 * Um olho da prescricao: Longe (digitado), Adicao (digitada) e Perto (calculado, cinza),
 * e embaixo as medidas de montagem. Direito e Esquerdo usam o mesmo bloco, lado a lado.
 */
export function OlhoCard({ olho, valor, onChange, invalidos, pertoOriginal }: Props): ReactNode {
  const id = useId()
  const formato = usePreferenciasStore((s) => s.formatoNumero)
  const nome = ROTULO_OLHO[olho]
  const perto = calcularPerto({ esf: valor.esf, cil: valor.cil, eixo: valor.eixo }, valor.adicao)
  const semCilindro = valor.cil === null || valor.cil === 0
  const mudar = (parcial: Partial<EstadoOlho>): void => onChange(normalizarOlho({ ...valor, ...parcial }))

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-[var(--rule-strong)] bg-[var(--surface)] p-4" aria-label={`Olho ${nome.toLowerCase()}`}>
      <header className="flex items-center gap-3 border-b border-[var(--rule)] pb-3">
        <IconeOlho olho={olho} className="h-9 w-[4.1rem] shrink-0" />
        <h3 className="text-base font-semibold text-[var(--ink)]">{nome}</h3>
        <span className="rounded-full bg-[var(--accent)]/12 px-2 py-0.5 font-mono-tab text-xs font-semibold text-[var(--accent)]">{olho === 'Od' ? 'OD' : 'OE'}</span>
      </header>

      <div className="grid grid-cols-[4.25rem_1fr_1fr_5.5rem] items-end gap-x-2 gap-y-2.5">
        <span />
        <Rotulo htmlFor={`${id}-esf`}>Esférico</Rotulo>
        <Rotulo htmlFor={`${id}-cil`}>Cilíndrico</Rotulo>
        <Rotulo htmlFor={`${id}-eixo`}>Eixo</Rotulo>

        <span className="pb-2 text-sm font-semibold text-[var(--accent)]">Longe</span>
        <DioptriaInput id={`${id}-esf`} aria-label={`${nome}: esférico de longe`} value={valor.esf} min={FAIXAS.esf.min} max={FAIXAS.esf.max} invalid={invalidos.has('Esf')} onChange={(esf) => mudar({ esf })} />
        <DioptriaInput id={`${id}-cil`} aria-label={`${nome}: cilíndrico de longe`} value={valor.cil} min={FAIXAS.cil.min} max={FAIXAS.cil.max} invalid={invalidos.has('Cil')} onChange={(cil) => mudar({ cil })} />
        <NumeroInput id={`${id}-eixo`} aria-label={`${nome}: eixo de longe`} value={valor.eixo} casas={0} unidade="°" disabled={semCilindro} invalid={invalidos.has('Eixo')} onChange={(eixo) => mudar({ eixo })} />

        <label htmlFor={`${id}-adicao`} className="pb-2 text-sm font-semibold text-[var(--ink-2)]">
          Adição
        </label>
        <DioptriaInput id={`${id}-adicao`} aria-label={`${nome}: adição`} signed={false} value={valor.adicao} min={FAIXAS.adicao.min} max={FAIXAS.adicao.max} invalid={invalidos.has('Adicao')} onChange={(adicao) => mudar({ adicao })} />
        <p className="col-span-2 pb-2 text-xs leading-tight text-[var(--ink-3)]">Só altera o esférico de perto.</p>

        <span className="pb-2 text-sm font-semibold text-[var(--accent)]">Perto</span>
        <DioptriaInput aria-label={`${nome}: esférico de perto (calculado)`} readOnly value={perto.esf} onChange={() => {}} />
        <DioptriaInput aria-label={`${nome}: cilíndrico de perto (igual ao de longe)`} readOnly value={perto.cil} onChange={() => {}} />
        <NumeroInput aria-label={`${nome}: eixo de perto (igual ao de longe)`} readOnly value={perto.eixo} casas={0} unidade="°" onChange={() => {}} />
      </div>

      {pertoOriginal && (pertoOriginal.esf !== null || pertoOriginal.cil !== null || pertoOriginal.eixo !== null) && (
        <p className="rounded-md bg-[var(--warn-wash)] px-2.5 py-1.5 text-xs text-[var(--warn)]">
          Perto gravado antes: <b className="font-mono-tab">{formatarDioptria(pertoOriginal.esf, { formato }) || '—'}</b> /{' '}
          <b className="font-mono-tab">{formatarDioptria(pertoOriginal.cil, { formato }) || '—'}</b> ×{' '}
          <b className="font-mono-tab">{pertoOriginal.eixo ?? '—'}°</b>
        </p>
      )}

      <div className="grid grid-cols-3 items-end gap-x-2 gap-y-2.5 border-t border-[var(--rule)] pt-3">
        <div className="flex flex-col gap-1">
          <Rotulo htmlFor={`${id}-dnp`} destaque>
            DNP longe <span className="text-[var(--danger)]">*</span>
          </Rotulo>
          <NumeroInput id={`${id}-dnp`} aria-label={`${nome}: DNP de longe`} value={valor.dnp} casas={1} passo={0.5} unidade="mm" invalid={invalidos.has('Dnp')} onChange={(dnp) => mudar({ dnp })} />
        </div>
        <div className="flex flex-col gap-1">
          <Rotulo htmlFor={`${id}-alt`}>Altura</Rotulo>
          <NumeroInput id={`${id}-alt`} aria-label={`${nome}: altura de montagem`} value={valor.alt} casas={1} passo={0.5} unidade="mm" invalid={invalidos.has('Alt')} onChange={(alt) => mudar({ alt })} />
        </div>
        <div className="flex flex-col gap-1">
          <Rotulo htmlFor={`${id}-dnpp`}>DNP perto</Rotulo>
          <NumeroInput id={`${id}-dnpp`} aria-label={`${nome}: DNP de perto`} value={valor.dnpPerto} casas={1} passo={0.5} unidade="mm" invalid={invalidos.has('PertoDnp')} onChange={(dnpPerto) => mudar({ dnpPerto })} />
        </div>
        <div className="flex flex-col gap-1">
          <Rotulo htmlFor={`${id}-prisma`}>Prisma</Rotulo>
          <NumeroInput id={`${id}-prisma`} aria-label={`${nome}: prisma`} value={valor.prisma} casas={2} unidade="Δ" invalid={invalidos.has('Prisma')} onChange={(prisma) => mudar({ prisma })} />
        </div>
        <div className="col-span-2 flex flex-col gap-1">
          <Rotulo htmlFor={`${id}-base`}>Base do prisma</Rotulo>
          <Select
            id={`${id}-base`}
            aria-label={`${nome}: base do prisma`}
            value={valor.basePrisma}
            disabled={valor.prisma === null || valor.prisma === 0}
            invalid={invalidos.has('BasePrisma')}
            className={invalidos.has('BasePrisma') ? 'border-[var(--danger)]!' : undefined}
            onChange={(e) => mudar({ basePrisma: e.target.value as EstadoOlho['basePrisma'] })}
          >
            {BASES_PRISMA.map((b) => (
              <option key={b} value={b}>
                {ROTULO_BASE_PRISMA[b]}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </section>
  )
}
