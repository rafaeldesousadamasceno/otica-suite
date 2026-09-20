import { type ReactNode, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { BannerLicenca } from './BannerLicenca'
import { useAuthStore } from '@renderer/state/authStore'
import { ChangePasswordDialog } from '@renderer/components/ChangePasswordDialog'

export function AppShell({ children }: { children: ReactNode }): ReactNode {
  const sessao = useAuthStore((s) => s.sessao)
  const queryClient = useQueryClient()
  const [trocouSenha, setTrocouSenha] = useState(false)

  // RF-03.1: troca de senha obrigatoria no primeiro acesso (ou apos reset
  // feito pelo Admin). O dialogo nao pode ser fechado sem trocar.
  const precisaTrocarSenha = sessao?.usuario.deveTrocarSenha && !trocouSenha

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <BannerLicenca />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>

      <ChangePasswordDialog
        open={Boolean(precisaTrocarSenha)}
        obrigatoria
        onClose={() => {}}
        onSuccess={() => {
          setTrocouSenha(true)
          queryClient.invalidateQueries({ queryKey: ['sessao'] })
        }}
      />
    </div>
  )
}
