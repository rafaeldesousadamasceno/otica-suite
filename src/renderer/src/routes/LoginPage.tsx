import { type ReactNode, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Glasses } from 'lucide-react'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { loginSchema, primeiroAcessoSchema } from '@shared/ipc'
import type { Empresa, Sessao } from '@shared/types'

interface Props {
  empresa: Empresa | null
  onLogin: (sessao: Sessao) => void
}

export function LoginPage({ empresa, onLogin }: Props): ReactNode {
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [primeiroAcesso, setPrimeiroAcesso] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      if (!primeiroAcesso) return unwrap(window.api.auth.login(loginSchema.parse({ login, senha })))
      if (senha !== confirmar) throw new Error('As senhas não coincidem.')
      return unwrap(window.api.auth.primeiroAcesso(primeiroAcessoSchema.parse({ login, novaSenha: senha })))
    },
    onSuccess: (sessao) => onLogin(sessao),
    onError: (err) => {
      setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
    }
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6">
      <div className="w-full max-w-sm rounded-lg border border-[var(--rule)] bg-[var(--surface)] p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {empresa?.logoPath ? (
            <div className="mb-3 flex size-16 items-center justify-center overflow-hidden border border-[var(--rule)] bg-[var(--surface-2)]">
              <img src={empresa.logoPath} alt="" className="size-full object-cover" />
            </div>
          ) : (
            <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[var(--accent)]/12 text-[var(--accent)]">
              <Glasses className="size-6" />
            </div>
          )}
          <h1 className="text-lg font-semibold text-[var(--ink)]">{empresa?.nomeFantasia ?? 'OptiAleph'}</h1>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            {primeiroAcesso
              ? 'Primeiro acesso: informe seu login e escolha uma senha.'
              : 'Entre com seu usuário e senha.'}
          </p>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            setErro(null)
            mutation.mutate()
          }}
        >
          <Field label="Login" required>
            <Input value={login} onChange={(e) => setLogin(e.target.value)} autoFocus required />
          </Field>
          <Field
            label={primeiroAcesso ? 'Escolha sua senha' : 'Senha'}
            required
            hint={primeiroAcesso ? 'Pelo menos 8 caracteres.' : undefined}
          >
            <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </Field>
          {primeiroAcesso && (
            <Field label="Confirme a senha" required>
              <Input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} required />
            </Field>
          )}

          {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

          <Button type="submit" loading={mutation.isPending} className="mt-1 w-full">
            {primeiroAcesso ? 'Definir senha e entrar' : 'Entrar'}
          </Button>
          <button
            type="button"
            className="text-center text-sm text-[var(--accent)] underline underline-offset-2"
            onClick={() => {
              setPrimeiroAcesso((v) => !v)
              setSenha('')
              setConfirmar('')
              setErro(null)
            }}
          >
            {primeiroAcesso ? 'Voltar para o login' : 'Primeiro acesso? Escolha sua senha'}
          </button>
        </form>
      </div>
    </div>
  )
}
