import { type ReactNode, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { Button } from '@renderer/components/ui/Button'
import { ClienteBuscaInput } from '@renderer/components/ClienteBuscaInput'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { ordemServicoCreateSchema } from '@shared/ipc'
import { toast } from '@renderer/state/toastStore'
import type { ClienteResumo } from '@shared/types'

interface Props {
  open: boolean
  onClose: () => void
  /** Quando aberto a partir da ficha do cliente, o cliente ja vem travado. */
  clienteFixo?: ClienteResumo
  onCreated?: (osId: number) => void
}

export function OrdemServicoFormDialog({ open, onClose, clienteFixo, onCreated }: Props): ReactNode {
  const queryClient = useQueryClient()
  const [cliente, setCliente] = useState<ClienteResumo | null>(clienteFixo ?? null)
  const [receitaOpticaId, setReceitaOpticaId] = useState('')
  const [laboratorio, setLaboratorio] = useState('')
  const [dataPrevisao, setDataPrevisao] = useState('')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setCliente(clienteFixo ?? null)
      setReceitaOpticaId('')
      setLaboratorio('')
      setDataPrevisao('')
      setObservacao('')
      setErro(null)
    }
  }, [open, clienteFixo])

  const receitas = useQuery({
    queryKey: ['receitas', cliente?.id],
    queryFn: () => unwrap(window.api.receitas.listByCliente({ clienteId: cliente!.id })),
    enabled: Boolean(cliente)
  })

  const laboratorios = useQuery({
    queryKey: ['listaValor', 'laboratorio'],
    queryFn: () => unwrap(window.api.listasValor.listByTipo({ tipo: 'laboratorio' })),
    enabled: open
  })

  const mutation = useMutation({
    mutationFn: async () => {
      if (!cliente) throw new Error('Selecione o cliente.')
      const dados = ordemServicoCreateSchema.parse({
        clienteId: cliente.id,
        receitaOpticaId: receitaOpticaId ? Number(receitaOpticaId) : null,
        laboratorio: laboratorio || null,
        dataPrevisao: dataPrevisao || null,
        observacao: observacao || null
      })
      return unwrap(window.api.ordensServico.create(dados))
    },
    onSuccess: (os) => {
      queryClient.invalidateQueries({ queryKey: ['ordensServico'] })
      queryClient.invalidateQueries({ queryKey: ['ordensServico', 'cliente', cliente?.id] })
      toast.ok(`OS ${os.numero} aberta.`)
      onCreated?.(os.id)
      onClose()
    },
    onError: (err) => {
      setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
    }
  })

  return (
    <Dialog open={open} onClose={onClose} title="Nova Ordem de Serviço">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
      >
        <Field label="Cliente" required>
          {clienteFixo ? (
            <div className="rounded-md border border-[var(--rule-strong)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)]">
              {clienteFixo.nome}
            </div>
          ) : (
            <ClienteBuscaInput selecionado={cliente} onSelecionar={setCliente} />
          )}
        </Field>

        <Field label="Receita óptica vinculada" hint="Opcional - facilita conferir o pedido enviado ao laboratório.">
          <Select
            value={receitaOpticaId}
            onChange={(e) => setReceitaOpticaId(e.target.value)}
            disabled={!cliente || receitas.data?.length === 0}
          >
            <option value="">— nenhuma —</option>
            {receitas.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.dataExame.split('-').reverse().join('/')} · {r.tipoLente ?? 'sem tipo definido'}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Laboratório">
            <Input
              list="laboratorios-sugeridos"
              value={laboratorio}
              onChange={(e) => setLaboratorio(e.target.value)}
            />
            <datalist id="laboratorios-sugeridos">
              {laboratorios.data?.map((l) => (
                <option key={l.id} value={l.valor} />
              ))}
            </datalist>
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

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex justify-end gap-2 border-t border-[var(--rule)] pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={!cliente}>
            Abrir OS
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
