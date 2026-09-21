import { requirePermissao } from '@main/auth/session'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { verificarChave } from '@main/license/chave'
import { ativarLicenca, obterLicencaInfo } from '@main/license/service'
import { Errors } from '@main/errors'
import type { LicencaInfo } from '@shared/types'
import type { LicencaAtivarInput } from '@shared/ipc'

export const licencaService = {
  obterStatus(): LicencaInfo {
    requirePermissao('licenca', 'ver')
    return obterLicencaInfo()
  },

  ativar(input: LicencaAtivarInput): LicencaInfo {
    const sessao = requirePermissao('licenca', 'editar')

    let info: LicencaInfo
    try {
      // Valida assinatura, máquina e prazo (a chave nova precisa aumentar o tempo restante).
      info = ativarLicenca(input.chave)
    } catch (e) {
      throw Errors.validacao((e as Error).message)
    }

    const payload = verificarChave(input.chave)
    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'ATIVAR_LICENCA',
      entidade: 'licenca',
      valorNovo: { cliente: payload?.cliente, plano: payload?.plano, validade: payload?.validade }
    })

    return info
  }
}
