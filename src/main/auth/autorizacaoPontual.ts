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
