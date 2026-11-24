import { beforeEach, describe, expect, it, vi } from 'vitest'

const { repo, marcarReenvioTotal, registrar, ordem } = vi.hoisted(() => {
  const ordem: string[] = []
  return {
    ordem,
    repo: {
      criarArquivoBackup: vi.fn(() => {
        ordem.push('backup-de-seguranca')
        return { arquivo: 'seguranca.db', tamanhoBytes: 1, integro: true }
      }),
      restaurar: vi.fn((_arquivo: string) => {
        ordem.push('restaurar')
      }),
      listarBackups: vi.fn(() => []),
      aplicarRetencao: vi.fn()
    },
    marcarReenvioTotal: vi.fn(() => {
      ordem.push('marcar-reenvio-total')
    }),
    registrar: vi.fn()
  }
})
vi.mock('@main/repositories/backupRepository', () => repo)
vi.mock('@main/sync/workerNuvem', () => ({ marcarReenvioTotal }))
vi.mock('@main/repositories/auditoriaRepository', () => ({ auditoriaRepository: { registrar } }))
vi.mock('@main/auth/session', () => ({ requirePermissao: () => ({ usuario: { id: 7, perfil: 'admin' } }) }))
vi.mock('@main/paths', () => ({ paths: { backups: () => 'C:/backups' } }))

import { backupService } from './backupService'

beforeEach(() => {
  vi.clearAllMocks()
  ordem.length = 0
})

describe('backupService.restaurar', () => {
  it('depois de restaurar com sucesso, marca o reenvio total para a nuvem', () => {
    backupService.restaurar({ arquivo: 'C:/backups/backup-1.db' })
    expect(repo.restaurar).toHaveBeenCalledWith('C:/backups/backup-1.db')
    expect(marcarReenvioTotal).toHaveBeenCalledTimes(1)
    expect(ordem).toEqual(['backup-de-seguranca', 'restaurar', 'marcar-reenvio-total'])
  })

  it('restauração que falha não mexe no estado da nuvem', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    repo.restaurar.mockImplementationOnce(() => {
      throw new Error('arquivo corrompido')
    })
    expect(() => backupService.restaurar({ arquivo: 'C:/backups/ruim.db' })).toThrow('Não foi possível restaurar')
    expect(marcarReenvioTotal).not.toHaveBeenCalled()
    expect(registrar).not.toHaveBeenCalled()
  })
})
