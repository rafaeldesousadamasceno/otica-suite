import { type ReactNode, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import type { CredencialAdminInput } from '@shared/ipc'

interface Props {
  open: boolean
  /** A frase que o backend devolveu explicando por que a autorizacao e necessaria. */
  motivo: string
  /** Erro de uma tentativa anterior (ex.: credencial invalida) - some Dialog
   * empilhado sobre o formulario que a gerou, entao o erro tem que aparecer
   * AQUI, nao no formulario de baixo (que fica coberto). */
  erro?: string | null
  onClose: () => void
  onConfirm: (credencial: CredencialAdminInput) => void
  loading?: boolean
}

/**
 * RF-03.4: autorizacao pontual do Admin, sem trocar a sessao ativa do
 * Vendedor. Abre quando o backend recusa uma acao com
 * `code: 'AUTORIZACAO_ADMIN_NECESSARIA'` - a tela que chama isto so
 * precisa reenviar a MESMA acao com `autorizacaoAdmin` preenchido.
 */
export function AuthorizeAdminDialog({ open, motivo, erro, onClose, onConfirm, loading }: Props): ReactNode {
  const [loginAdmin, setLoginAdmin] = useState('')
  const [senhaAdmin, setSenhaAdmin] = useState('')

  return (
    <Dialog open={open} onClose={onClose} title="Autorização necessária">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          onConfirm({ loginAdmin, senhaAdmin })
        }}
      >
        <div className="flex items-start gap-3 rounded-md border border-[var(--warn)]/30 bg-[var(--warn-wash)] p-3">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-[var(--warn)]" />
          <p className="text-sm text-[var(--ink)]">{motivo}</p>
        </div>

        <Field label="Login do administrador" required>
          <Input value={loginAdmin} onChange={(e) => setLoginAdmin(e.target.value)} autoFocus required />
        </Field>
        <Field label="Senha do administrador" required>
          <Input type="password" value={senhaAdmin} onChange={(e) => setSenhaAdmin(e.target.value)} required />
        </Field>

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading}>
            Autorizar
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
