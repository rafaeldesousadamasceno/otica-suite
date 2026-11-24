import { requirePermissao } from '@main/auth/session'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { Errors } from '@main/errors'
import { desligarNuvem, ligarNuvem, obterStatusNuvem, sincronizarAgora } from '@main/sync/workerNuvem'
import type { NuvemStatus } from '@shared/types'
import type { NuvemLigarInput } from '@shared/ipc'

export const nuvemService = {
  obterStatus(): NuvemStatus {
    requirePermissao('nuvem', 'ver')
    return obterStatusNuvem()
  },

  /** A auditoria NUVEM_LIGADA (usuario + versao do termo) e a prova duravel do consentimento. */
  ligar(input: NuvemLigarInput): void {
    const sessao = requirePermissao('nuvem', 'editar')
    ligarNuvem({ versao: input.versaoTermo, usuarioId: sessao.usuario.id })
    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'NUVEM_LIGADA',
      entidade: 'nuvem',
      valorNovo: { versaoTermo: input.versaoTermo }
    })
  },

  desligar(): void {
    const sessao = requirePermissao('nuvem', 'editar')
    desligarNuvem()
    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'NUVEM_DESLIGADA',
      entidade: 'nuvem'
    })
  },

  async sincronizarAgora(): Promise<void> {
    requirePermissao('nuvem', 'editar')
    if (!obterStatusNuvem().ligada) throw Errors.validacao('Ligue a nuvem antes de sincronizar.')
    await sincronizarAgora()
  }
}
