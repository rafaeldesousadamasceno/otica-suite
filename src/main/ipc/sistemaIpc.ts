import { handleIpc } from './handle'
import { IPC } from '@shared/ipc'
import { sistemaService } from '@main/services/sistemaService'

export function registerSistemaIpc(): void {
  handleIpc(IPC.sistema.info, null, () => sistemaService.obterInfo())
}
