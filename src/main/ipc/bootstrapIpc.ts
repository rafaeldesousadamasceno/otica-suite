import { handleIpc } from './handle'
import { IPC, setupSchema } from '@shared/ipc'
import { setupService } from '@main/services/setupService'

export function registerBootstrapIpc(): void {
  handleIpc(IPC.bootstrap.get, null, () => setupService.getBootstrapState())
  handleIpc(IPC.bootstrap.completeSetup, setupSchema, (input) => setupService.completeSetup(input))
}
