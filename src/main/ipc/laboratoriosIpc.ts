import { handleIpc } from './handle'
import {
  IPC,
  laboratorioExcluirSchema,
  laboratorioInputSchema,
  laboratorioSetAtivoSchema,
  laboratorioUpdateSchema,
  laboratoriosListQuerySchema
} from '@shared/ipc'
import { laboratorioService } from '@main/services/laboratorioService'

export function registerLaboratoriosIpc(): void {
  handleIpc(IPC.laboratorios.list, laboratoriosListQuerySchema, (input) => laboratorioService.listar(input))
  handleIpc(IPC.laboratorios.create, laboratorioInputSchema, (input) => laboratorioService.criar(input))
  handleIpc(IPC.laboratorios.update, laboratorioUpdateSchema, (input) => laboratorioService.atualizar(input.id, input.dados))
  handleIpc(IPC.laboratorios.setAtivo, laboratorioSetAtivoSchema, (input) => laboratorioService.setAtivo(input.id, input.ativo))
  handleIpc(IPC.laboratorios.excluir, laboratorioExcluirSchema, (input) => laboratorioService.excluir(input))
}
