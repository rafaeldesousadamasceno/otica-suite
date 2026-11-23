import { type ReactNode, useState } from 'react'
import { Field } from '@renderer/components/ui/Field'
import { NumeroInput } from '@renderer/components/ui/NumeroInput'
import { SecaoRecolhivel } from '@renderer/components/ui/SecaoRecolhivel'
import { ArmacaoIlustracao } from '@renderer/components/prescricao/ArmacaoIlustracao'
import { ORIENTACAO_MEDIDAS } from '@renderer/components/prescricao/orientacaoMedidas'
import { cn } from '@renderer/lib/cn'
import { GRADE_MEDIDAS, MEDIDAS_ARMACAO, resumoMedidas, validarMedidaArmacao, type MedidaArmacao } from '@shared/prescricao'

export type Medidas = Record<MedidaArmacao, number | null>

interface Props {
  medidas: Medidas
  onChange: (medidas: Medidas) => void
}

/** Moldura branca fixa: o desenho e feito para fundo claro, tambem no tema escuro. */
function Moldura({ children, className }: { children: ReactNode; className?: string }): ReactNode {
  return <div className={cn('rounded-md border border-[var(--rule)] bg-white p-2', className)}>{children}</div>
}

/** Sanfona "Medidas da armacao (opcional)" com o painel de como medir cada parte. */
export function MedidasArmacao({ medidas, onChange }: Props): ReactNode {
  const [aberta, setAberta] = useState(false)
  const [foco, setFoco] = useState<MedidaArmacao | null>(null)

  const erros = Object.fromEntries(MEDIDAS_ARMACAO.map((m) => [m, validarMedidaArmacao(m, medidas[m])])) as Record<MedidaArmacao, string | null>
  const mensagens = MEDIDAS_ARMACAO.map((m) => erros[m]).filter((e): e is string => e !== null)
  const resumo = resumoMedidas(medidas)
  const orientacao = foco ? ORIENTACAO_MEDIDAS[foco] : null

  return (
    <SecaoRecolhivel
      titulo="Medidas da armação (opcional)"
      resumo={resumo || undefined}
      aberta={aberta}
      onAlternar={(a) => {
        setAberta(a)
        if (!a) setFoco(null)
      }}
      comErro={mensagens.length > 0}
    >
      <div className="flex flex-col gap-4">
        {/* Painel de orientacao: sem campo em foco mostra a armacao base; com foco, definicao, erros e imagens. */}
        {orientacao && foco ? (
          <div className="flex flex-col gap-3" aria-live="polite">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_16rem]">
              <div className="flex flex-col gap-3">
                <p className="text-sm font-bold text-[var(--ink)]">{orientacao.definicao}</p>
                <div className="rounded-md border border-[var(--rule)] bg-[var(--surface-2)] p-3">
                  <p className="mb-2 text-sm font-semibold text-[var(--ink)]">Erros comuns que devem ser evitados</p>
                  <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-[var(--ink-2)]">
                    {orientacao.erros.map((erro, i) => (
                      <li key={i}>
                        {erro} <span className="whitespace-nowrap font-medium text-[var(--danger)]">(imagem {i + 1})</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
              <figure className="flex flex-col gap-1">
                <Moldura>
                  <ArmacaoIlustracao medida={foco} variante="correto" className="w-full" />
                </Moldura>
                <figcaption className="text-center text-xs font-medium text-[#2E7D32]">Correto</figcaption>
              </figure>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(['erro1', 'erro2', 'erro3'] as const).map((v, i) => (
                <figure key={v} className="flex flex-col gap-1">
                  <Moldura>
                    <ArmacaoIlustracao medida={foco} variante={v} className="w-full" />
                  </Moldura>
                  <figcaption className="text-center text-xs font-medium text-[var(--danger)]">Imagem {i + 1}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Moldura className="w-60 shrink-0">
              <ArmacaoIlustracao className="w-full" />
            </Moldura>
            <p className="text-sm text-[var(--ink-3)]">Clique em um dos campos abaixo para ver como medir e os erros mais comuns.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {MEDIDAS_ARMACAO.map((m) => (
            <Field key={m} label={GRADE_MEDIDAS[m].rotulo} error={erros[m] ?? undefined}>
              <NumeroInput
                aria-label={GRADE_MEDIDAS[m].rotulo}
                value={medidas[m]}
                casas={1}
                unidade="mm"
                invalid={erros[m] !== null}
                onFocus={() => setFoco(m)}
                onChange={(v) => onChange({ ...medidas, [m]: v })}
              />
            </Field>
          ))}
        </div>
      </div>
    </SecaoRecolhivel>
  )
}
