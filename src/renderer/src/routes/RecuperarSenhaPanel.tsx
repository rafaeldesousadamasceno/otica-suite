import { type ReactNode, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Copy } from 'lucide-react'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { recuperacaoCodigoSchema, recuperacaoRedefinirSchema } from '@shared/ipc'
import type { AdminRecuperavel } from '@shared/types'

interface Props {
  /** Senha redefinida: volta ao login com o login do Administrador ja preenchido. */
  onConcluir: (login: string) => void
  onVoltar: () => void
}

function mensagem(err: unknown): string {
  return err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.'
}

/**
 * Recuperacao de senha do Administrador (sem internet): o dono manda o PEDIDO ao
 * suporte, recebe um CODIGO assinado, cola aqui e escolhe a nova senha.
 * Resolve tambem o "esqueci o login": depois do codigo valido, lista os Administradores.
 */
export function RecuperarSenhaPanel({ onConcluir, onVoltar }: Props): ReactNode {
  const [codigo, setCodigo] = useState('')
  const [admins, setAdmins] = useState<AdminRecuperavel[] | null>(null)
  const [usuarioId, setUsuarioId] = useState<number | null>(null)
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  const pedido = useQuery({
    queryKey: ['recuperacao-pedido'],
    queryFn: () => unwrap(window.api.auth.recuperacaoPedido()),
    staleTime: Infinity,
    gcTime: 0,
    retry: false
  })

  const verificar = useMutation({
    mutationFn: () => unwrap(window.api.auth.recuperacaoVerificar(recuperacaoCodigoSchema.parse({ codigo }))),
    onSuccess: (lista) => {
      setAdmins(lista)
      setUsuarioId(lista.length === 1 ? lista[0].id : null)
    },
    onError: (e) => setErro(mensagem(e))
  })

  const redefinir = useMutation({
    mutationFn: async () => {
      if (senha !== confirmar) throw new Error('As senhas não coincidem.')
      const input = recuperacaoRedefinirSchema.parse({ codigo, usuarioId, novaSenha: senha })
      return unwrap(window.api.auth.recuperacaoRedefinir(input))
    },
    onSuccess: ({ login }) => onConcluir(login),
    onError: (e) => setErro(mensagem(e))
  })

  async function copiarPedido(): Promise<void> {
    if (!pedido.data) return
    try {
      await navigator.clipboard.writeText(pedido.data.pedido)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // sem permissao de area de transferencia: o pedido continua selecionavel na tela
    }
  }

  if (admins) {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          setErro(null)
          redefinir.mutate()
        }}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-[var(--ink)]">Qual Administrador vai ter a senha redefinida?</legend>
          {admins.map((a) => (
            <label
              key={a.id}
              className="flex cursor-pointer items-center gap-3 rounded-md border border-[var(--rule)] px-3 py-2 text-sm has-[:checked]:border-[var(--accent)]"
            >
              <input type="radio" name="admin" checked={usuarioId === a.id} onChange={() => setUsuarioId(a.id)} />
              <span className="flex flex-col">
                <span className="font-medium text-[var(--ink)]">{a.nome}</span>
                <span className="text-xs text-[var(--ink-3)]">
                  Login: {a.login}
                  {!a.ativo && ' · inativo (será reativado)'}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <Field label="Nova senha" required hint="Pelo menos 8 caracteres.">
          <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </Field>
        <Field label="Confirme a nova senha" required>
          <Input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} required />
        </Field>
        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}
        <Button type="submit" loading={redefinir.isPending} disabled={usuarioId === null} className="w-full">
          Redefinir senha
        </Button>
        <button type="button" className="text-center text-sm text-[var(--accent)] underline underline-offset-2" onClick={onVoltar}>
          Cancelar
        </button>
      </form>
    )
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        setErro(null)
        verificar.mutate()
      }}
    >
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-[var(--ink-2)]">
        <li>Envie o pedido abaixo ao suporte do sistema.</li>
        <li>O suporte confirma que é você e devolve um código.</li>
        <li>Cole o código aqui. Pode fechar o sistema enquanto espera: o pedido continua valendo por 7 dias.</li>
      </ol>

      <div>
        <div className="mb-1 text-xs font-medium text-[var(--ink-3)]">Pedido de recuperação</div>
        <div className="flex items-start gap-2">
          <code className="flex-1 select-all break-all rounded-md border border-[var(--rule)] bg-[var(--surface-2)] px-3 py-2 font-mono text-sm text-[var(--ink)]">
            {pedido.isPending ? 'Gerando…' : (pedido.data?.pedido ?? 'Não foi possível gerar o pedido.')}
          </code>
          <Button type="button" variant="secondary" size="sm" onClick={copiarPedido} disabled={!pedido.data} aria-label="Copiar pedido">
            <Copy className="size-4" />
            {copiado ? 'Copiado' : 'Copiar'}
          </Button>
        </div>
      </div>

      <Field label="Código de recuperação" required>
        <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Cole aqui o código recebido" autoComplete="off" required />
      </Field>

      {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}
      <Button type="submit" loading={verificar.isPending} className="w-full">
        Continuar
      </Button>
      <button type="button" className="text-center text-sm text-[var(--accent)] underline underline-offset-2" onClick={onVoltar}>
        Voltar para o login
      </button>
    </form>
  )
}
