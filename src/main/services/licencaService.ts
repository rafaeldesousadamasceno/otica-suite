import { writeFileSync } from 'node:fs'
import { paths } from '@main/paths'
import { requirePermissao } from '@main/auth/session'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { verificarChave } from '@main/license/chave'
import { obterFingerprint } from '@main/license/fingerprint'
import { obterLicencaInfo, invalidarCacheLicenca } from '@main/license/estado'
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

    const payload = verificarChave(input.chave)
    if (!payload) {
      throw Errors.validacao('Chave de licença inválida.')
    }
    if (payload.fingerprint !== obterFingerprint()) {
      throw Errors.validacao('Esta chave foi emitida para outra máquina.')
    }

    writeFileSync(paths.licenca(), input.chave, 'utf8')
    invalidarCacheLicenca()

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'ATIVAR_LICENCA',
      entidade: 'licenca',
      valorNovo: { otica: payload.otica, tipo: payload.tipo, validade: payload.validade }
    })

    return obterLicencaInfo()
  }
}
