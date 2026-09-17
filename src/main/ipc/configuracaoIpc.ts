import { handleIpc } from './handle'
import { IPC, configuracaoOperacionalSchema } from '@shared/ipc'
import { configuracaoService } from '@main/services/configuracaoService'

export function registerConfiguracaoIpc(): void {
  handleIpc(IPC.configuracoes.getOperacional, null, () => configuracaoService.obterOperacional())
  handleIpc(IPC.configuracoes.updateOperacional, configuracaoOperacionalSchema, (input) =>
    configuracaoService.atualizarOperacional(input)
  )
}
