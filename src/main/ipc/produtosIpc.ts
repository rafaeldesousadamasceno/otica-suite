import { handleIpc } from './handle'
import {
  IPC,
  produtoInputSchema,
  produtoUpdateSchema,
  produtoSetAtivoSchema,
  produtosListQuerySchema,
  idSchema
} from '@shared/ipc'
import { produtoService } from '@main/services/produtoService'

export function registerProdutosIpc(): void {
  handleIpc(IPC.produtos.list, produtosListQuerySchema, (input) => produtoService.listar(input))
  handleIpc(IPC.produtos.get, idSchema, (input) => produtoService.buscarPorId(input.id))
  handleIpc(IPC.produtos.create, produtoInputSchema, (input) => produtoService.criar(input))
  handleIpc(IPC.produtos.update, produtoUpdateSchema, (input) => produtoService.atualizar(input.id, input.dados))
  handleIpc(IPC.produtos.setAtivo, produtoSetAtivoSchema, (input) =>
    produtoService.setAtivo(input.id, input.ativo)
  )
}
