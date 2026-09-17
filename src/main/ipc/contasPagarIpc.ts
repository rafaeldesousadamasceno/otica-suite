import { handleIpc } from './handle'
import { IPC, contaPagarCriarSchema, contaPagarPagarSchema, contasPagarListQuerySchema } from '@shared/ipc'
import { contaPagarService } from '@main/services/contaPagarService'

export function registerContasPagarIpc(): void {
  handleIpc(IPC.contasPagar.list, contasPagarListQuerySchema, (input) => contaPagarService.listar(input))
  handleIpc(IPC.contasPagar.criar, contaPagarCriarSchema, (input) => contaPagarService.criar(input))
  handleIpc(IPC.contasPagar.pagar, contaPagarPagarSchema, (input) => contaPagarService.pagar(input))
}
