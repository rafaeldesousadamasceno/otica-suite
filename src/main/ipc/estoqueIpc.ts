import { handleIpc } from './handle'
import { IPC, estoqueListQuerySchema, estoqueAjustarSchema } from '@shared/ipc'
import { estoqueService } from '@main/services/estoqueService'

export function registerEstoqueIpc(): void {
  handleIpc(IPC.estoque.list, estoqueListQuerySchema, (input) => estoqueService.listar(input))
  handleIpc(IPC.estoque.ajustar, estoqueAjustarSchema, (input) => estoqueService.ajustar(input))
}
