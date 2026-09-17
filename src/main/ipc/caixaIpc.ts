import { handleIpc } from './handle'
import { IPC, caixaAbrirSchema, caixaFecharSchema, caixaMovimentoSchema } from '@shared/ipc'
import { caixaService } from '@main/services/caixaService'

export function registerCaixaIpc(): void {
  handleIpc(IPC.caixa.atual, null, () => caixaService.atual())
  handleIpc(IPC.caixa.listar, null, () => caixaService.listarHistorico())
  handleIpc(IPC.caixa.abrir, caixaAbrirSchema, (input) => caixaService.abrir(input))
  handleIpc(IPC.caixa.fechar, caixaFecharSchema, (input) => caixaService.fechar(input))
  handleIpc(IPC.caixa.sangria, caixaMovimentoSchema, (input) => caixaService.sangria(input))
  handleIpc(IPC.caixa.suprimento, caixaMovimentoSchema, (input) => caixaService.suprimento(input))
}
