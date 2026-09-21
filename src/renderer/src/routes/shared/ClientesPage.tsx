import { type ReactNode, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search, UserPlus, Cake } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { unwrap } from '@renderer/lib/ipc'
import { useDebouncedValue } from '@renderer/lib/useDebouncedValue'
import { ClienteFormDialog } from '@renderer/components/ClienteFormDialog'

function formatarDataBr(iso: string | null): string {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

const TAMANHO_PAGINA = 200

export function ClientesPage(): ReactNode {
  const [busca, setBusca] = useState('')
  const [novoOpen, setNovoOpen] = useState(false)
  const [limite, setLimite] = useState(TAMANHO_PAGINA)
  const buscaDebounced = useDebouncedValue(busca)
  const navigate = useNavigate()

  const clientes = useQuery({
    queryKey: ['clientes', { busca: buscaDebounced, apenasAtivos: true, limite }],
    queryFn: () => unwrap(window.api.clientes.list({ busca: buscaDebounced, apenasAtivos: true, limite })),
    placeholderData: keepPreviousData
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[var(--ink)]">Clientes</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/aniversariantes')}>
            <Cake className="size-4" />
            Aniversariantes
          </Button>
          <Button onClick={() => setNovoOpen(true)}>
            <UserPlus className="size-4" />
            Novo cliente
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-3)]" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome, CPF ou celular…"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value)
            setLimite(TAMANHO_PAGINA)
          }}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                <th className="px-4 py-2.5">Nome</th>
                <th className="px-4 py-2.5">Celular</th>
                <th className="px-4 py-2.5">CPF</th>
                <th className="px-4 py-2.5">Nascimento</th>
              </tr>
            </thead>
            <tbody>
              {clientes.data?.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/clientes/${c.id}`)}
                  className="cursor-pointer border-b border-[var(--rule)] last:border-0 hover:bg-[var(--surface-2)]"
                >
                  <td className="px-4 py-2.5 font-medium text-[var(--ink)]">{c.nome}</td>
                  <td className="px-4 py-2.5 text-[var(--ink-2)]">{c.celular ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono-tab text-[var(--ink-2)]">{c.cpf ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono-tab text-[var(--ink-2)]">{formatarDataBr(c.dataNasc)}</td>
                </tr>
              ))}

              {clientes.data?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[var(--ink-3)]">
                    {buscaDebounced ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {clientes.data && clientes.data.length >= limite && (
          <div className="flex items-center justify-between gap-3 border-t border-[var(--rule)] px-4 py-3 text-sm text-[var(--ink-2)]">
            <span>Mostrando os primeiros {clientes.data.length} clientes.</span>
            <Button variant="secondary" size="sm" onClick={() => setLimite((l) => l + TAMANHO_PAGINA)}>
              Mostrar mais
            </Button>
          </div>
        )}
      </Card>

      <ClienteFormDialog
        open={novoOpen}
        onClose={() => setNovoOpen(false)}
        onSaved={(cliente) => navigate(`/clientes/${cliente.id}`)}
      />
    </div>
  )
}
