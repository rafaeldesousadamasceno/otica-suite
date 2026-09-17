import { type ReactNode, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Truck, Power } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { Badge } from '@renderer/components/ui/Badge'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { useDebouncedValue } from '@renderer/lib/useDebouncedValue'
import { toast } from '@renderer/state/toastStore'
import { FornecedorFormDialog } from '@renderer/components/FornecedorFormDialog'
import type { Fornecedor } from '@shared/types'

export function FornecedoresPage(): ReactNode {
  const queryClient = useQueryClient()
  const [busca, setBusca] = useState('')
  const [novoOpen, setNovoOpen] = useState(false)
  const [editando, setEditando] = useState<Fornecedor | null>(null)
  const buscaDebounced = useDebouncedValue(busca)

  const fornecedores = useQuery({
    queryKey: ['fornecedores', { busca: buscaDebounced }],
    queryFn: () => unwrap(window.api.fornecedores.list({ busca: buscaDebounced }))
  })

  const setAtivo = useMutation({
    mutationFn: (params: { id: number; ativo: boolean }) => unwrap(window.api.fornecedores.setAtivo(params)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fornecedores'] })
      toast.ok('Fornecedor atualizado.')
    },
    onError: (err) => toast.error(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[var(--ink)]">Fornecedores</h1>
        <Button onClick={() => setNovoOpen(true)}>
          <Truck className="size-4" /> Novo fornecedor
        </Button>
      </div>

      <div className="relative w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-3)]" />
        <Input className="pl-9" placeholder="Razão social ou CNPJ…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                <th className="px-4 py-2.5">Razão social</th>
                <th className="px-4 py-2.5">Contato</th>
                <th className="px-4 py-2.5">Telefone</th>
                <th className="px-4 py-2.5">Prazo</th>
                <th className="px-4 py-2.5">Situação</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {fornecedores.data?.map((f) => (
                <tr
                  key={f.id}
                  onClick={() => setEditando(f)}
                  className="cursor-pointer border-b border-[var(--rule)] last:border-0 hover:bg-[var(--surface-2)]"
                >
                  <td className="px-4 py-2.5 font-medium text-[var(--ink)]">{f.razaoSocial}</td>
                  <td className="px-4 py-2.5 text-[var(--ink-2)]">{f.contato ?? '—'}</td>
                  <td className="px-4 py-2.5 text-[var(--ink-2)]">{f.telefone ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center font-mono-tab text-[var(--ink-2)]">
                    {f.prazoEntregaDias !== null ? `${f.prazoEntregaDias}d` : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={f.ativo ? 'ok' : 'neutral'}>{f.ativo ? 'Ativo' : 'Inativo'}</Badge>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <button
                      type="button"
                      title={f.ativo ? 'Inativar' : 'Reativar'}
                      onClick={(e) => {
                        e.stopPropagation()
                        setAtivo.mutate({ id: f.id, ativo: !f.ativo })
                      }}
                      className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                    >
                      <Power className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}

              {fornecedores.data?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[var(--ink-3)]">
                    Nenhum fornecedor cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <FornecedorFormDialog open={novoOpen} onClose={() => setNovoOpen(false)} />
      <FornecedorFormDialog open={editando !== null} onClose={() => setEditando(null)} fornecedorExistente={editando ?? undefined} />
    </div>
  )
}
