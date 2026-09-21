import { handleIpc } from './handle'
import { IPC, loginSchema, trocarSenhaSchema, primeiroAcessoSchema, autorizarAcaoSchema } from '@shared/ipc'
import { authService } from '@main/services/authService'

export function registerAuthIpc(): void {
  handleIpc(IPC.auth.login, loginSchema, (input) => authService.login(input))
  handleIpc(IPC.auth.logout, null, () => authService.logout())
  handleIpc(IPC.auth.getSession, null, () => authService.getSessao())
  handleIpc(IPC.auth.trocarSenha, trocarSenhaSchema, (input) => authService.trocarSenha(input))
  handleIpc(IPC.auth.primeiroAcesso, primeiroAcessoSchema, (input) => authService.primeiroAcesso(input))
  handleIpc(IPC.auth.autorizarAcao, autorizarAcaoSchema, (input) =>
    authService.autorizarComoAdmin(input)
  )
}
