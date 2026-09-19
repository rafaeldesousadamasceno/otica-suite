import { type ReactNode, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BellOff, CheckCheck, ChevronDown, ChevronRight, MessageCircle, MessageSquareText } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { Badge } from '@renderer/components/ui/Badge'
import { Dialog } from '@renderer/components/ui/Dialog'
import { ModelosMensagemDialog } from '@renderer/components/ModelosMensagemDialog'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { toast } from '@renderer/state/toastStore'
import { useAuthStore } from '@renderer/state/authStore'
import { possuiPermissao } from '@shared/permissions'
import { MOTIVOS_CONTATO } from '@shared/types'
import type { ContatoPendente, MotivoContato } from '@shared/types'

const ROTULO_MOTIVO: Record<MotivoContato, string> = {
  RETIRADA: 'Retirada',
  COBRANCA: 'Cobrança',
  ANIVERSARIO: 'Aniversário',
  POS_VENDA: 'Pós-venda',
  RENOVACAO: 'Renovação'
}

const TOM_MOTIVO: Record<MotivoContato, 'accent' | 'danger' | 'warn' | 'neutral'> = {
  RETIRADA: 'accent',
  COBRANCA: 'danger',
  ANIVERSARIO: 'warn',
  POS_VENDA: 'neutral',
  RENOVACAO: 'neutral'
}

function mensagemDeErro(err: unknown): string {
  return err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.'
}

/**
 * "Quem chamar hoje": os clientes que merecem um contato agora (oculos que
 * chegaram, parcela vencida, aniversario, pos-venda, renovacao). O sistema nao
 * envia nada - abre o WhatsApp da propria pessoa com a mensagem pronta, e ela
 * marca como contatado. Quem ja foi chamado por aquela ocorrencia sai da lista.
 */
