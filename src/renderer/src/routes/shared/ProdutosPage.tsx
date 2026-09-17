import { type ReactNode, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, PackagePlus } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { Button } from '@renderer/components/ui/Button'
import { Badge } from '@renderer/components/ui/Badge'
import { unwrap } from '@renderer/lib/ipc'
import { useDebouncedValue } from '@renderer/lib/useDebouncedValue'
import { centavosParaBRL } from '@renderer/lib/dinheiro'
import { ProdutoFormDialog } from '@renderer/components/ProdutoFormDialog'
import { useAuthStore } from '@renderer/state/authStore'
import { possuiPermissao } from '@shared/permissions'
import type { Produto, CategoriaProduto } from '@shared/types'

const ROTULO_CATEGORIA: Record<CategoriaProduto, string> = {
  armacao: 'Armação',
  lente: 'Lente',
  acessorio: 'Acessório',
  servico: 'Serviço'
}

export function ProdutosPage(): ReactNode {
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState<CategoriaProduto | ''>('')
  const [novoOpen, setNovoOpen] = useState(false)
  const [produtoEditando, setProdutoEditando] = useState<Produto | null>(null)
  const buscaDebounced = useDebouncedValue(busca)
  const sessao = useAuthStore((s) => s.sessao)
  const podeEditar = sessao ? possuiPermissao(sessao.usuario.perfil, 'produtos', 'editar') : false
  const podeVerCusto = sessao ? possuiPermissao(sessao.usuario.perfil, 'produtos.custo_margem', 'ver') : false

  const query = { busca: buscaDebounced, categoria, apenasAtivos: true }
  const produtos = useQuery({
    queryKey: ['produtos', query],
    queryFn: () => unwrap(window.api.produtos.list(query))
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[var(--ink)]">Produtos</h1>
        {podeEditar && (
          <Button onClick={() => setNovoOpen(true)}>
            <PackagePlus className="size-4" /> Novo produto
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-3)]" />
          <Input
            className="pl-9"
            placeholder="Descrição, código ou código de barras…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Select className="w-44" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaProduto | '')}>
          <option value="">Todas as categorias</option>
          {Object.entries(ROTULO_CATEGORIA).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </Select>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                <th className="px-4 py-2.5">Descrição</th>
                <th className="px-4 py-2.5">Categoria</th>
                <th className="px-4 py-2.5">Marca</th>
                {podeVerCusto && <th className="px-4 py-2.5 text-right">Custo</th>}
                {podeVerCusto && <th className="px-4 py-2.5 text-right">Margem</th>}
                <th className="px-4 py-2.5 text-right">Preço de venda</th>
              </tr>
            </thead>
            <tbody>
              {produtos.data?.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => podeEditar && setProdutoEditando(p)}
                  className={`border-b border-[var(--rule)] last:border-0 ${podeEditar ? 'cursor-pointer hover:bg-[var(--surface-2)]' : ''}`}
                >
                  <td className="px-4 py-2.5 font-medium text-[var(--ink)]">{p.descricao}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone="neutral">{ROTULO_CATEGORIA[p.categoria]}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--ink-2)]">{p.marca ?? '—'}</td>
                  {podeVerCusto && (
                    <td className="px-4 py-2.5 text-right font-mono-tab text-[var(--ink-2)]">
                      {centavosParaBRL(p.custoCentavos)}
                    </td>
                  )}
                  {podeVerCusto && (
                    <td className="px-4 py-2.5 text-right font-mono-tab text-[var(--ink-2)]">
                      {p.margem !== null ? `${p.margem}%` : '—'}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-right font-mono-tab font-medium text-[var(--ink)]">
                    {centavosParaBRL(p.precoVendaCentavos)}
                  </td>
                </tr>
              ))}

              {produtos.data?.length === 0 && (
                <tr>
                  <td colSpan={podeVerCusto ? 6 : 4} className="px-4 py-8 text-center text-[var(--ink-3)]">
                    Nenhum produto cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ProdutoFormDialog open={novoOpen} onClose={() => setNovoOpen(false)} />
      <ProdutoFormDialog
        open={produtoEditando !== null}
        onClose={() => setProdutoEditando(null)}
        produtoExistente={produtoEditando ?? undefined}
      />
    </div>
  )
}
