import { type ReactNode, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ShieldAlert, Trash2 } from 'lucide-react'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { AuthorizeAdminDialog } from '@renderer/components/AuthorizeAdminDialog'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { useConfirmComMotivo } from '@renderer/lib/confirmar'
import { centavosParaBRL } from '@renderer/lib/dinheiro'
import { toast } from '@renderer/state/toastStore'
import { useAuthStore } from '@renderer/state/authStore'
import type { PreviaExclusaoVenda } from '@shared/types'
import type { CredencialAdminInput } from '@shared/ipc'

const mensagem = (err: unknown): string => (err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')

interface VendaParaExcluir {
  id: number
  numero: string
  clienteNome: string
  totalCentavos: number
}

interface Opcoes {
  /** Depois de excluir: a tela atualiza a lista / fecha o detalhe. */
  aoExcluir?: () => void
}

/**
 * Excluir venda (9.6), o mesmo fluxo na lista e no detalhe:
 *  - sem bloqueio: confirmacao de exclusao (RG-01) com o campo "Motivo (opcional)";
 *  - com bloqueio (parcela paga, recebivel baixado, pagamento a vista, OS vinculada): a caixa LISTA os itens e so
 *    segue se o Administrador digitar a PROPRIA senha (confirmacao digitada, nao so clique).
 * Devolve `pedirExclusao(venda)` e os `dialogos`, que a tela precisa renderizar.
 */
export function useExcluirVenda({ aoExcluir }: Opcoes = {}): { pedirExclusao: (v: VendaParaExcluir) => Promise<void>; dialogos: ReactNode } {
  const queryClient = useQueryClient()
  const confirmarComMotivo = useConfirmComMotivo()
  const login = useAuthStore((s) => s.sessao?.usuario.login ?? '')
  const [bloqueada, setBloqueada] = useState<PreviaExclusaoVenda | null>(null)
  const [motivo, setMotivo] = useState('')
  const [pedindoSenha, setPedindoSenha] = useState(false)
  const [erroSenha, setErroSenha] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const concluir = useCallback(() => {
    for (const chave of ['vendas', 'venda', 'contasReceber', 'produtos', 'ordensServico', 'estoque', 'dashboard', 'caixa']) {
      queryClient.invalidateQueries({ queryKey: [chave] })
    }
    toast.ok('Venda excluída.')
    aoExcluir?.()
  }, [queryClient, aoExcluir])

  const pedirExclusao = useCallback(
    async (v: VendaParaExcluir): Promise<void> => {
      try {
        const previa = await unwrap(window.api.vendas.exclusaoPrevia({ id: v.id }))
        if (previa.bloqueios.length > 0) {
          setMotivo('')
          setErroSenha(null)
          setPedindoSenha(false)
          setBloqueada(previa)
          return
        }
        const resposta = await confirmarComMotivo({
          entidade: 'venda',
          item: `Venda ${v.numero} — ${v.clienteNome} — ${centavosParaBRL(v.totalCentavos)}`,
          detalhe: 'Os produtos voltam ao estoque, as parcelas em aberto são removidas e a comissão é cancelada. O número da venda não será reutilizado.'
        })
        if (!resposta) return
        await unwrap(window.api.vendas.excluir({ id: v.id, motivo: resposta.motivo || null }))
        concluir()
      } catch (err) {
        toast.error(mensagem(err))
      }
    },
    [confirmarComMotivo, concluir]
  )

  async function excluirLiberada(credencial: CredencialAdminInput): Promise<void> {
    if (!bloqueada) return
    setEnviando(true)
    setErroSenha(null)
    try {
      await unwrap(window.api.vendas.excluir({ id: bloqueada.vendaId, motivo: motivo.trim() || null, autorizacaoAdmin: credencial }))
      setPedindoSenha(false)
      setBloqueada(null)
      concluir()
    } catch (err) {
      // O dialogo da senha cobre a caixa: o erro (senha errada...) tem que aparecer nele.
      setErroSenha(mensagem(err))
    } finally {
      setEnviando(false)
    }
  }

  const dialogos = (
    <>
      <Dialog open={bloqueada !== null && !pedindoSenha} onClose={() => setBloqueada(null)} title={`Excluir a venda ${bloqueada?.numero ?? ''}?`} className="max-w-lg">
        {bloqueada && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-md border border-[var(--warn)]/30 bg-[var(--warn-wash)] p-3">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-[var(--warn)]" />
              <div className="text-sm text-[var(--ink)]">
                <p className="font-medium">Esta venda já tem dinheiro ou documentos ligados a ela:</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-5" aria-label="Pendências da venda">
                  {bloqueada.bloqueios.map((b, i) => (
                    <li key={i}>{b.descricao}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="text-sm text-[var(--ink-2)]">
              {bloqueada.clienteNome} — {centavosParaBRL(bloqueada.totalCentavos)}. Para excluir mesmo assim, o Administrador precisa digitar a própria senha. O que já foi
              recebido será estornado no caixa, os produtos voltam ao estoque, as parcelas em aberto são removidas e a OS ligada fica sem venda.
              <b className="text-[var(--danger)]"> Esta ação não pode ser desfeita.</b>
            </p>
            <Field label="Motivo (opcional)">
              <Input value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} placeholder="Por que está excluindo?" />
            </Field>
            <div className="flex justify-end gap-2 border-t border-[var(--rule)] pt-4">
              <Button autoFocus variant="secondary" onClick={() => setBloqueada(null)}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={() => setPedindoSenha(true)}>
                <Trash2 className="size-4" /> Liberar com a minha senha…
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <AuthorizeAdminDialog
        open={bloqueada !== null && pedindoSenha}
        titulo="Confirme com a sua senha"
        motivo={`Digite a sua senha de Administrador para excluir a venda ${bloqueada?.numero ?? ''}. Isso desfaz o que a venda movimentou e não pode ser desfeito.`}
        loginFixo={login}
        rotuloConfirmar="Excluir venda"
        erro={erroSenha}
        loading={enviando}
        onClose={() => {
          setPedindoSenha(false)
          setErroSenha(null)
        }}
        onConfirm={(credencial) => void excluirLiberada(credencial)}
      />
    </>
  )

  return { pedirExclusao, dialogos }
}
