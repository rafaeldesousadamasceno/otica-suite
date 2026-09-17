import { handleIpc } from './handle'
import { IPC, periodoQuerySchema } from '@shared/ipc'
import { financeiroService } from '@main/services/financeiroService'

export function registerFinanceiroIpc(): void {
  handleIpc(IPC.financeiro.fluxoCaixa, periodoQuerySchema, (input) => financeiroService.fluxoCaixa(input))
  handleIpc(IPC.financeiro.lucroPrejuizo, periodoQuerySchema, (input) => financeiroService.lucroPrejuizo(input))
}
