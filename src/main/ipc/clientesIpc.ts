import { handleIpc } from './handle'
import {
  IPC,
  clientesListQuerySchema,
  clienteInputSchema,
  clienteUpdateSchema,
  idSchema,
  aniversariantesQuerySchema
} from '@shared/ipc'
import { clienteService } from '@main/services/clienteService'

export function registerClientesIpc(): void {
  handleIpc(IPC.clientes.list, clientesListQuerySchema, (input) => clienteService.listar(input))
  handleIpc(IPC.clientes.get, idSchema, (input) => clienteService.buscarPorId(input.id))
  handleIpc(IPC.clientes.create, clienteInputSchema, (input) => clienteService.criar(input))
  handleIpc(IPC.clientes.update, clienteUpdateSchema, (input) =>
    clienteService.atualizar(input.id, input.dados)
  )
  handleIpc(IPC.clientes.inativar, idSchema, (input) => clienteService.remover(input.id))
  handleIpc(IPC.clientes.aniversariantes, aniversariantesQuerySchema, (input) =>
    clienteService.aniversariantes(input.mes)
  )
}
