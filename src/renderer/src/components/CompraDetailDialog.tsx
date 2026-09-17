import { type ReactNode, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PackageCheck, Ban } from 'lucide-react'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Badge } from '@renderer/components/ui/Badge'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { centavosParaBRL } from '@renderer/lib/dinheiro'
import { toast } from '@renderer/state/toastStore'
import type { SituacaoCompra } from '@shared/types'

function formatarDataBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

const TOM_SITUACAO: Record<SituacaoCompra, 'ok' | 'warn' | 'danger'> = {
  RECEBIDA: 'ok',
  ABERTA: 'warn',
  CANCELADA: 'danger'
}

interface Props {
  compraId: number | null
  onClose: () => void
}

export function CompraDetailDialog({ compraId, onClose }: Props): ReactNode {
  const queryClient = useQueryClient()
  const [vencimento, setVencimento] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const compra = useQuery({
    queryKey: ['compra', compraId],
    queryFn: () => unwrap(window.api.compras.get({ id: compraId! })),
    enabled: compraId !== null
  })

  useEffect(() => {
    setVencimento(new Date().toISOString().slice(0, 10))
    setErro(null)
  }, [compraId])

  function invalidarTudo(): void {
    queryClient.invalidateQueries({ queryKey: ['compras'] })
    queryClient.invalidateQueries({ queryKey: ['compra', compraId] })
    queryClient.invalidateQueries({ queryKey: ['estoque'] })
    queryClient.invalidateQueries({ queryKey: ['contasPagar'] })
    queryClient.invalidateQueries({ queryKey: ['produtos'] })
  }

  const confirmarEntrada = useMutation({
    mutationFn: () => unwrap(window.api.compras.confirmarEntrada({ id: compraId!, vencimentoContaPagar: vencimento })),
    onSuccess: () => {
      invalidarTudo()
      toast.ok('Entrada de mercadoria confirmada.')
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  const cancelar = useMutation({
    mutationFn: () => unwrap(window.api.compras.cancelar({ id: compraId! })),
    onSuccess: () => {
      invalidarTudo()
      toast.ok('Compra cancelada.')
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  if (compraId === null || !compra.data) return null
  const c = compra.data

  return (
    <Dialog open onClose={onClose} title={`Compra #${c.id}`} className="max-w-xl">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--ink)]">{c.fornecedorNome ?? 'Sem fornecedor'}</p>
            <p className="text-xs text-[var(--ink-3)]">
              {formatarDataBr(c.data)}
              {c.numeroNf ? ` · NF ${c.numeroNf}` : ''}
            </p>
          </div>
          <Badge tone={TOM_SITUACAO[c.situacao]}>{c.situacao}</Badge>
        </div>

        <div className="overflow-hidden rounded-md border border-[var(--rule)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-xs text-[var(--ink-3)]">
                <th className="px-2 py-1.5 text-left">Produto</th>
                <th className="px-2 py-1.5">Qtd</th>
                <th className="px-2 py-1.5 text-right">Custo un.</th>
              </tr>
            </thead>
            <tbody>
              {c.itens.map((it) => (
                <tr key={it.id} className="border-b border-[var(--rule)] last:border-0">
                  <td className="px-2 py-1.5 text-[var(--ink)]">{it.produtoDescricao}</td>
                  <td className="px-2 py-1.5 text-center font-mono-tab text-[var(--ink-2)]">{it.quantidade}</td>
                  <td className="px-2 py-1.5 text-right font-mono-tab text-[var(--ink)]">
                    {centavosParaBRL(it.custoUnitarioCentavos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end text-sm">
          <p className="font-mono-tab text-base font-semibold text-[var(--accent)]">{centavosParaBRL(c.valorTotalCentavos)}</p>
        </div>

        {c.situacao === 'ABERTA' && (
          <div className="flex flex-col gap-3 border-t border-[var(--rule)] pt-4">
            <Field label="Vencimento do pagamento (conta a pagar gerada na entrada)" required>
              <Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="danger" loading={cancelar.isPending} onClick={() => cancelar.mutate()}>
                <Ban className="size-4" /> Cancelar compra
              </Button>
              <Button loading={confirmarEntrada.isPending} disabled={!vencimento} onClick={() => confirmarEntrada.mutate()}>
                <PackageCheck className="size-4" /> Confirmar entrada
              </Button>
            </div>
          </div>
        )}

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}
      </div>
    </Dialog>
  )
}
