import { handleIpc } from './handle'
import { IPC, backupRestaurarSchema } from '@shared/ipc'
import { backupService } from '@main/services/backupService'

export function registerBackupIpc(): void {
  handleIpc(IPC.backup.status, null, () => backupService.obterStatus())
  handleIpc(IPC.backup.criar, null, () => backupService.criarManual())
  handleIpc(IPC.backup.restaurar, backupRestaurarSchema, (input) => backupService.restaurar(input))
}
