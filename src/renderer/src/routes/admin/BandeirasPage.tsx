import { type ReactNode, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, CreditCard, Power, Trash2 } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { Badge } from '@renderer/components/ui/Badge'
import { BandeiraFormDialog } from '@renderer/components/BandeiraFormDialog'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { useConfirm } from '@renderer/lib/confirmar'
import { useDebouncedValue } from '@renderer/lib/useDebouncedValue'
import { toast } from '@renderer/state/toastStore'
import { formatarBp } from '@shared/dinheiro'
import type { Bandeira } from '@shared/types'

const mensagem = (err: unknown): string => (err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')

const nomeCompleto = (b: Bandeira): string => (b.adquirente ? `${b.nome} (${b.adquirente})` : b.nome)

function resumoCredito(b: Bandeira): string {
  if (!b.aceitaCredito || b.faixas.length === 0) return '—'
  const primeira = b.faixas[0]
  const ultima = b.faixas[b.faixas.length - 1]
  const faixa = primeira.parcelas === ultima.parcelas ? `${primeira.parcelas}x` : `${primeira.parcelas}x a ${ultima.parcelas}x`
  return `${faixa}: taxa de ${formatarBp(Math.min(...b.faixas.map((f) => f.taxaBp)))} a ${formatarBp(Math.max(...b.faixas.map((f) => f.taxaBp)))}`
}

/** Cadastro de bandeiras de cartao (Administrador). Quem ja tem venda so pode ser inativada; mudar a taxa nao mexe em venda antiga. */
export function BandeirasPage(): ReactNode {
  const confirmar = useConfirm()
  const queryClient = useQueryClient()
  const [busca, setBusca] = useState('')
  const [mostrarInativas, setMostrarInativas] = useState(true)
  const [novaOpen, setNovaOpen] = useState(false)
  const [editando, setEditando] = useState<Bandeira | null>(null)
  const buscaDebounced = useDebouncedValue(busca)

  const bandeiras = useQuery({
    queryKey: ['bandeiras', { busca: buscaDebounced, apenasAtivos: !mostrarInativas, tela: true }],
    queryFn: () => unwrap(window.api.bandeiras.list({ busca: buscaDebounced, apenasAtivos: !mostrarInativas }))
  })

  const atualizar = (): void => {
    queryClient.invalidateQueries({ queryKey: ['bandeiras'] })
  }

  const setAtivo = useMutation({
    mutationFn: (p: { id: number; ativo: boolean }) => unwrap(window.api.bandeiras.setAtivo(p)),
    onSuccess: (_, p) => {
      atualizar()
      toast.ok(p.ativo ? 'Bandeira reativada.' : 'Bandeira inativada.')
    },
    onError: (err) => toast.error(mensagem(err))
  })

  const excluir = useMutation({
    mutationFn: (id: number) => unwrap(window.api.bandeiras.excluir({ id })),
    onSuccess: () => {
      atualizar()
      toast.ok('Bandeira excluída.')
    },
    onError: (err) => toast.error(mensagem(err))
  })

  async function pedirInativar(b: Bandeira): Promise<void> {
    if (b.ativo) {
      const ok = await confirmar({
        titulo: 'Inativar bandeira?',
        mensagem: `${nomeCompleto(b)} deixa de aparecer nas vendas novas. As vendas que já usaram continuam com a taxa que tinham, e você pode reativar depois.`,
        rotuloConfirmar: 'Inativar'
      })
      if (!ok) return
    }
    setAtivo.mutate({ id: b.id, ativo: !b.ativo })
  }

  async function pedirExcluir(b: Bandeira): Promise<void> {
    const ok = await confirmar({
      variante: 'excluir',
      entidade: 'bandeira',
      item: nomeCompleto(b),
      detalhe: b.vendasVinculadas > 0 ? `Foi usada em ${b.vendasVinculadas} pagamento(s) de venda: nesse caso o sistema não exclui e sugere inativar.` : undefined
    })
    if (ok) excluir.mutate(b.id)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[var(--ink)]">Bandeiras</h1>
        <Button onClick={() => setNovaOpen(true)}>
          <CreditCard className="size-4" /> Nova bandeira
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-3)]" />
          <Input className="pl-9" placeholder="Bandeira ou maquininha…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
          <input type="checkbox" checked={mostrarInativas} onChange={(e) => setMostrarInativas(e.target.checked)} /> Mostrar inativas
        </label>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                <th className="px-4 py-2.5">Bandeira</th>
                <th className="px-4 py-2.5">Maquininha</th>
                <th className="px-4 py-2.5">Débito</th>
                <th className="px-4 py-2.5">Crédito</th>
                <th className="px-4 py-2.5 text-center">Vendas</th>
                <th className="px-4 py-2.5">Situação</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {bandeiras.data?.map((b) => (
                <tr key={b.id} onClick={() => setEditando(b)} className="cursor-pointer border-b border-[var(--rule)] last:border-0 hover:bg-[var(--surface-2)]">
                  <td className={b.ativo ? 'px-4 py-2.5 font-medium text-[var(--ink)]' : 'px-4 py-2.5 font-medium text-[var(--ink-3)]'}>{b.nome}</td>
                  <td className="px-4 py-2.5 text-[var(--ink-2)]">{b.adquirente ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono-tab text-[var(--ink-2)]">
                    {b.aceitaDebito && b.debitoTaxaBp !== null ? `${formatarBp(b.debitoTaxaBp)}, ${b.debitoPrazoDias} dia(s)` : '—'}
                  </td>
                  <td className="px-4 py-2.5 font-mono-tab text-[var(--ink-2)]">{resumoCredito(b)}</td>
                  <td className="px-4 py-2.5 text-center font-mono-tab text-[var(--ink-3)]">{b.vendasVinculadas}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={b.ativo ? 'ok' : 'neutral'}>{b.ativo ? 'Ativa' : 'Inativa'}</Badge>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        title={b.ativo ? 'Inativar' : 'Reativar'}
                        aria-label={`${b.ativo ? 'Inativar' : 'Reativar'} ${nomeCompleto(b)}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          void pedirInativar(b)
                        }}
                        className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                      >
                        <Power className="size-4" />
                      </button>
                      <button
                        type="button"
                        title="Excluir"
                        aria-label={`Excluir ${nomeCompleto(b)}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          void pedirExcluir(b)
                        }}
                        className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--danger-wash)] hover:text-[var(--danger)]"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {bandeiras.data?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[var(--ink-3)]">
                    Nenhuma bandeira cadastrada. Cadastre as bandeiras e as taxas da sua maquininha para vender no cartão.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <BandeiraFormDialog open={novaOpen} onClose={() => setNovaOpen(false)} />
      <BandeiraFormDialog open={editando !== null} onClose={() => setEditando(null)} bandeira={editando ?? undefined} />
    </div>
  )
}
