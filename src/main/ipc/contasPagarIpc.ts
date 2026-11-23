import { handleIpc } from './handle'
import {
  IPC,
  contaPagarCriarSchema,
  contaPagarEditarSchema,
  contaPagarExcluirSchema,
  contaPagarPagarSchema,
  contasPagarListQuerySchema,
  recorrenciaEncerrarSchema,
  recorrenciaReajustarSchema
} from '@shared/ipc'
import { contaPagarService } from '@main/services/contaPagarService'
import { recorrenciaService } from '@main/services/recorrenciaService'

export function registerContasPagarIpc(): void {
  handleIpc(IPC.contasPagar.list, contasPagarListQuerySchema, (input) => contaPagarService.listar(input))
  handleIpc(IPC.contasPagar.criar, contaPagarCriarSchema, (input) => contaPagarService.criar(input))
  handleIpc(IPC.contasPagar.pagar, contaPagarPagarSchema, (input) => contaPagarService.pagar(input))
  handleIpc(IPC.contasPagar.editar, contaPagarEditarSchema, (input) => contaPagarService.editar(input))
  handleIpc(IPC.contasPagar.excluir, contaPagarExcluirSchema, (input) => contaPagarService.excluir(input))
  handleIpc(IPC.contasPagar.recorrencias, null, () => recorrenciaService.listar())
  handleIpc(IPC.contasPagar.reajustarRecorrencia, recorrenciaReajustarSchema, (input) => recorrenciaService.reajustar(input))
  handleIpc(IPC.contasPagar.encerrarRecorrencia, recorrenciaEncerrarSchema, (input) => recorrenciaService.encerrar(input))
}
