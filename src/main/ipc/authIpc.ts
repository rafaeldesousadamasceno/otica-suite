import { handleIpc } from './handle'
import {
  IPC,
  loginSchema,
  trocarSenhaSchema,
  primeiroAcessoSchema,
  autorizarAcaoSchema,
  recuperacaoCodigoSchema,
  recuperacaoRedefinirSchema
} from '@shared/ipc'
import { authService } from '@main/services/authService'
import { recuperacaoSenhaService } from '@main/services/recuperacaoSenhaService'
import { limparPdfs } from '@main/relatorios/pdf'

export function registerAuthIpc(): void {
  handleIpc(IPC.auth.login, loginSchema, (input) => authService.login(input))
  handleIpc(IPC.auth.logout, null, () => {
    authService.logout()
    limparPdfs()
  })
  handleIpc(IPC.auth.getSession, null, () => authService.getSessao())
  handleIpc(IPC.auth.trocarSenha, trocarSenhaSchema, (input) => authService.trocarSenha(input))
  handleIpc(IPC.auth.primeiroAcesso, primeiroAcessoSchema, (input) => authService.primeiroAcesso(input))
  handleIpc(IPC.auth.autorizarAcao, autorizarAcaoSchema, (input) =>
    authService.autorizarComoAdmin(input)
  )
  // Recuperacao de senha do Admin: antes do login, protegida pelo codigo assinado.
  handleIpc(IPC.auth.recuperacaoPedido, null, () => recuperacaoSenhaService.gerarPedido())
  handleIpc(IPC.auth.recuperacaoVerificar, recuperacaoCodigoSchema, (input) =>
    recuperacaoSenhaService.verificarCodigo(input)
  )
  handleIpc(IPC.auth.recuperacaoRedefinir, recuperacaoRedefinirSchema, (input) =>
    recuperacaoSenhaService.redefinir(input)
  )
}
