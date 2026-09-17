import { handleIpc } from './handle'
import { IPC, migracaoConexaoSchema } from '@shared/ipc'
import { migracaoService } from '@main/services/migracaoService'

export function registerMigracaoIpc(): void {
  handleIpc(IPC.migracao.testarConexao, migracaoConexaoSchema, (input) => migracaoService.testarConexao(input))
  handleIpc(IPC.migracao.importar, migracaoConexaoSchema, (input) => migracaoService.importar(input))
}
