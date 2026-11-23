import { type ReactNode, useEffect, useState } from 'react'
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
  /**
   * Confirmacao com a PROPRIA senha (ex.: o Administrador logado excluindo uma venda): o login ja vem preenchido e
   * nao muda, so a senha e digitada.
   */
  loginFixo?: string
  titulo?: string
  rotuloConfirmar?: string
}

/**
 * RF-03.4: autorizacao pontual do Admin, sem trocar a sessao ativa do
 * Vendedor. Abre quando o backend recusa uma acao com
 * `code: 'AUTORIZACAO_ADMIN_NECESSARIA'` - a tela que chama isto so
 * precisa reenviar a MESMA acao com `autorizacaoAdmin` preenchido.
 */
export function AuthorizeAdminDialog({ open, motivo, erro, onClose, onConfirm, loading, loginFixo, titulo, rotuloConfirmar }: Props): ReactNode {
  const [loginDigitado, setLoginDigitado] = useState('')
  const [senhaAdmin, setSenhaAdmin] = useState('')
  const loginAdmin = loginFixo ?? loginDigitado

  // A senha digitada nunca fica guardada: ao fechar, o campo volta vazio.
  useEffect(() => {
    if (!open) setSenhaAdmin('')
  }, [open])

  return (
    <Dialog open={open} onClose={onClose} title={titulo ?? 'Autorização necessária'}>
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
          <Input
            value={loginAdmin}
            onChange={(e) => setLoginDigitado(e.target.value)}
            readOnly={loginFixo !== undefined}
            autoFocus={loginFixo === undefined}
            required
          />
        </Field>
        <Field label={loginFixo !== undefined ? 'Sua senha' : 'Senha do administrador'} required>
          <Input type="password" value={senhaAdmin} onChange={(e) => setSenhaAdmin(e.target.value)} autoFocus={loginFixo !== undefined} required autoComplete="current-password" />
        </Field>

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading}>
            {rotuloConfirmar ?? 'Autorizar'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
