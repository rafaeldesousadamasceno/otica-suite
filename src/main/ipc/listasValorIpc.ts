import { handleIpc } from './handle'
import { IPC, listaValorTipoSchema } from '@shared/ipc'
import { listaValorService } from '@main/services/listaValorService'

export function registerListasValorIpc(): void {
  handleIpc(IPC.listasValor.listByTipo, listaValorTipoSchema, (input) =>
    listaValorService.listarPorTipo(input.tipo)
  )
}
