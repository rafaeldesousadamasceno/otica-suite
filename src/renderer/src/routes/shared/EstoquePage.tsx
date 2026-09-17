import { type ReactNode, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Search, ClipboardEdit, Printer } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { Badge } from '@renderer/components/ui/Badge'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { useDebouncedValue } from '@renderer/lib/useDebouncedValue'
import { AjustarEstoqueDialog } from '@renderer/components/AjustarEstoqueDialog'
import { useAuthStore } from '@renderer/state/authStore'
import { toast } from '@renderer/state/toastStore'
import { possuiPermissao } from '@shared/permissions'
import type { CategoriaProduto, EstoqueItem } from '@shared/types'

const ROTULO_CATEGORIA: Record<CategoriaProduto, string> = {
  armacao: 'Armação',
  lente: 'Lente',
  acessorio: 'Acessório',
  servico: 'Serviço'
}

export function EstoquePage(): ReactNode {
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState<'' | 'armacao' | 'lente' | 'acessorio'>('')
  const [situacao, setSituacao] = useState<'' | 'abaixo_minimo' | 'zerado'>('')
  const [itemParaAjustar, setItemParaAjustar] = useState<EstoqueItem | null>(null)
  const buscaDebounced = useDebouncedValue(busca)
  const sessao = useAuthStore((s) => s.sessao)
  const podeAjustar = sessao ? possuiPermissao(sessao.usuario.perfil, 'estoque.ajustar', 'ver') : false

  const estoque = useQuery({
    queryKey: ['estoque', { busca: buscaDebounced, categoria, situacao }],
    queryFn: () => unwrap(window.api.estoque.list({ busca: buscaDebounced, categoria, situacao }))
  })

  const imprimir = useMutation({
    mutationFn: () => unwrap(window.api.relatorios.posicaoEstoque({ busca: buscaDebounced, categoria, situacao })),
    onSuccess: (resultado) => {
      if (resultado) toast.ok(`PDF salvo em ${resultado.caminho}`)
    },
    onError: (err) => toast.error(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[var(--ink)]">Estoque</h1>
        <Button variant="secondary" loading={imprimir.isPending} onClick={() => imprimir.mutate()}>
          <Printer className="size-4" /> Imprimir posição de estoque
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-3)]" />
          <Input className="pl-9" placeholder="Descrição ou marca…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select className="w-44" value={categoria} onChange={(e) => setCategoria(e.target.value as typeof categoria)}>
          <option value="">Todas as categorias</option>
          <option value="armacao">Armação</option>
          <option value="lente">Lente</option>
          <option value="acessorio">Acessório</option>
        </Select>
        <Select className="w-52" value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)}>
          <option value="">Qualquer situação</option>
          <option value="abaixo_minimo">Abaixo do mínimo</option>
          <option value="zerado">Zerado</option>
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
                <th className="px-4 py-2.5 text-right">Saldo</th>
                <th className="px-4 py-2.5 text-right">Mínimo</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {estoque.data?.map((item) => {
                const zerado = item.saldo <= 0
                const abaixoMinimo = item.estoqueMinimo > 0 && item.saldo < item.estoqueMinimo
                return (
                  <tr key={item.produtoId} className="border-b border-[var(--rule)] last:border-0">
                    <td className="px-4 py-2.5 font-medium text-[var(--ink)]">{item.descricao}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone="neutral">{ROTULO_CATEGORIA[item.categoria]}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--ink-2)]">{item.marca ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono-tab">
                      <span className={zerado ? 'font-semibold text-[var(--danger)]' : abaixoMinimo ? 'font-semibold text-[var(--warn)]' : 'text-[var(--ink)]'}>
                        {item.saldo}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono-tab text-[var(--ink-3)]">{item.estoqueMinimo}</td>
                    <td className="px-2 py-2.5 text-right">
                      {podeAjustar && (
                        <button
                          type="button"
                          title="Ajustar estoque"
                          onClick={() => setItemParaAjustar(item)}
                          className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                        >
                          <ClipboardEdit className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}

              {estoque.data?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[var(--ink-3)]">
                    Nenhum produto encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <AjustarEstoqueDialog item={itemParaAjustar} onClose={() => setItemParaAjustar(null)} />
    </div>
  )
}
