import { type ReactNode, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, PackageSearch } from 'lucide-react'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { Button } from '@renderer/components/ui/Button'
import { ProdutoBuscaInput } from '@renderer/components/ProdutoBuscaInput'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { centavosParaBRL, centavosParaTexto, textoParaCentavos } from '@renderer/lib/dinheiro'
import { compraCreateSchema } from '@shared/ipc'
import { toast } from '@renderer/state/toastStore'
import type { Produto } from '@shared/types'

interface LinhaItem {
  chave: string
  produtoId: number
  descricao: string
  quantidadeTexto: string
  custoUnitarioTexto: string
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated?: (compraId: number) => void
}

export function CompraFormDialog({ open, onClose, onCreated }: Props): ReactNode {
  const queryClient = useQueryClient()
  const [fornecedorId, setFornecedorId] = useState('')
  const [numeroNf, setNumeroNf] = useState('')
  const [itens, setItens] = useState<LinhaItem[]>([])
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setFornecedorId('')
      setNumeroNf('')
      setItens([])
      setErro(null)
    }
  }, [open])

  const fornecedores = useQuery({
    queryKey: ['fornecedores', { apenasAtivos: true }],
    queryFn: () => unwrap(window.api.fornecedores.list({ apenasAtivos: true })),
    enabled: open
  })

  function adicionarItem(produto: Produto): void {
    setItens((atual) => [
      ...atual,
      {
        chave: `${produto.id}-${Date.now()}`,
        produtoId: produto.id,
        descricao: produto.descricao,
        quantidadeTexto: '1',
        custoUnitarioTexto: produto.custoCentavos !== null ? centavosParaTexto(produto.custoCentavos) : ''
      }
    ])
  }

  function atualizarItem(chave: string, campo: keyof LinhaItem, valor: string): void {
    setItens((atual) => atual.map((it) => (it.chave === chave ? { ...it, [campo]: valor } : it)))
  }

  function removerItem(chave: string): void {
    setItens((atual) => atual.filter((it) => it.chave !== chave))
  }

  const totalCentavos = itens.reduce(
    (soma, it) => soma + Math.round(Number(it.quantidadeTexto || '0')) * textoParaCentavos(it.custoUnitarioTexto),
    0
  )

  const mutation = useMutation({
    mutationFn: () =>
      unwrap(
        window.api.compras.create(
          compraCreateSchema.parse({
            fornecedorId: fornecedorId ? Number(fornecedorId) : null,
            numeroNf,
            itens: itens.map((it) => ({
              produtoId: it.produtoId,
              quantidade: Number(it.quantidadeTexto || '0'),
              custoUnitarioCentavos: it.custoUnitarioTexto || '0'
            }))
          })
        )
      ),
    onSuccess: (compra) => {
      queryClient.invalidateQueries({ queryKey: ['compras'] })
      toast.ok(`Compra #${compra.id} registrada.`)
      onCreated?.(compra.id)
      onClose()
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  const podeSubmeter = itens.length > 0 && itens.every((it) => Number(it.quantidadeTexto) > 0)

  return (
    <Dialog open={open} onClose={onClose} title="Nova compra" className="max-w-2xl">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          setErro(null)
          mutation.mutate()
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Fornecedor" hint="Opcional">
            <Select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
              <option value="">— nenhum —</option>
              {fornecedores.data?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.razaoSocial}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nº da nota fiscal" hint="Opcional">
            <Input value={numeroNf} onChange={(e) => setNumeroNf(e.target.value)} />
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">Itens</p>
          <ProdutoBuscaInput onSelecionar={adicionarItem} />

          {itens.length > 0 && (
            <div className="overflow-hidden rounded-md border border-[var(--rule)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-xs text-[var(--ink-3)]">
                    <th className="px-2 py-1.5 text-left">Produto</th>
                    <th className="w-20 px-2 py-1.5">Qtd</th>
                    <th className="w-28 px-2 py-1.5">Custo un.</th>
                    <th className="w-28 px-2 py-1.5 text-right">Total</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((it) => {
                    const totalItem = Math.round(Number(it.quantidadeTexto || '0')) * textoParaCentavos(it.custoUnitarioTexto)
                    return (
                      <tr key={it.chave} className="border-b border-[var(--rule)] last:border-0">
                        <td className="px-2 py-1.5 text-[var(--ink)]">{it.descricao}</td>
                        <td className="px-1 py-1">
                          <Input
                            className="text-center font-mono-tab"
                            value={it.quantidadeTexto}
                            onChange={(e) => atualizarItem(it.chave, 'quantidadeTexto', e.target.value)}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            className="text-center font-mono-tab"
                            value={it.custoUnitarioTexto}
                            onChange={(e) => atualizarItem(it.chave, 'custoUnitarioTexto', e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono-tab text-[var(--ink)]">{centavosParaBRL(totalItem)}</td>
                        <td className="px-1 py-1">
                          <button
                            type="button"
                            onClick={() => removerItem(it.chave)}
                            className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--danger-wash)] hover:text-[var(--danger)]"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {itens.length === 0 && (
            <p className="flex items-center gap-2 rounded-md border border-dashed border-[var(--rule)] px-3 py-4 text-sm text-[var(--ink-3)]">
              <PackageSearch className="size-4" /> Busque um produto acima para adicionar à compra.
            </p>
          )}
        </div>

        <div className="flex justify-end border-t border-[var(--rule)] pt-3 text-sm">
          <div className="text-right">
            <p className="text-xs text-[var(--ink-3)]">Total da compra</p>
            <p className="font-mono-tab text-base font-semibold text-[var(--accent)]">{centavosParaBRL(totalCentavos)}</p>
          </div>
        </div>

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={!podeSubmeter}>
            Registrar compra
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
