import { handleIpc } from './handle'
import { IPC } from '@shared/ipc'
import { auditoriaService } from '@main/services/auditoriaService'

export function registerAuditoriaIpc(): void {
  handleIpc(IPC.auditoria.list, null, () => auditoriaService.listar())
}
