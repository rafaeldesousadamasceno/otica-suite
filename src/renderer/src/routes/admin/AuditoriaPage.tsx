import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@renderer/components/ui/Card'
import { Badge } from '@renderer/components/ui/Badge'
import { unwrap } from '@renderer/lib/ipc'

const TONS: Record<string, 'ok' | 'danger' | 'warn' | 'neutral'> = {
  CRIAR: 'ok',
  LOGIN: 'ok',
  ATIVAR: 'ok',
  ATUALIZAR: 'neutral',
  ATUALIZAR_LOGO: 'neutral',
  TROCA_SENHA: 'neutral',
  SETUP_INICIAL: 'neutral',
  LOGIN_FALHOU: 'warn',
  INATIVAR: 'warn',
  RESETAR_SENHA: 'warn',
  EXCLUIR: 'danger',
  LOGOUT: 'neutral'
}

function formatarDataHora(iso: string): string {
  return new Date(iso.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium'
  })
}

export function AuditoriaPage(): ReactNode {
  const auditoria = useQuery({
    queryKey: ['auditoria'],
    queryFn: () => unwrap(window.api.auditoria.list())
  })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--ink)]">Auditoria</h1>
        <p className="text-sm text-[var(--ink-3)]">
          Registro somente-leitura de quem fez o quê e quando. Mostrando os 200 eventos mais recentes.
        </p>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
              <th className="px-4 py-2.5">Quando</th>
              <th className="px-4 py-2.5">Usuário</th>
              <th className="px-4 py-2.5">Ação</th>
              <th className="px-4 py-2.5">Entidade</th>
              <th className="px-4 py-2.5">Autorizado por</th>
            </tr>
          </thead>
          <tbody>
            {auditoria.data?.map((a) => (
              <tr key={a.id} className="border-b border-[var(--rule)] last:border-0">
                <td className="px-4 py-2.5 font-mono-tab text-[var(--ink-2)]">{formatarDataHora(a.dataHora)}</td>
                <td className="px-4 py-2.5 text-[var(--ink)]">{a.usuarioNome ?? '—'}</td>
                <td className="px-4 py-2.5">
                  <Badge tone={TONS[a.acao] ?? 'neutral'}>{a.acao}</Badge>
                </td>
                <td className="px-4 py-2.5 text-[var(--ink-2)]">
                  {a.entidade}
                  {a.entidadeId ? ` #${a.entidadeId}` : ''}
                </td>
                <td className="px-4 py-2.5 text-[var(--ink-2)]">{a.autorizadoPorNome ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
