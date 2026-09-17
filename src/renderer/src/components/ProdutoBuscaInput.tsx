import { type ReactNode, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { Input } from '@renderer/components/ui/Input'
import { unwrap } from '@renderer/lib/ipc'
import { useDebouncedValue } from '@renderer/lib/useDebouncedValue'
import { centavosParaBRL } from '@renderer/lib/dinheiro'
import type { Produto } from '@shared/types'

interface Props {
  onSelecionar: (produto: Produto) => void
}

/** Busca de produto para adicionar ao carrinho da venda - some apos escolher. */
export function ProdutoBuscaInput({ onSelecionar }: Props): ReactNode {
  const [busca, setBusca] = useState('')
  const buscaDebounced = useDebouncedValue(busca)

  const resultado = useQuery({
    queryKey: ['produtos', { busca: buscaDebounced, apenasAtivos: true }],
    queryFn: () => unwrap(window.api.produtos.list({ busca: buscaDebounced, apenasAtivos: true })),
    enabled: buscaDebounced.length > 0
  })

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-3)]" />
      <Input
        className="pl-9"
        placeholder="Buscar produto por descrição ou código…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {buscaDebounced && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-[var(--rule)] bg-[var(--surface)] shadow-lg">
          {resultado.data?.length ? (
            resultado.data.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onSelecionar(p)
                  setBusca('')
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
              >
                <span className="font-medium text-[var(--ink)]">{p.descricao}</span>
                <span className="font-mono-tab text-[var(--ink-3)]">{centavosParaBRL(p.precoVendaCentavos)}</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-[var(--ink-3)]">Nenhum produto encontrado.</p>
          )}
        </div>
      )}
    </div>
  )
}
