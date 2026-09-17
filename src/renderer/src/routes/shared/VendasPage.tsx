import { type ReactNode, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ShoppingCart } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { Badge } from '@renderer/components/ui/Badge'
import { unwrap } from '@renderer/lib/ipc'
import { useDebouncedValue } from '@renderer/lib/useDebouncedValue'
import { centavosParaBRL } from '@renderer/lib/dinheiro'
import { VendaFormDialog } from '@renderer/components/VendaFormDialog'
import { VendaDetailDialog } from '@renderer/components/VendaDetailDialog'
import { useAuthStore } from '@renderer/state/authStore'

function formatarDataBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

export function VendasPage(): ReactNode {
  const [busca, setBusca] = useState('')
  const [novaOpen, setNovaOpen] = useState(false)
  const [vendaSelecionada, setVendaSelecionada] = useState<number | null>(null)
  const buscaDebounced = useDebouncedValue(busca)
  const sessao = useAuthStore((s) => s.sessao)
  const ehAdmin = sessao?.usuario.perfil === 'admin'

  const vendas = useQuery({
    queryKey: ['vendas', { busca: buscaDebounced }],
    queryFn: () => unwrap(window.api.vendas.list({ busca: buscaDebounced }))
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--ink)]">Vendas</h1>
          {!ehAdmin && <p className="text-sm text-[var(--ink-3)]">Mostrando apenas as suas vendas.</p>}
        </div>
        <Button onClick={() => setNovaOpen(true)}>
          <ShoppingCart className="size-4" /> Nova venda
        </Button>
      </div>

      <div className="relative w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-3)]" />
        <Input
          className="pl-9"
          placeholder="Cliente ou nº da venda…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                <th className="px-4 py-2.5">Nº</th>
                <th className="px-4 py-2.5">Cliente</th>
                {ehAdmin && <th className="px-4 py-2.5">Vendedor(a)</th>}
                <th className="px-4 py-2.5">Data</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5">Situação</th>
              </tr>
            </thead>
            <tbody>
              {vendas.data?.map((v) => (
                <tr
                  key={v.id}
                  onClick={() => setVendaSelecionada(v.id)}
                  className="cursor-pointer border-b border-[var(--rule)] last:border-0 hover:bg-[var(--surface-2)]"
                >
                  <td className="px-4 py-2.5 font-mono-tab font-medium text-[var(--accent)]">{v.numero}</td>
                  <td className="px-4 py-2.5 text-[var(--ink)]">{v.clienteNome}</td>
                  {ehAdmin && <td className="px-4 py-2.5 text-[var(--ink-2)]">{v.vendedorNome}</td>}
                  <td className="px-4 py-2.5 font-mono-tab text-[var(--ink-2)]">{formatarDataBr(v.data)}</td>
                  <td className="px-4 py-2.5 text-right font-mono-tab font-medium text-[var(--ink)]">
                    {centavosParaBRL(v.totalCentavos)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={v.situacao === 'CANCELADA' ? 'danger' : 'ok'}>{v.situacao}</Badge>
                  </td>
                </tr>
              ))}

              {vendas.data?.length === 0 && (
                <tr>
                  <td colSpan={ehAdmin ? 6 : 5} className="px-4 py-8 text-center text-[var(--ink-3)]">
                    Nenhuma venda encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <VendaFormDialog open={novaOpen} onClose={() => setNovaOpen(false)} onCreated={(id) => setVendaSelecionada(id)} />
      <VendaDetailDialog vendaId={vendaSelecionada} onClose={() => setVendaSelecionada(null)} />
    </div>
  )
}
