import { handleIpc } from './handle'
import { IPC, contasReceberListQuerySchema, contaReceberBaixarSchema, idSchema } from '@shared/ipc'
import { contaReceberService } from '@main/services/contaReceberService'

export function registerContasReceberIpc(): void {
  handleIpc(IPC.contasReceber.list, contasReceberListQuerySchema, (input) => contaReceberService.listar(input))
  handleIpc(IPC.contasReceber.listByVenda, idSchema, (input) => contaReceberService.listarPorVenda(input.id))
  handleIpc(IPC.contasReceber.baixar, contaReceberBaixarSchema, (input) => contaReceberService.darBaixa(input))
}
