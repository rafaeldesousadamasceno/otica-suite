import { handleIpc } from './handle'
import {
  IPC,
  formaPagamentoExcluirSchema,
  formaPagamentoInputSchema,
  formaPagamentoSetAtivoSchema,
  formaPagamentoUpdateSchema,
  formasPagamentoListQuerySchema
} from '@shared/ipc'
import { formaPagamentoService } from '@main/services/formaPagamentoService'

export function registerFormasPagamentoIpc(): void {
  handleIpc(IPC.formasPagamento.list, formasPagamentoListQuerySchema, (input) => formaPagamentoService.listar(input))
  handleIpc(IPC.formasPagamento.create, formaPagamentoInputSchema, (input) => formaPagamentoService.criar(input))
  handleIpc(IPC.formasPagamento.update, formaPagamentoUpdateSchema, (input) => formaPagamentoService.atualizar(input.id, input.dados))
  handleIpc(IPC.formasPagamento.setAtivo, formaPagamentoSetAtivoSchema, (input) => formaPagamentoService.setAtivo(input.id, input.ativo))
  handleIpc(IPC.formasPagamento.excluir, formaPagamentoExcluirSchema, (input) => formaPagamentoService.excluir(input))
}
