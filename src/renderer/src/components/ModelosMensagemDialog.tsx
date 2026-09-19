import { type ReactNode, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { toast } from '@renderer/state/toastStore'
import { MOTIVOS_CONTATO } from '@shared/types'
import { PLACEHOLDERS_POR_MOTIVO } from '@shared/whatsapp'
import type { ModelosMensagem, MotivoContato } from '@shared/types'

const ROTULO: Record<MotivoContato, string> = {
  RETIRADA: 'Óculos chegaram (retirada)',
  COBRANCA: 'Parcela vencida (cobrança)',
  ANIVERSARIO: 'Aniversário',
  POS_VENDA: 'Pós-venda',
  RENOVACAO: 'Renovação (novo exame)'
}

interface Props {
  open: boolean
  onClose: () => void
}

/** Administrador: edita o texto que o WhatsApp abre para cada motivo de contato. */
export function ModelosMensagemDialog({ open, onClose }: Props): ReactNode {
  const queryClient = useQueryClient()
  const [texto, setTexto] = useState<ModelosMensagem | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const modelos = useQuery({
    queryKey: ['relacionamentoModelos'],
    queryFn: () => unwrap(window.api.relacionamento.modelosObter()),
    enabled: open
  })

  useEffect(() => {
    if (open && modelos.data) {
      setTexto(modelos.data)
      setErro(null)
    }
  }, [open, modelos.data])

  const salvar = useMutation({
    mutationFn: (t: ModelosMensagem) => unwrap(window.api.relacionamento.modelosSalvar(t)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relacionamentoModelos'] })
      toast.ok('Mensagens salvas.')
      onClose()
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Editar mensagens"
      description="O texto que abre no WhatsApp para cada motivo. Use os campos entre chaves para preencher automaticamente."
      className="max-w-2xl"
    >
      {!texto ? (
        <p className="py-6 text-center text-sm text-[var(--ink-3)]">Carregando…</p>
      ) : (
        <div className="flex flex-col gap-5">
          {MOTIVOS_CONTATO.map((motivo) => (
            <div key={motivo} className="flex flex-col gap-1.5">
              <label htmlFor={`modelo-${motivo}`} className="text-sm font-medium text-[var(--ink-2)]">
                {ROTULO[motivo]}
              </label>
              <textarea
                id={`modelo-${motivo}`}
                value={texto[motivo]}
                onChange={(e) => setTexto({ ...texto, [motivo]: e.target.value })}
                rows={3}
                maxLength={700}
                className="w-full rounded-md border border-[var(--rule-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-[var(--accent)]"
              />
              <p className="text-xs text-[var(--ink-3)]">
                Campos disponíveis:{' '}
                <span className="font-mono-tab">{PLACEHOLDERS_POR_MOTIVO[motivo].join('  ')}</span>
              </p>
            </div>
          ))}

          {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button loading={salvar.isPending} onClick={() => salvar.mutate(texto)}>
              Salvar mensagens
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
