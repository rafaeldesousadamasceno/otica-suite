import { type ReactNode, useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { centavosParaBRL, centavosParaTexto, textoParaCentavos } from '@renderer/lib/dinheiro'
import { useConfirm } from '@renderer/lib/confirmar'
import { toast } from '@renderer/state/toastStore'
import { enterAvancaCampo } from '@renderer/lib/enterAvancaCampo'
import { hojeLocal } from '@shared/data'
import { competenciaDeData, competenciaParaTexto, ultimoDiaDaCompetencia } from '@shared/recorrencia'
import type { ContaPagar, Recorrencia } from '@shared/types'

function formatarDataBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

function mensagemDe(err: unknown): string {
  return err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.'
}

function plural(n: number, singular: string, pluralTexto: string): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`
}

// ---------------------------------------------------------------------
// Reajustar valor
// ---------------------------------------------------------------------

interface ReajustarProps {
  recorrencia: Recorrencia | null
  /** Competencia sugerida no campo "A partir de" (padrao: o mes atual). */
  competenciaInicial?: string
  onClose: () => void
}

/**
 * Reajuste: o valor novo vale do mes escolhido em diante. So as contas EM ABERTO mudam; as pagas e as de
 * meses anteriores ficam como estao (o servidor garante isso, a tela so avisa).
 */
export function ReajustarRecorrenciaDialog({ recorrencia, competenciaInicial, onClose }: ReajustarProps): ReactNode {
  const queryClient = useQueryClient()
  const [valorTexto, setValorTexto] = useState('')
  const [aPartirDe, setAPartirDe] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (recorrencia) {
      setValorTexto(centavosParaTexto(recorrencia.valorAtualCentavos))
      setAPartirDe(competenciaInicial ?? competenciaDeData(hojeLocal()))
      setErro(null)
    }
  }, [recorrencia, competenciaInicial])

  const mutation = useMutation({
    mutationFn: () =>
      unwrap(window.api.contasPagar.reajustarRecorrencia({ id: recorrencia!.id, valorCentavos: textoParaCentavos(valorTexto), aPartirDe })),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['contasPagar'] })
      toast.ok(r.afetadas === 0 ? 'Valor reajustado (nenhuma conta em aberto mudou).' : `Valor reajustado: ${plural(r.afetadas, 'conta atualizada', 'contas atualizadas')}.`)
      onClose()
    },
    onError: (err) => setErro(mensagemDe(err))
  })

  if (!recorrencia) return null
  const valor = textoParaCentavos(valorTexto)
  const podeEnviar = valor > 0 && /^\d{4}-\d{2}$/.test(aPartirDe)

  return (
    <Dialog open onClose={onClose} title={`Reajustar valor - ${recorrencia.descricao}`} className="max-w-sm">
      <form
        onKeyDown={enterAvancaCampo}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          setErro(null)
          mutation.mutate()
        }}
      >
        <p className="text-sm text-[var(--ink-2)]">
          Valor atual: <span className="font-mono-tab text-[var(--ink)]">{centavosParaBRL(recorrencia.valorAtualCentavos)}</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Novo valor (R$)" required>
            <Input className="font-mono-tab" value={valorTexto} onChange={(e) => setValorTexto(e.target.value)} autoFocus />
          </Field>
          <Field label="A partir de" required>
            <Input type="month" value={aPartirDe} min={competenciaDeData(recorrencia.dataInicio)} onChange={(e) => setAPartirDe(e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-[var(--ink-3)]">
          O valor novo vale do mês escolhido em diante, nas contas em aberto. Contas já pagas e meses anteriores não mudam.
        </p>
        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={!podeEnviar}>
            Reajustar
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

// ---------------------------------------------------------------------
// Encerrar recorrencia
// ---------------------------------------------------------------------

interface EncerrarProps {
  recorrencia: Recorrencia | null
  onClose: () => void
}

/** Encerrar: data do ultimo vencimento + confirmacao (RG-01). Nada novo e gerado e as contas em aberto depois dela saem. */
export function EncerrarRecorrenciaDialog({ recorrencia, onClose }: EncerrarProps): ReactNode {
  const queryClient = useQueryClient()
  const confirmar = useConfirm()
  const [dataFim, setDataFim] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (recorrencia) {
      setDataFim(ultimoDiaDaCompetencia(competenciaDeData(hojeLocal())))
      setErro(null)
    }
  }, [recorrencia])

  const mutation = useMutation({
    mutationFn: () => unwrap(window.api.contasPagar.encerrarRecorrencia({ id: recorrencia!.id, dataFim })),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['contasPagar'] })
      toast.ok(r.afetadas === 0 ? 'Recorrência encerrada.' : `Recorrência encerrada: ${plural(r.afetadas, 'conta em aberto removida', 'contas em aberto removidas')}.`)
      onClose()
    },
    onError: (err) => setErro(mensagemDe(err))
  })

  async function pedirEncerrar(): Promise<void> {
    if (!recorrencia) return
    setErro(null)
    const ok = await confirmar({
      titulo: 'Encerrar recorrência?',
      mensagem: `${recorrencia.descricao}: o último vencimento passa a ser ${formatarDataBr(dataFim)}. As contas em aberto que vencem depois dessa data serão removidas e nada novo será lançado. Contas pagas ficam como estão.`,
      rotuloConfirmar: 'Encerrar recorrência'
    })
    if (ok) mutation.mutate()
  }

  if (!recorrencia) return null

  return (
    <Dialog open onClose={onClose} title={`Encerrar recorrência - ${recorrencia.descricao}`} className="max-w-sm">
      <form
        onKeyDown={enterAvancaCampo}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void pedirEncerrar()
        }}
      >
        <Field label="Último vencimento" required hint="O que vence depois dessa data e ainda está em aberto sai da lista.">
          <Input type="date" value={dataFim} min={recorrencia.dataInicio} onChange={(e) => setDataFim(e.target.value)} autoFocus />
        </Field>
        <p className="text-xs text-[var(--ink-3)]">
          Para continuar com outro valor ou outro nome depois de encerrar, crie uma nova despesa recorrente (pode ter a mesma categoria).
        </p>
        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="danger" loading={mutation.isPending} disabled={!dataFim}>
            Encerrar recorrência
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

// ---------------------------------------------------------------------
// Editar uma conta recorrente
// ---------------------------------------------------------------------

interface EditarProps {
  conta: ContaPagar | null
  onClose: () => void
}

/** Editar uma conta recorrente em aberto: "somente este" ou "este e os proximos". Nao existe "todos": o passado nao muda. */
export function EditarContaRecorrenteDialog({ conta, onClose }: EditarProps): ReactNode {
  const queryClient = useQueryClient()
  const [valorTexto, setValorTexto] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [escopo, setEscopo] = useState<'SOMENTE_ESTE' | 'ESTE_E_PROXIMOS'>('SOMENTE_ESTE')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (conta) {
      setValorTexto(centavosParaTexto(conta.valorCentavos))
      setVencimento(conta.vencimento)
      setEscopo('SOMENTE_ESTE')
      setErro(null)
    }
  }, [conta])

  const mutation = useMutation({
    mutationFn: () =>
      unwrap(
        window.api.contasPagar.editar({
          id: conta!.id,
          escopo,
          valorCentavos: textoParaCentavos(valorTexto),
          vencimento: escopo === 'SOMENTE_ESTE' ? vencimento : undefined
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contasPagar'] })
      toast.ok(escopo === 'SOMENTE_ESTE' ? 'Conta atualizada.' : 'Valor atualizado nesta conta e nas próximas.')
      onClose()
    },
    onError: (err) => setErro(mensagemDe(err))
  })

  if (!conta) return null
  const podeEnviar = textoParaCentavos(valorTexto) > 0 && (escopo === 'ESTE_E_PROXIMOS' || vencimento.length === 10)

  return (
    <Dialog open onClose={onClose} title={`Editar - ${conta.descricao}`} description={conta.competencia ? `Competência ${competenciaParaTexto(conta.competencia)}` : undefined} className="max-w-md">
      <form
        onKeyDown={enterAvancaCampo}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          setErro(null)
          mutation.mutate()
        }}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-[var(--ink-2)]">O que alterar</legend>
          <label className="flex items-start gap-2 text-sm text-[var(--ink)]">
            <input type="radio" name="escopo" className="mt-1" checked={escopo === 'SOMENTE_ESTE'} onChange={() => setEscopo('SOMENTE_ESTE')} />
            <span>
              Somente este
              <span className="block text-xs text-[var(--ink-3)]">Muda só esta conta (valor e vencimento).</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-[var(--ink)]">
            <input type="radio" name="escopo" className="mt-1" checked={escopo === 'ESTE_E_PROXIMOS'} onChange={() => setEscopo('ESTE_E_PROXIMOS')} />
            <span>
              Este e os próximos
              <span className="block text-xs text-[var(--ink-3)]">Reajusta o valor daqui em diante. O que já passou ou foi pago não muda.</span>
            </span>
          </label>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (R$)" required>
            <Input className="font-mono-tab" value={valorTexto} onChange={(e) => setValorTexto(e.target.value)} autoFocus />
          </Field>
          <Field label="Vencimento" required>
            <Input type="date" value={vencimento} disabled={escopo === 'ESTE_E_PROXIMOS'} onChange={(e) => setVencimento(e.target.value)} />
          </Field>
        </div>
        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}
        <div className="flex justify-end gap-2 border-t border-[var(--rule)] pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={!podeEnviar}>
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
