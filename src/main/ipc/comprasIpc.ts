import { handleIpc } from './handle'
import { IPC, compraCreateSchema, compraConfirmarEntradaSchema, comprasListQuerySchema, idSchema } from '@shared/ipc'
import { compraService } from '@main/services/compraService'

export function registerComprasIpc(): void {
  handleIpc(IPC.compras.list, comprasListQuerySchema, (input) => compraService.listar(input))
  handleIpc(IPC.compras.get, idSchema, (input) => compraService.buscarPorId(input.id))
  handleIpc(IPC.compras.create, compraCreateSchema, (input) => compraService.criar(input))
  handleIpc(IPC.compras.confirmarEntrada, compraConfirmarEntradaSchema, (input) =>
    compraService.confirmarEntrada(input.id, input.vencimentoContaPagar)
  )
  handleIpc(IPC.compras.cancelar, idSchema, (input) => compraService.cancelar(input.id))
}
