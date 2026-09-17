import { type ReactNode, useState } from 'react'
import { LogOut, KeyRound, ChevronDown } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@renderer/state/authStore'
import { unwrap } from '@renderer/lib/ipc'
import { toast } from '@renderer/state/toastStore'
import { ChangePasswordDialog } from '@renderer/components/ChangePasswordDialog'

export function Topbar(): ReactNode {
  const sessao = useAuthStore((s) => s.sessao)
  const setSessao = useAuthStore((s) => s.setSessao)
  const queryClient = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [senhaOpen, setSenhaOpen] = useState(false)

  if (!sessao) return null

  const hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long'
  })

  async function sair(): Promise<void> {
    try {
      await unwrap(window.api.auth.logout())
    } finally {
      setSessao(null)
      queryClient.clear()
    }
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--rule)] bg-[var(--surface)] px-6">
      <span className="text-sm capitalize text-[var(--ink-3)]">{hoje}</span>

      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--surface-2)]"
        >
          <div className="flex size-7 items-center justify-center rounded-full bg-[var(--surface-2)] text-xs font-semibold text-[var(--ink-2)]">
            {sessao.usuario.nome[0]}
          </div>
          <span className="font-medium text-[var(--ink)]">{sessao.usuario.nome}</span>
          <ChevronDown className="size-3.5 text-[var(--ink-3)]" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-md border border-[var(--rule)] bg-[var(--surface)] py-1 shadow-lg">
            <button
              onClick={() => setSenhaOpen(true)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--surface-2)]"
            >
              <KeyRound className="size-4" /> Trocar senha
            </button>
            <button
              onClick={sair}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--danger)] hover:bg-[var(--danger-wash)]"
            >
              <LogOut className="size-4" /> Sair
            </button>
          </div>
        )}
      </div>

      <ChangePasswordDialog
        open={senhaOpen}
        obrigatoria={false}
        onClose={() => setSenhaOpen(false)}
        onSuccess={() => {
          setSenhaOpen(false)
          toast.ok('Senha alterada com sucesso.')
        }}
      />
    </header>
  )
}
