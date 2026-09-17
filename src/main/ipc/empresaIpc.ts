import { handleIpc } from './handle'
import { IPC, empresaUpdateSchema, empresaLogoUploadSchema } from '@shared/ipc'
import { empresaService } from '@main/services/empresaService'

export function registerEmpresaIpc(): void {
  handleIpc(IPC.empresa.get, null, () => empresaService.get())
  handleIpc(IPC.empresa.update, empresaUpdateSchema, (input) => empresaService.update(input))
  handleIpc(IPC.empresa.uploadLogo, empresaLogoUploadSchema, (input) => empresaService.uploadLogo(input))
  handleIpc(IPC.empresa.removerLogo, null, () => empresaService.removerLogo())
}
