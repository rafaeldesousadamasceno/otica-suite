import { type ReactNode, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, FlaskConical, Power, Trash2 } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { Badge } from '@renderer/components/ui/Badge'
import { LaboratorioFormDialog } from '@renderer/components/LaboratorioFormDialog'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { useConfirm } from '@renderer/lib/confirmar'
import { useDebouncedValue } from '@renderer/lib/useDebouncedValue'
import { toast } from '@renderer/state/toastStore'
import { mascararTelefoneBr } from '@shared/telefone'
import type { Laboratorio } from '@shared/types'

const mensagem = (err: unknown): string => (err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')

/** Cadastro de laboratorios (Administrador). A OS escolhe um destes; quem ja tem OS so pode ser inativado. */
export function LaboratoriosPage(): ReactNode {
  const confirmar = useConfirm()
  const queryClient = useQueryClient()
  const [busca, setBusca] = useState('')
  const [mostrarInativos, setMostrarInativos] = useState(true)
  const [novoOpen, setNovoOpen] = useState(false)
  const [editando, setEditando] = useState<Laboratorio | null>(null)
  const buscaDebounced = useDebouncedValue(busca)

  const laboratorios = useQuery({
    queryKey: ['laboratorios', { busca: buscaDebounced, apenasAtivos: !mostrarInativos, tela: true }],
    queryFn: () => unwrap(window.api.laboratorios.list({ busca: buscaDebounced, apenasAtivos: !mostrarInativos }))
  })

  const atualizar = (): void => {
    queryClient.invalidateQueries({ queryKey: ['laboratorios'] })
  }

  const setAtivo = useMutation({
    mutationFn: (p: { id: number; ativo: boolean }) => unwrap(window.api.laboratorios.setAtivo(p)),
    onSuccess: (_, p) => {
      atualizar()
      toast.ok(p.ativo ? 'Laboratório reativado.' : 'Laboratório inativado.')
    },
    onError: (err) => toast.error(mensagem(err))
  })

  const excluir = useMutation({
    mutationFn: (id: number) => unwrap(window.api.laboratorios.excluir({ id })),
    onSuccess: () => {
      atualizar()
      toast.ok('Laboratório excluído.')
    },
    // Com OS vinculada o servidor recusa e explica (e sugere Inativar).
    onError: (err) => toast.error(mensagem(err))
  })

  async function pedirInativar(l: Laboratorio): Promise<void> {
    if (l.ativo) {
      const ok = await confirmar({
        titulo: 'Inativar laboratório?',
        mensagem: `${l.nome} deixa de aparecer nas novas OS. As OS que já usam continuam mostrando o nome dele, e você pode reativar depois.`,
        rotuloConfirmar: 'Inativar'
      })
      if (!ok) return
    }
    setAtivo.mutate({ id: l.id, ativo: !l.ativo })
  }

  async function pedirExcluir(l: Laboratorio): Promise<void> {
    const ok = await confirmar({
      variante: 'excluir',
      entidade: 'laboratório',
      item: l.nome,
      detalhe: l.osVinculadas > 0 ? `Está em ${l.osVinculadas} OS: nesse caso o sistema não exclui e sugere inativar.` : undefined
    })
    if (ok) excluir.mutate(l.id)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[var(--ink)]">Laboratórios</h1>
        <Button onClick={() => setNovoOpen(true)}>
          <FlaskConical className="size-4" /> Novo laboratório
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-3)]" />
          <Input className="pl-9" placeholder="Nome, razão social ou CNPJ…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
          <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} /> Mostrar inativos
        </label>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                <th className="px-4 py-2.5">Laboratório</th>
                <th className="px-4 py-2.5">Contato</th>
                <th className="px-4 py-2.5">Telefone</th>
                <th className="px-4 py-2.5 text-center">Prazo</th>
                <th className="px-4 py-2.5 text-center">OS</th>
                <th className="px-4 py-2.5">Situação</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {laboratorios.data?.map((l) => (
                <tr key={l.id} onClick={() => setEditando(l)} className="cursor-pointer border-b border-[var(--rule)] last:border-0 hover:bg-[var(--surface-2)]">
                  <td className="px-4 py-2.5">
                    <p className={l.ativo ? 'font-medium text-[var(--ink)]' : 'font-medium text-[var(--ink-3)]'}>{l.nome}</p>
                    {l.razaoSocial && <p className="text-xs text-[var(--ink-3)]">{l.razaoSocial}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--ink-2)]">{l.contatoResponsavel ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono-tab text-[var(--ink-2)]">{l.telefone ? mascararTelefoneBr(l.telefone) : '—'}</td>
                  <td className="px-4 py-2.5 text-center font-mono-tab text-[var(--ink-2)]">{l.prazoMedioDias !== null ? `${l.prazoMedioDias}d` : '—'}</td>
                  <td className="px-4 py-2.5 text-center font-mono-tab text-[var(--ink-3)]">{l.osVinculadas}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={l.ativo ? 'ok' : 'neutral'}>{l.ativo ? 'Ativo' : 'Inativo'}</Badge>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        title={l.ativo ? 'Inativar' : 'Reativar'}
                        aria-label={`${l.ativo ? 'Inativar' : 'Reativar'} ${l.nome}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          void pedirInativar(l)
                        }}
                        className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                      >
                        <Power className="size-4" />
                      </button>
                      <button
                        type="button"
                        title="Excluir"
                        aria-label={`Excluir ${l.nome}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          void pedirExcluir(l)
                        }}
                        className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--danger-wash)] hover:text-[var(--danger)]"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {laboratorios.data?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[var(--ink-3)]">
                    Nenhum laboratório encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <LaboratorioFormDialog open={novoOpen} onClose={() => setNovoOpen(false)} />
      <LaboratorioFormDialog open={editando !== null} onClose={() => setEditando(null)} laboratorio={editando ?? undefined} />
    </div>
  )
}
