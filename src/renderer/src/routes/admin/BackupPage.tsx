import { type ReactNode, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { Badge } from '@renderer/components/ui/Badge'
import { Button } from '@renderer/components/ui/Button'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Input } from '@renderer/components/ui/Input'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { toast } from '@renderer/state/toastStore'
import type { BackupInfo } from '@shared/types'

function formatarDataHoraBr(iso: string): string {
  const d = new Date(iso)
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const ano = d.getFullYear()
  const hora = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dia}/${mes}/${ano} ${hora}:${min}`
}

function formatarTamanho(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

function nomeArquivo(caminho: string): string {
  return caminho.split(/[/\\]/).pop() ?? caminho
}

const CONFIRMACAO = 'RESTAURAR'

export function BackupPage(): ReactNode {
  const queryClient = useQueryClient()
  const [backupParaRestaurar, setBackupParaRestaurar] = useState<BackupInfo | null>(null)

  const status = useQuery({
    queryKey: ['backupStatus'],
    queryFn: () => unwrap(window.api.backup.status())
  })

  const criar = useMutation({
    mutationFn: () => unwrap(window.api.backup.criar()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backupStatus'] })
      toast.ok('Backup criado.')
    },
    onError: (err) => toast.error(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[var(--ink)]">Backup</h1>
        <Button onClick={() => criar.mutate()} loading={criar.isPending}>
          Fazer backup agora
        </Button>
      </div>

      {status.data?.alerta && (
        <div className="flex items-start gap-2 rounded-md border border-[var(--danger)]/30 bg-[var(--danger-wash)] p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" />
          <p className="text-sm text-[var(--danger)]">
            Nenhum backup íntegro recente foi encontrado. Faça um backup manual agora.
          </p>
        </div>
      )}

      {status.data && (
        <div className="flex flex-col gap-1 text-sm text-[var(--ink-2)]">
          <p>
            Destino: <span className="font-mono-tab text-xs text-[var(--ink-3)]">{status.data.destino}</span>
          </p>
          {status.data.ultimoBackup && (
            <p>
              Último backup: {formatarDataHoraBr(status.data.ultimoBackup.criadoEm)} ·{' '}
              {formatarTamanho(status.data.ultimoBackup.tamanhoBytes)}
            </p>
          )}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                <th className="px-4 py-2.5">Arquivo</th>
                <th className="px-4 py-2.5">Data/hora</th>
                <th className="px-4 py-2.5">Tamanho</th>
                <th className="px-4 py-2.5">Integridade</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {status.data?.backups.map((b) => (
                <tr key={b.arquivo} className="border-b border-[var(--rule)] last:border-0">
                  <td className="px-4 py-2.5 font-mono-tab text-[var(--ink)]">{nomeArquivo(b.arquivo)}</td>
                  <td className="px-4 py-2.5 text-[var(--ink-2)]">{formatarDataHoraBr(b.criadoEm)}</td>
                  <td className="px-4 py-2.5 font-mono-tab text-[var(--ink-2)]">{formatarTamanho(b.tamanhoBytes)}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={b.integro ? 'ok' : 'danger'}>{b.integro ? 'Íntegro' : 'Corrompido'}</Badge>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <button
                      type="button"
                      title="Restaurar"
                      onClick={() => setBackupParaRestaurar(b)}
                      className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--danger-wash)] hover:text-[var(--danger)]"
                    >
                      <RotateCcw className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}

              {status.data?.backups.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--ink-3)]">
                    Nenhum backup ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <RestaurarBackupDialog backup={backupParaRestaurar} onClose={() => setBackupParaRestaurar(null)} />
    </div>
  )
}

interface RestaurarProps {
  backup: BackupInfo | null
  onClose: () => void
}

function RestaurarBackupDialog({ backup, onClose }: RestaurarProps): ReactNode {
  const queryClient = useQueryClient()
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const restaurar = useMutation({
    mutationFn: () => unwrap(window.api.backup.restaurar({ arquivo: backup!.arquivo })),
    onSuccess: () => {
      queryClient.invalidateQueries()
      toast.ok('Backup restaurado. Talvez seja necessário reiniciar o aplicativo.')
      fecharDialog()
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  function fecharDialog(): void {
    setConfirmacao('')
    setErro(null)
    onClose()
  }

  if (!backup) return null

  return (
    <Dialog open={backup !== null} onClose={fecharDialog} title="Restaurar backup" className="max-w-lg">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-md border border-[var(--danger)]/30 bg-[var(--danger-wash)] p-3">
          <p className="text-sm text-[var(--ink)]">
            Isso substitui TODOS os dados atuais pelo conteúdo deste backup de {formatarDataHoraBr(backup.criadoEm)}. Um
            backup de segurança do estado atual é feito automaticamente antes, mas a ação não pode ser desfeita
            facilmente.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirmacao-restaurar" className="text-sm font-medium text-[var(--ink-2)]">
            Digite <span className="font-mono-tab font-semibold">RESTAURAR</span> para confirmar
          </label>
          <Input
            id="confirmacao-restaurar"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            autoFocus
          />
        </div>

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex justify-end gap-2 border-t border-[var(--rule)] pt-4">
          <Button type="button" variant="ghost" onClick={fecharDialog}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={confirmacao !== CONFIRMACAO}
            loading={restaurar.isPending}
            onClick={() => restaurar.mutate()}
          >
            Confirmar restauração
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
