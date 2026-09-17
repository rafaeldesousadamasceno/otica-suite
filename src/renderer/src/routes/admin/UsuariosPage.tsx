import { type ReactNode, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus, KeyRound, Ban, CheckCircle2 } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { Badge } from '@renderer/components/ui/Badge'
import { Button } from '@renderer/components/ui/Button'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { usuarioCreateSchema, usuarioResetSenhaSchema } from '@shared/ipc'
import { toast } from '@renderer/state/toastStore'
import { useAuthStore } from '@renderer/state/authStore'
import type { Usuario } from '@shared/types'

function NovoUsuarioDialog({ open, onClose }: { open: boolean; onClose: () => void }): ReactNode {
  const [nome, setNome] = useState('')
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [perfil, setPerfil] = useState<'admin' | 'vendedor'>('vendedor')
  const [erro, setErro] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => unwrap(window.api.usuarios.create(usuarioCreateSchema.parse({ nome, login, senha, perfil }))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      toast.ok('Usuário criado.')
      setNome('')
      setLogin('')
      setSenha('')
      setPerfil('vendedor')
      onClose()
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  return (
    <Dialog open={open} onClose={onClose} title="Novo usuário">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
      >
        <Field label="Nome" required>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus required />
        </Field>
        <Field label="Login" required hint="Pelo menos 3 caracteres.">
          <Input value={login} onChange={(e) => setLogin(e.target.value)} required />
        </Field>
        <Field label="Senha provisória" required hint="O usuário será obrigado a trocar no primeiro acesso.">
          <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </Field>
        <Field label="Módulo de acesso" required>
          <Select value={perfil} onChange={(e) => setPerfil(e.target.value as 'admin' | 'vendedor')}>
            <option value="vendedor">Vendedor</option>
            <option value="admin">Administrador</option>
          </Select>
        </Field>

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Criar usuário
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function ResetarSenhaDialog({
  usuario,
  onClose
}: {
  usuario: Usuario | null
  onClose: () => void
}): ReactNode {
  const [novaSenha, setNovaSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () =>
      unwrap(window.api.usuarios.resetSenha(usuarioResetSenhaSchema.parse({ id: usuario!.id, novaSenha }))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
      toast.ok('Senha redefinida.')
      setNovaSenha('')
      onClose()
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  return (
    <Dialog
      open={Boolean(usuario)}
      onClose={onClose}
      title={`Redefinir senha de ${usuario?.nome ?? ''}`}
      description="O usuário será obrigado a trocar essa senha no próximo acesso."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
      >
        <Field label="Nova senha provisória" required hint="Pelo menos 8 caracteres.">
          <Input type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} autoFocus required />
        </Field>
        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Redefinir
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function UsuariosPage(): ReactNode {
  const [novoOpen, setNovoOpen] = useState(false)
  const [resetarUsuario, setResetarUsuario] = useState<Usuario | null>(null)
  const queryClient = useQueryClient()
  const sessao = useAuthStore((s) => s.sessao)

  const usuarios = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => unwrap(window.api.usuarios.list())
  })

  const toggleAtivo = useMutation({
    mutationFn: (input: { id: number; ativo: boolean }) => unwrap(window.api.usuarios.setAtivo(input)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] })
    },
    onError: (err) => toast.error(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[var(--ink)]">Usuários</h1>
        <Button onClick={() => setNovoOpen(true)}>
          <UserPlus className="size-4" /> Novo usuário
        </Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
              <th className="px-4 py-2.5">Nome</th>
              <th className="px-4 py-2.5">Login</th>
              <th className="px-4 py-2.5">Módulo</th>
              <th className="px-4 py-2.5">Situação</th>
              <th className="px-4 py-2.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.data?.map((u) => (
              <tr key={u.id} className="border-b border-[var(--rule)] last:border-0">
                <td className="px-4 py-2.5 font-medium text-[var(--ink)]">{u.nome}</td>
                <td className="px-4 py-2.5 font-mono-tab text-[var(--ink-2)]">{u.login}</td>
                <td className="px-4 py-2.5">
                  <Badge tone={u.perfil === 'admin' ? 'accent' : 'neutral'}>
                    {u.perfil === 'admin' ? 'Administrador' : 'Vendedor'}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={u.ativo ? 'ok' : 'danger'}>{u.ativo ? 'Ativo' : 'Inativo'}</Badge>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1.5">
                    <Button variant="ghost" size="sm" onClick={() => setResetarUsuario(u)}>
                      <KeyRound className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={u.id === sessao?.usuario.id}
                      onClick={() => toggleAtivo.mutate({ id: u.id, ativo: !u.ativo })}
                    >
                      {u.ativo ? <Ban className="size-4" /> : <CheckCircle2 className="size-4" />}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <NovoUsuarioDialog open={novoOpen} onClose={() => setNovoOpen(false)} />
      <ResetarSenhaDialog usuario={resetarUsuario} onClose={() => setResetarUsuario(null)} />
    </div>
  )
}
