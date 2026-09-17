import { type ReactNode, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { trocarSenhaSchema } from '@shared/ipc'

interface Props {
  open: boolean
  obrigatoria: boolean
  onClose: () => void
  onSuccess: () => void
}

export function ChangePasswordDialog({ open, obrigatoria, onClose, onSuccess }: Props): ReactNode {
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      if (novaSenha !== confirmar) throw new Error('As senhas não coincidem.')
      const parsed = trocarSenhaSchema.parse({ senhaAtual, novaSenha })
      return unwrap(window.api.auth.trocarSenha(parsed))
    },
    onSuccess: () => {
      setSenhaAtual('')
      setNovaSenha('')
      setConfirmar('')
      setErro(null)
      onSuccess()
    },
    onError: (err) => {
      setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
    }
  })

  return (
    <Dialog
      open={open}
      onClose={obrigatoria ? () => {} : onClose}
      title="Trocar senha"
      description={obrigatoria ? 'Defina uma nova senha para continuar.' : undefined}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
      >
        <Field label="Senha atual" required>
          <Input
            type="password"
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
            autoFocus
            required
          />
        </Field>
        <Field label="Nova senha" required hint="Pelo menos 8 caracteres.">
          <Input
            type="password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            required
          />
        </Field>
        <Field label="Confirmar nova senha" required>
          <Input
            type="password"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            required
          />
        </Field>

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex justify-end gap-2 pt-2">
          {!obrigatoria && (
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
          )}
          <Button type="submit" loading={mutation.isPending}>
            Salvar nova senha
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
