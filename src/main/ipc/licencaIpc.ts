import { handleIpc } from './handle'
import { IPC, licencaAtivarSchema } from '@shared/ipc'
import { licencaService } from '@main/services/licencaService'

export function registerLicencaIpc(): void {
  handleIpc(IPC.licenca.status, null, () => licencaService.obterStatus())
  handleIpc(IPC.licenca.ativar, licencaAtivarSchema, (input) => licencaService.ativar(input))
}
