import { type ReactNode, useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { Badge } from '@renderer/components/ui/Badge'
import { NovaUnidadeMedidaForm } from '@renderer/components/NovaUnidadeMedidaForm'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { CHAVE_UNIDADES_MEDIDA, useUnidadesMedida } from '@renderer/lib/unidadesMedida'
import { toast } from '@renderer/state/toastStore'
import { useConfirm } from '@renderer/lib/confirmar'
import { UNIDADE_PADRAO, type UnidadeMedida } from '@shared/types'

interface Props {
  open: boolean
  onClose: () => void
}

const mensagem = (err: unknown): string => (err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')

/** Cadastro das unidades de medida: incluir, corrigir a descricao e desativar/reativar. */
export function UnidadesMedidaDialog({ open, onClose }: Props): ReactNode {
  const confirmar = useConfirm()
  const unidades = useUnidadesMedida()
  const queryClient = useQueryClient()
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [descricaoEditada, setDescricaoEditada] = useState('')
  const [erroEdicao, setErroEdicao] = useState<string | null>(null)

  useEffect(() => {
    if (open) setEditandoId(null)
  }, [open])

  const atualizarLista = (): void => {
    queryClient.invalidateQueries({ queryKey: CHAVE_UNIDADES_MEDIDA })
  }

  const salvarDescricao = useMutation({
    mutationFn: (id: number) => unwrap(window.api.unidadesMedida.update({ id, descricao: descricaoEditada })),
    onSuccess: (u) => {
      atualizarLista()
      toast.ok(`Unidade ${u.sigla} atualizada.`)
      setEditandoId(null)
    },
    onError: (err) => setErroEdicao(mensagem(err))
  })

  const alternarAtivo = useMutation({
    mutationFn: (u: UnidadeMedida) => unwrap(window.api.unidadesMedida.setAtivo({ id: u.id, ativo: !u.ativo })),
    onSuccess: (_, u) => {
      atualizarLista()
      toast.ok(u.ativo ? `Unidade ${u.sigla} desativada.` : `Unidade ${u.sigla} reativada.`)
    },
    onError: (err) => toast.error(mensagem(err))
  })

  function editar(u: UnidadeMedida): void {
    setEditandoId(u.id)
    setDescricaoEditada(u.descricao ?? '')
    setErroEdicao(null)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Unidades de medida"
      description="Como os produtos são contados no estoque. A unidade é escolhida no cadastro de cada produto."
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-5">
        <section className="rounded-md border border-[var(--rule)] bg-[var(--surface-2)] p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">Nova unidade</h3>
          <NovaUnidadeMedidaForm onCriada={() => setEditandoId(null)} />
        </section>

        {/* Larguras fixas: a tabela nao "pula" quando uma linha entra em edicao. */}
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-[var(--rule)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
              <th className="w-20 py-2 pr-3">Sigla</th>
              <th className="py-2 pr-3">Descrição</th>
              <th className="w-24 py-2 pr-3 text-right">Produtos</th>
              <th className="w-32 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {unidades.data?.map((u) => (
              <tr key={u.id} className="border-b border-[var(--rule)] last:border-0">
                <td className="py-2 pr-3">
                  <span className={`font-mono-tab font-semibold ${u.ativo ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]'}`}>{u.sigla}</span>
                </td>
                <td className="py-2 pr-3">
                  {editandoId === u.id ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-2">
                        <Input
                          value={descricaoEditada}
                          onChange={(e) => setDescricaoEditada(e.target.value)}
                          maxLength={30}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              salvarDescricao.mutate(u.id)
                            } else if (e.key === 'Escape') {
                              // So cancela a edicao, sem fechar a janela.
                              e.stopPropagation()
                              setEditandoId(null)
                            }
                          }}
                        />
                        <Button type="button" size="sm" className="h-9" loading={salvarDescricao.isPending} onClick={() => salvarDescricao.mutate(u.id)}>
                          Salvar
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => setEditandoId(null)}>
                          Cancelar
                        </Button>
                      </div>
                      {erroEdicao && <p className="text-xs text-[var(--danger)]">{erroEdicao}</p>}
                    </div>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className={u.ativo ? 'text-[var(--ink-2)]' : 'text-[var(--ink-3)]'}>
                        {u.descricao ?? <em className="text-[var(--ink-3)]">sem descrição</em>}
                      </span>
                      {!u.ativo && <Badge tone="neutral">Desativada</Badge>}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 text-right font-mono-tab text-[var(--ink-3)]">{u.produtos}</td>
                <td className="py-2">
                  {editandoId !== u.id && (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        title="Editar descrição"
                        aria-label={`Editar descrição de ${u.sigla}`}
                        onClick={() => editar(u)}
                        className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                      >
                        <Pencil className="size-4" />
                      </button>
                      {u.sigla === UNIDADE_PADRAO ? (
                        <span className="w-20 text-center text-xs text-[var(--ink-3)]" title="Unidade padrão do sistema: não pode ser desativada">
                          Padrão
                        </span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="w-20"
                          disabled={alternarAtivo.isPending}
                          onClick={async () => {
                            if (u.ativo) {
                              const ok = await confirmar({
                                titulo: 'Desativar unidade?',
                                mensagem: `${u.sigla} sai das opções de novos produtos. Os ${u.produtos} produto(s) que já usam continuam com ela.`,
                                rotuloConfirmar: 'Desativar'
                              })
                              if (!ok) return
                            }
                            alternarAtivo.mutate(u)
                          }}
                        >
                          {u.ativo ? 'Desativar' : 'Reativar'}
                        </Button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-xs text-[var(--ink-3)]">
          A sigla não muda depois de cadastrada, porque fica gravada nos produtos: para trocar, cadastre a nova e
          desative a antiga. Desativar só tira a unidade das opções; os produtos que já a usam continuam com ela.
        </p>
      </div>
    </Dialog>
  )
}