export function RelacionamentoPage(): ReactNode {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const sessao = useAuthStore((s) => s.sessao)
  const podeEditarModelos = sessao ? possuiPermissao(sessao.usuario.perfil, 'relacionamento.modelos', 'editar') : false

  const [filtro, setFiltro] = useState<MotivoContato | 'TODOS'>('TODOS')
  const [modelosAbertos, setModelosAbertos] = useState(false)
  const [paraRegistrar, setParaRegistrar] = useState<ContatoPendente | null>(null)
  const [observacao, setObservacao] = useState('')
  const [paraSair, setParaSair] = useState<ContatoPendente | null>(null)
  const [semContatoAberto, setSemContatoAberto] = useState(false)

  const pendentes = useQuery({
    queryKey: ['relacionamento'],
    queryFn: () => unwrap(window.api.relacionamento.listar())
  })

  const semContato = useQuery({
    queryKey: ['relacionamentoSemContato'],
    queryFn: () => unwrap(window.api.relacionamento.semContato())
  })

  const atualizar = (): void => {
    queryClient.invalidateQueries({ queryKey: ['relacionamento'] })
    queryClient.invalidateQueries({ queryKey: ['relacionamentoSemContato'] })
  }

  const abrirWhatsapp = useMutation({
    mutationFn: (p: ContatoPendente) =>
      unwrap(window.api.relacionamento.abrirWhatsapp({ clienteId: p.clienteId, motivo: p.motivo, referencia: p.referencia })),
    onSuccess: () => toast.ok('WhatsApp aberto. Depois de enviar, clique em "Contatado".'),
    onError: (err) => {
      toast.error(mensagemDeErro(err))
      atualizar()
    }
  })

  const registrar = useMutation({
    mutationFn: (p: ContatoPendente) =>
      unwrap(
        window.api.relacionamento.marcarContatado({
          clienteId: p.clienteId,
          motivo: p.motivo,
          referencia: p.referencia,
          observacao: observacao.trim() || undefined
        })
      ),
    onSuccess: () => {
      toast.ok('Contato registrado.')
      setParaRegistrar(null)
      atualizar()
    },
    onError: (err) => toast.error(mensagemDeErro(err))
  })

  const definirAceita = useMutation({
    mutationFn: (v: { clienteId: number; aceita: boolean }) => unwrap(window.api.relacionamento.definirAceitaContato(v)),
    onSuccess: (_d, v) => {
      toast.ok(v.aceita ? 'Cliente volta a aparecer nas listas.' : 'Cliente não será mais contatado.')
      setParaSair(null)
      atualizar()
    },
    onError: (err) => toast.error(mensagemDeErro(err))
  })

  const todos = pendentes.data ?? []
  const visiveis = filtro === 'TODOS' ? todos : todos.filter((p) => p.motivo === filtro)
  const contagem = (m: MotivoContato): number => todos.filter((p) => p.motivo === m).length
  const excluidos = semContato.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--ink)]">Relacionamento</h1>
          <p className="text-sm text-[var(--ink-3)]">Quem vale a pena chamar hoje. O contato é feito pelo seu WhatsApp.</p>
        </div>
        {podeEditarModelos && (
          <Button variant="secondary" onClick={() => setModelosAbertos(true)}>
            <MessageSquareText className="size-4" /> Editar mensagens
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por motivo">
        {(['TODOS', ...MOTIVOS_CONTATO] as const).map((m) => {
          const ativo = filtro === m
          const total = m === 'TODOS' ? todos.length : contagem(m)
          return (
            <button
              key={m}
              type="button"
              aria-pressed={ativo}
              onClick={() => setFiltro(m)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                ativo
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'border-[var(--rule-strong)] text-[var(--ink-2)] hover:bg-[var(--surface-2)]'
              }`}
            >
              {m === 'TODOS' ? 'Todos' : ROTULO_MOTIVO[m]} <span className="font-mono-tab opacity-70">{total}</span>
            </button>
          )
        })}
      </div>

      <Card className="overflow-hidden">
        {pendentes.isLoading ? (
          <p className="px-4 py-8 text-center text-[var(--ink-3)]">Carregando…</p>
        ) : visiveis.length === 0 ? (
          <p className="px-4 py-10 text-center text-[var(--ink-3)]">Nenhum contato pendente. Tudo em dia.</p>
        ) : (
          <ul className="divide-y divide-[var(--rule)]">
            {visiveis.map((p) => (
              <li key={p.chave} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <Badge tone={TOM_MOTIVO[p.motivo]} className="w-24 justify-center">
                  {ROTULO_MOTIVO[p.motivo]}
                </Badge>

                <div className="min-w-0 flex-1 basis-64">
                  <button
                    type="button"
                    onClick={() => navigate(`/clientes/${p.clienteId}`)}
                    className="text-left font-medium text-[var(--ink)] hover:text-[var(--accent)] hover:underline"
                  >
                    {p.clienteNome}
                  </button>
                  <p className="text-sm text-[var(--ink-2)]">{p.detalhe}</p>
                  {p.temWhatsapp ? (
                    <p className="font-mono-tab text-xs text-[var(--ink-3)]">{p.celular}</p>
                  ) : (
                    <p className="text-xs text-[var(--warn)]">
                      {p.celular ? `Celular inválido para WhatsApp: ${p.celular}` : 'Sem celular cadastrado'}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!p.temWhatsapp}
                    loading={abrirWhatsapp.isPending && abrirWhatsapp.variables?.chave === p.chave}
                    title={p.temWhatsapp ? 'Abrir a conversa no WhatsApp com a mensagem pronta' : 'Corrija o celular no cadastro do cliente'}
                    onClick={() => abrirWhatsapp.mutate(p)}
                  >
                    <MessageCircle className="size-4" /> WhatsApp
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setObservacao('')
                      setParaRegistrar(p)
                    }}
                  >
                    <CheckCheck className="size-4" /> Contatado
                  </Button>
                  <button
                    type="button"
                    title="Não contatar mais este cliente"
                    aria-label={`Não contatar mais ${p.clienteNome}`}
                    onClick={() => setParaSair(p)}
                    className="rounded p-1.5 text-[var(--ink-3)] hover:bg-[var(--surface-2)] hover:text-[var(--danger)]"
                  >
                    <BellOff className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {excluidos.length > 0 && (
        <div>
          <button
            type="button"
            aria-expanded={semContatoAberto}
            onClick={() => setSemContatoAberto((v) => !v)}
            className="flex items-center gap-1 text-sm text-[var(--ink-2)] hover:text-[var(--ink)]"
          >
            {semContatoAberto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            Clientes que pediram para não ser contatados ({excluidos.length})
          </button>
          {semContatoAberto && (
            <Card className="mt-2 overflow-hidden">
              <ul className="divide-y divide-[var(--rule)]">
                {excluidos.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="text-sm text-[var(--ink)]">{c.nome}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={definirAceita.isPending && definirAceita.variables?.clienteId === c.id}
                      onClick={() => definirAceita.mutate({ clienteId: c.id, aceita: true })}
                    >
                      Voltar a contatar
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <Dialog
        open={paraRegistrar !== null}
        onClose={() => setParaRegistrar(null)}
        title="Registrar contato"
        description={paraRegistrar ? `${paraRegistrar.clienteNome} · ${ROTULO_MOTIVO[paraRegistrar.motivo]}` : undefined}
      >
        {paraRegistrar && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[var(--ink-2)]">
              {paraRegistrar.detalhe}. Ao registrar, o cliente sai da lista por esse motivo.
            </p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="observacao-contato" className="text-sm font-medium text-[var(--ink-2)]">
                Observação (opcional)
              </label>
              <textarea
                id="observacao-contato"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                maxLength={300}
                rows={3}
                placeholder="Ex.: vai passar na sexta"
                className="w-full rounded-md border border-[var(--rule-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-[var(--accent)]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setParaRegistrar(null)}>
                Cancelar
              </Button>
              <Button loading={registrar.isPending} onClick={() => registrar.mutate(paraRegistrar)}>
                Registrar contato
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={paraSair !== null}
        onClose={() => setParaSair(null)}
        title="Não contatar mais"
        description={paraSair?.clienteNome}
        className="max-w-md"
      >
        {paraSair && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[var(--ink-2)]">
              {paraSair.clienteNome} deixa de aparecer em todas as listas de contato. Use quando a pessoa pedir para não
              receber mensagens. Dá para desfazer em "Clientes que pediram para não ser contatados".
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setParaSair(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                loading={definirAceita.isPending}
                onClick={() => definirAceita.mutate({ clienteId: paraSair.clienteId, aceita: false })}
              >
                Não contatar mais
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {podeEditarModelos && <ModelosMensagemDialog open={modelosAbertos} onClose={() => setModelosAbertos(false)} />}
    </div>
  )
}
