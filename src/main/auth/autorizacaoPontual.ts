import { authService } from '@main/services/authService'
import { Errors } from '@main/errors'
import type { Sessao } from '@shared/types'

interface CredencialAdmin {
  loginAdmin: string
  senhaAdmin: string
}

/**
 * RF-03.4: autorizacao pontual do Admin para uma acao sensivel iniciada
 * pelo Vendedor (desconto acima do teto, cancelamento de venda etc.) -
 * sem trocar a sessao ativa.
 *
 * Admin agindo por conta propria nunca precisa disso (retorna null - a
 * acao fica registrada so em nome de quem executou). Vendedor sem
 * credencial recebe um erro com `code: 'AUTORIZACAO_ADMIN_NECESSARIA'`,
 * que a UI reconhece para abrir o dialogo de credencial e reenviar a
 * mesma chamada com `autorizacaoAdmin` preenchido.
 */
export async function resolverAutorizador(
  sessao: Sessao,
  credencial: CredencialAdmin | undefined | null,
  motivoSeFaltando: string
): Promise<number | null> {
  if (sessao.usuario.perfil === 'admin') return null
  if (!credencial) throw Errors.autorizacaoAdminNecessaria(motivoSeFaltando)

  const admin = await authService.autorizarComoAdmin({
    loginAdmin: credencial.loginAdmin,
    senhaAdmin: credencial.senhaAdmin
  })
  return admin.id
}

/**
 * Acao tao grave que ate o Administrador logado precisa CONFIRMAR digitando a propria senha (excluir uma venda com
 * dinheiro ja recebido, por exemplo): um clique so nao basta. Diferente de `resolverAutorizador`, nunca dispensa a
 * credencial, e ela precisa ser a do PROPRIO usuario da sessao (outra conta de administrador nao serve). Devolve o
 * id de quem confirmou, para ficar na auditoria. Sem credencial, o erro e o mesmo `AUTORIZACAO_ADMIN_NECESSARIA`.
 */
export async function exigirSenhaDoProprioAdmin(
  sessao: Sessao,
  credencial: CredencialAdmin | undefined | null,
  motivoSeFaltando: string
): Promise<number> {
  if (sessao.usuario.perfil !== 'admin') throw Errors.semPermissao()
  if (!credencial) throw Errors.autorizacaoAdminNecessaria(motivoSeFaltando)

  const admin = await authService.autorizarComoAdmin({
    loginAdmin: credencial.loginAdmin,
    senhaAdmin: credencial.senhaAdmin
  })
  if (admin.id !== sessao.usuario.id) {
    throw Errors.validacao('Digite a sua própria senha de Administrador para liberar esta exclusão.')
  }
  return admin.id
}
