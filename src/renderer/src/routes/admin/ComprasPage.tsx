import { type ReactNode, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ShoppingBag } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { Button } from '@renderer/components/ui/Button'
import { Badge } from '@renderer/components/ui/Badge'
import { unwrap } from '@renderer/lib/ipc'
import { useDebouncedValue } from '@renderer/lib/useDebouncedValue'
import { centavosParaBRL } from '@renderer/lib/dinheiro'
import { CompraFormDialog } from '@renderer/components/CompraFormDialog'
import { CompraDetailDialog } from '@renderer/components/CompraDetailDialog'
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

export function ComprasPage(): ReactNode {
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState<'' | SituacaoCompra>('')
  const [novaOpen, setNovaOpen] = useState(false)
  const [compraSelecionada, setCompraSelecionada] = useState<number | null>(null)
  const buscaDebounced = useDebouncedValue(busca)

  const compras = useQuery({
    queryKey: ['compras', { busca: buscaDebounced, situacao }],
    queryFn: () => unwrap(window.api.compras.list({ busca: buscaDebounced, situacao }))
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[var(--ink)]">Compras</h1>
        <Button onClick={() => setNovaOpen(true)}>
          <ShoppingBag className="size-4" /> Nova compra
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-3)]" />
          <Input className="pl-9" placeholder="Fornecedor ou NF…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select className="w-40" value={situacao} onChange={(e) => setSituacao(e.target.value as '' | SituacaoCompra)}>
          <option value="">Todas as situações</option>
          <option value="ABERTA">Em aberto</option>
          <option value="RECEBIDA">Recebidas</option>
          <option value="CANCELADA">Canceladas</option>
        </Select>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                <th className="px-4 py-2.5">Compra</th>
                <th className="px-4 py-2.5">Fornecedor</th>
                <th className="px-4 py-2.5">Data</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5">Situação</th>
              </tr>
            </thead>
            <tbody>
              {compras.data?.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setCompraSelecionada(c.id)}
                  className="cursor-pointer border-b border-[var(--rule)] last:border-0 hover:bg-[var(--surface-2)]"
                >
                  <td className="px-4 py-2.5 font-mono-tab font-medium text-[var(--accent)]">#{c.id}</td>
                  <td className="px-4 py-2.5 text-[var(--ink)]">{c.fornecedorNome ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono-tab text-[var(--ink-2)]">{formatarDataBr(c.data)}</td>
                  <td className="px-4 py-2.5 text-right font-mono-tab font-medium text-[var(--ink)]">
                    {centavosParaBRL(c.valorTotalCentavos)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={TOM_SITUACAO[c.situacao]}>{c.situacao}</Badge>
                  </td>
                </tr>
              ))}

              {compras.data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--ink-3)]">
                    Nenhuma compra registrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <CompraFormDialog open={novaOpen} onClose={() => setNovaOpen(false)} onCreated={(id) => setCompraSelecionada(id)} />
      <CompraDetailDialog compraId={compraSelecionada} onClose={() => setCompraSelecionada(null)} />
    </div>
  )
}
