import { type ReactNode, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { Input } from '@renderer/components/ui/Input'
import { unwrap } from '@renderer/lib/ipc'
import { useDebouncedValue } from '@renderer/lib/useDebouncedValue'
import type { ClienteResumo } from '@shared/types'

interface Props {
  selecionado: ClienteResumo | null
  onSelecionar: (cliente: ClienteResumo | null) => void
}

/** Busca incremental de cliente por nome/CPF/celular - reaproveitada em OS e, depois, em Vendas. */
export function ClienteBuscaInput({ selecionado, onSelecionar }: Props): ReactNode {
  const [busca, setBusca] = useState('')
  const buscaDebounced = useDebouncedValue(busca)

  const resultado = useQuery({
    queryKey: ['clientes', { busca: buscaDebounced, apenasAtivos: true }],
    queryFn: () => unwrap(window.api.clientes.list({ busca: buscaDebounced, apenasAtivos: true })),
    enabled: buscaDebounced.length > 0 && !selecionado
  })

  if (selecionado) {
    return (
      <div className="flex items-center justify-between rounded-md border border-[var(--rule-strong)] bg-[var(--surface-2)] px-3 py-2">
        <div>
          <p className="text-sm font-medium text-[var(--ink)]">{selecionado.nome}</p>
          <p className="text-xs text-[var(--ink-3)]">{selecionado.celular ?? 'sem celular cadastrado'}</p>
        </div>
        <button
          type="button"
          onClick={() => onSelecionar(null)}
          className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--rule)] hover:text-[var(--ink)]"
        >
          <X className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-3)]" />
        <Input
          className="pl-9"
          placeholder="Buscar cliente por nome, CPF ou celular…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {buscaDebounced && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-[var(--rule)] bg-[var(--surface)] shadow-lg">
          {resultado.data?.length ? (
            resultado.data.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onSelecionar(c)
                  setBusca('')
                }}
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
              >
                <span className="font-medium text-[var(--ink)]">{c.nome}</span>
                <span className="text-xs text-[var(--ink-3)]">{c.celular ?? '—'}</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-[var(--ink-3)]">Nenhum cliente encontrado.</p>
          )}
        </div>
      )}
    </div>
  )
}
