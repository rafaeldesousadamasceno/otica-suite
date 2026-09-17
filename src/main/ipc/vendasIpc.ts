import { handleIpc } from './handle'
import {
  IPC,
  vendaCreateSchema,
  vendaCancelarSchema,
  vendasListQuerySchema,
  receitaListByClienteSchema,
  idSchema
} from '@shared/ipc'
import { vendaService } from '@main/services/vendaService'

export function registerVendasIpc(): void {
  handleIpc(IPC.vendas.list, vendasListQuerySchema, (input) => vendaService.listar(input))
  handleIpc(IPC.vendas.get, idSchema, (input) => vendaService.buscarPorId(input.id))
  handleIpc(IPC.vendas.create, vendaCreateSchema, (input) => vendaService.criar(input))
  handleIpc(IPC.vendas.listByCliente, receitaListByClienteSchema, (input) =>
    vendaService.listarPorCliente(input.clienteId)
  )
  handleIpc(IPC.vendas.cancelar, vendaCancelarSchema, (input) => vendaService.cancelar(input))
}
