import { type ReactNode, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Ban, Printer, Save } from 'lucide-react'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Badge } from '@renderer/components/ui/Badge'
import { Button } from '@renderer/components/ui/Button'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { toast } from '@renderer/state/toastStore'
import { TOM_SITUACAO_OS } from '@renderer/lib/situacaoOSTone'
import { podeCancelar, rotuloAvanco } from '@shared/situacaoOS'
import { ordemServicoCancelarSchema, ordemServicoAtualizarDatasSchema } from '@shared/ipc'

function formatarDataBr(iso: string | null): string {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

interface Props {
  osId: number | null
  onClose: () => void
}

export function OrdemServicoDetailDialog({ osId, onClose }: Props): ReactNode {
  const queryClient = useQueryClient()
  const [laboratorio, setLaboratorio] = useState('')
  const [dataPrevisao, setDataPrevisao] = useState('')
  const [observacao, setObservacao] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const os = useQuery({
    queryKey: ['ordemServico', osId],
    queryFn: () => unwrap(window.api.ordensServico.get({ id: osId! })),
    enabled: osId !== null
  })

  useEffect(() => {
    if (os.data) {
      setLaboratorio(os.data.laboratorio ?? '')
      setDataPrevisao(os.data.dataPrevisao ?? '')
      setObservacao(os.data.observacao ?? '')
      setCancelando(false)
      setMotivoCancelamento('')
      setErro(null)
    }
  }, [os.data])

  function invalidarTudo(): void {
    queryClient.invalidateQueries({ queryKey: ['ordensServico'] })
    queryClient.invalidateQueries({ queryKey: ['ordemServico', osId] })
  }

  const avancar = useMutation({
    mutationFn: () => unwrap(window.api.ordensServico.avancarSituacao({ id: osId!, data: null })),
    onSuccess: (atualizada) => {
      invalidarTudo()
      toast.ok(`OS agora está "${atualizada.situacao}".`)
    },
    onError: (err) => toast.error(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  const cancelar = useMutation({
    mutationFn: () =>
      unwrap(
        window.api.ordensServico.cancelar(
          ordemServicoCancelarSchema.parse({ id: osId!, motivo: motivoCancelamento })
        )
      ),
    onSuccess: () => {
      invalidarTudo()
      toast.ok('OS cancelada.')
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  const imprimir = useMutation({
    mutationFn: () => unwrap(window.api.relatorios.ordemServico({ id: osId! })),
    onSuccess: (resultado) => {
      if (resultado) toast.ok(`PDF salvo em ${resultado.caminho}`)
    },
    onError: (err) => toast.error(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  const salvarDados = useMutation({
    mutationFn: () =>
      unwrap(
        window.api.ordensServico.atualizarDatas(
          ordemServicoAtualizarDatasSchema.parse({
            id: osId!,
            laboratorio: laboratorio || null,
            dataPrevisao: dataPrevisao || null,
            observacao: observacao || null
          })
        )
      ),
    onSuccess: () => {
      invalidarTudo()
      toast.ok('Dados da OS atualizados.')
    },
    onError: (err) => toast.error(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  if (osId === null) return null
  if (!os.data) return null

  const o = os.data
  const rotulo = rotuloAvanco(o.situacao)

  return (
    <Dialog open onClose={onClose} title={`OS ${o.numero}`} className="max-w-xl">
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--ink)]">{o.clienteNome}</p>
            <p className="text-xs text-[var(--ink-3)]">{o.clienteCelular ?? 'sem celular cadastrado'}</p>
          </div>
          <div className="flex items-center gap-2">
            {o.atrasada && <Badge tone="danger">Atrasada</Badge>}
            <Badge tone={TOM_SITUACAO_OS[o.situacao]}>{o.situacao}</Badge>
            <Button variant="secondary" loading={imprimir.isPending} onClick={() => imprimir.mutate()}>
              <Printer className="size-4" /> Imprimir
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-md border border-[var(--rule)] p-3 text-xs sm:grid-cols-4">
          <div>
            <p className="text-[var(--ink-3)]">Abertura</p>
            <p className="font-mono-tab text-[var(--ink)]">{formatarDataBr(o.dataAbertura)}</p>
          </div>
          <div>
            <p className="text-[var(--ink-3)]">Envio</p>
            <p className="font-mono-tab text-[var(--ink)]">{formatarDataBr(o.dataEnvio)}</p>
          </div>
          <div>
            <p className="text-[var(--ink-3)]">Chegada</p>
            <p className="font-mono-tab text-[var(--ink)]">{formatarDataBr(o.dataChegada)}</p>
          </div>
          <div>
            <p className="text-[var(--ink-3)]">Entrega</p>
            <p className="font-mono-tab text-[var(--ink)]">{formatarDataBr(o.dataEntrega)}</p>
          </div>
        </div>

        {!cancelando ? (
          <div className="flex flex-wrap gap-2">
            {rotulo && (
              <Button loading={avancar.isPending} onClick={() => avancar.mutate()}>
                <ArrowRight className="size-4" /> {rotulo}
              </Button>
            )}
            {podeCancelar(o.situacao) && (
              <Button variant="danger" onClick={() => setCancelando(true)}>
                <Ban className="size-4" /> Cancelar OS
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-md border border-[var(--danger)]/30 bg-[var(--danger-wash)] p-3">
            <Field label="Motivo do cancelamento" required>
              <Input value={motivoCancelamento} onChange={(e) => setMotivoCancelamento(e.target.value)} autoFocus />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCancelando(false)}>
                Voltar
              </Button>
              <Button
                variant="danger"
                loading={cancelar.isPending}
                disabled={!motivoCancelamento.trim()}
                onClick={() => cancelar.mutate()}
              >
                Confirmar cancelamento
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-[var(--rule)] pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">Laboratório e prazo</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Laboratório">
              <Input value={laboratorio} onChange={(e) => setLaboratorio(e.target.value)} />
            </Field>
            <Field label="Previsão de entrega">
              <Input type="date" value={dataPrevisao} onChange={(e) => setDataPrevisao(e.target.value)} />
            </Field>
          </div>
          <Field label="Observações">
            <textarea
              className="min-h-16 w-full rounded-md border border-[var(--rule-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-[var(--accent)]"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </Field>
          <div className="flex justify-end">
            <Button variant="secondary" loading={salvarDados.isPending} onClick={() => salvarDados.mutate()}>
              <Save className="size-4" /> Salvar
            </Button>
          </div>
        </div>

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}
      </div>
    </Dialog>
  )
}
