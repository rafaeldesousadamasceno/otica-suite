import { type ReactNode, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Glasses } from 'lucide-react'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { setupSchema, type SetupInput } from '@shared/ipc'

interface Props {
  onDone: () => void
}

/**
 * RF-02: primeira execucao. Esta versao cobre os passos essenciais do
 * wizard do PRD (dados da otica + admin inicial) numa unica tela; os
 * passos de logo, ativacao de licenca e importacao de dados (roadmap
 * F1/F6) entram como telas adicionais deste mesmo fluxo mais adiante,
 * sem mudar o contrato de bootstrap.
 */
export function SetupWizardPage({ onDone }: Props): ReactNode {
  const [form, setForm] = useState({
    nomeFantasia: '',
    cnpj: '',
    adminNome: '',
    adminLogin: '',
    adminSenha: '',
    adminSenhaConfirmar: ''
  })
  const [erro, setErro] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      if (form.adminSenha !== form.adminSenhaConfirmar) {
        throw new Error('As senhas não coincidem.')
      }
      const input: SetupInput = setupSchema.parse({
        empresa: { nomeFantasia: form.nomeFantasia, cnpj: form.cnpj || undefined },
        admin: { nome: form.adminNome, login: form.adminLogin, senha: form.adminSenha }
      })
      return unwrap(window.api.bootstrap.completeSetup(input))
    },
    onSuccess: onDone,
    onError: (err) => {
      setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
    }
  })

  function set<K extends keyof typeof form>(key: K, value: string): void {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6">
      <div className="w-full max-w-lg rounded-lg border border-[var(--rule)] bg-[var(--surface)] p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[var(--accent)]/12 text-[var(--accent)]">
            <Glasses className="size-6" />
          </div>
          <h1 className="text-lg font-semibold text-[var(--ink)]">Bem-vindo(a) à Ótica Suite</h1>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Vamos configurar o sistema para a sua ótica. Isso leva menos de 5 minutos.
          </p>
        </div>

        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate()
          }}
        >
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
              Dados da ótica
            </legend>
            <Field label="Nome fantasia" required>
              <Input
                value={form.nomeFantasia}
                onChange={(e) => set('nomeFantasia', e.target.value)}
                placeholder="Ex.: Ótica Bella Vista"
                autoFocus
                required
              />
            </Field>
            <Field label="CNPJ" hint="Opcional - pode ser preenchido depois em Configurações.">
              <Input value={form.cnpj} onChange={(e) => set('cnpj', e.target.value)} placeholder="00.000.000/0000-00" />
            </Field>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
              Usuário administrador
            </legend>
            <Field label="Seu nome" required>
              <Input value={form.adminNome} onChange={(e) => set('adminNome', e.target.value)} required />
            </Field>
            <Field label="Login" required hint="Pelo menos 3 caracteres.">
              <Input value={form.adminLogin} onChange={(e) => set('adminLogin', e.target.value)} required />
            </Field>
            <Field label="Senha" required hint="Pelo menos 8 caracteres.">
              <Input
                type="password"
                value={form.adminSenha}
                onChange={(e) => set('adminSenha', e.target.value)}
                required
              />
            </Field>
            <Field label="Confirmar senha" required>
              <Input
                type="password"
                value={form.adminSenhaConfirmar}
                onChange={(e) => set('adminSenhaConfirmar', e.target.value)}
                required
              />
            </Field>
          </fieldset>

          {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

          <Button type="submit" loading={mutation.isPending} className="mt-1 w-full">
            Concluir configuração
          </Button>
        </form>
      </div>
    </div>
  )
}
