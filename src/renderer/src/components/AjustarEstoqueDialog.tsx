import { type ReactNode, useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck } from 'lucide-react'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { toast } from '@renderer/state/toastStore'
import type { EstoqueItem } from '@shared/types'

interface Props {
  item: EstoqueItem | null
  onClose: () => void
}

/** RF-08: inventario - contagem fisica comparada ao saldo do sistema, gera o ajuste. */
export function AjustarEstoqueDialog({ item, onClose }: Props): ReactNode {
  const queryClient = useQueryClient()
  const [saldoContado, setSaldoContado] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (item) {
      setSaldoContado(String(item.saldo))
      setMotivo('')
      setErro(null)
    }
  }, [item])

  const mutation = useMutation({
    mutationFn: () =>
      unwrap(
        window.api.estoque.ajustar({
          produtoId: item!.produtoId,
          saldoContado: Number(saldoContado || '0'),
          motivo
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estoque'] })
      toast.ok('Estoque ajustado.')
      onClose()
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  if (!item) return null
  const delta = Number(saldoContado || '0') - item.saldo

  return (
    <Dialog open onClose={onClose} title={`Ajustar estoque - ${item.descricao}`} className="max-w-sm">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          setErro(null)
          mutation.mutate()
        }}
      >
        <p className="text-sm text-[var(--ink-2)]">
          Saldo no sistema: <span className="font-mono-tab text-[var(--ink)]">{item.saldo}</span>
        </p>

        <Field label="Saldo contado" required>
          <Input className="font-mono-tab" value={saldoContado} onChange={(e) => setSaldoContado(e.target.value)} autoFocus required />
        </Field>

        {delta !== 0 && (
          <p className={`text-sm ${delta > 0 ? 'text-[var(--ok)]' : 'text-[var(--danger)]'}`}>
            Movimentação de ajuste: {delta > 0 ? '+' : ''}
            {delta}
          </p>
        )}

        <Field label="Motivo" required>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Contagem de inventário, quebra…" />
        </Field>

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={!motivo.trim() || saldoContado === ''}>
            <ClipboardCheck className="size-4" /> Confirmar ajuste
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
