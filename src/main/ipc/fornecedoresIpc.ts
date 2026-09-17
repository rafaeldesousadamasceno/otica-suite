import { handleIpc } from './handle'
import {
  IPC,
  fornecedorInputSchema,
  fornecedorUpdateSchema,
  fornecedorSetAtivoSchema,
  fornecedoresListQuerySchema,
  idSchema
} from '@shared/ipc'
import { fornecedorService } from '@main/services/fornecedorService'

export function registerFornecedoresIpc(): void {
  handleIpc(IPC.fornecedores.list, fornecedoresListQuerySchema, (input) => fornecedorService.listar(input))
  handleIpc(IPC.fornecedores.get, idSchema, (input) => fornecedorService.buscarPorId(input.id))
  handleIpc(IPC.fornecedores.create, fornecedorInputSchema, (input) => fornecedorService.criar(input))
  handleIpc(IPC.fornecedores.update, fornecedorUpdateSchema, (input) => fornecedorService.atualizar(input.id, input.dados))
  handleIpc(IPC.fornecedores.setAtivo, fornecedorSetAtivoSchema, (input) => fornecedorService.setAtivo(input.id, input.ativo))
}
