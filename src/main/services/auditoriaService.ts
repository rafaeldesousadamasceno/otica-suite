import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import type { AuditoriaEntrada } from '@shared/types'

export const auditoriaService = {
  listar(): AuditoriaEntrada[] {
    requirePermissao('auditoria', 'ver')
    return auditoriaRepository.listar()
  }
}
