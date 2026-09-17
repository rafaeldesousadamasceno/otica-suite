import { empresaRepository } from '@main/repositories/empresaRepository'
import { usuarioRepository } from '@main/repositories/usuarioRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { hashPassword } from '@main/auth/password'
import { Errors } from '@main/errors'
import type { BootstrapState } from '@shared/types'
import type { SetupInput } from '@shared/ipc'

export const setupService = {
  getBootstrapState(): BootstrapState {
    return { configurado: empresaRepository.existe() && usuarioRepository.existeAlgum() }
  },

  /**
   * RF-02, passos 2-4 do wizard: cria a empresa e o usuario Administrador
   * inicial numa unica chamada. So pode rodar uma vez - depois disso a
   * tela de setup nunca mais aparece (o app abre direto no login).
   */
  async completeSetup(input: SetupInput): Promise<void> {
    if (empresaRepository.existe()) throw Errors.jaConfigurado()

    empresaRepository.criar(input.empresa.nomeFantasia.trim(), input.empresa.cnpj?.trim() || null)

    const senhaHash = await hashPassword(input.admin.senha)
    const adminId = usuarioRepository.criar(
      input.admin.nome.trim(),
      input.admin.login.trim(),
      senhaHash,
      'admin'
    )

    auditoriaRepository.registrar({
      usuarioId: adminId,
      acao: 'SETUP_INICIAL',
      entidade: 'empresa'
    })
  }
}
