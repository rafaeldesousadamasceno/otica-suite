import { handleIpc } from './handle'
import { IPC, nuvemLigarSchema } from '@shared/ipc'
import { nuvemService } from '@main/services/nuvemService'

export function registerNuvemIpc(): void {
  handleIpc(IPC.nuvem.status, null, () => nuvemService.obterStatus())
  handleIpc(IPC.nuvem.ligar, nuvemLigarSchema, (input) => nuvemService.ligar(input))
  handleIpc(IPC.nuvem.desligar, null, () => nuvemService.desligar())
  handleIpc(IPC.nuvem.sincronizarAgora, null, () => nuvemService.sincronizarAgora())
}
