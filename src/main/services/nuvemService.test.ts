import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@main/errors'

const { sessao, worker, registrar, permissao } = vi.hoisted(() => ({
  sessao: { usuario: { id: 7, perfil: 'admin' } },
  worker: {
    ligarNuvem: vi.fn(),
    desligarNuvem: vi.fn(),
    sincronizarAgora: vi.fn(async () => undefined),
    obterStatusNuvem: vi.fn()
  },
  registrar: vi.fn(),
  permissao: { negar: false }
}))
vi.mock('@main/auth/session', () => ({
  requirePermissao: () => {
    if (permissao.negar) throw new AppError('SEM_PERMISSAO', 'Você não tem permissão para esta ação.')
    return sessao
  }
}))
vi.mock('@main/sync/workerNuvem', () => worker)
vi.mock('@main/repositories/auditoriaRepository', () => ({ auditoriaRepository: { registrar } }))

import { nuvemService } from './nuvemService'
import { nuvemLigarSchema } from '@shared/ipc'

beforeEach(() => {
  vi.clearAllMocks()
  permissao.negar = false
})

describe('nuvemService', () => {
  it('ligar grava auditoria NUVEM_LIGADA com a versão do termo', () => {
    nuvemService.ligar({ versaoTermo: 1 })
    expect(worker.ligarNuvem).toHaveBeenCalledWith({ versao: 1, usuarioId: 7 })
    expect(registrar).toHaveBeenCalledWith({
      usuarioId: 7,
      acao: 'NUVEM_LIGADA',
      entidade: 'nuvem',
      valorNovo: { versaoTermo: 1 }
    })
  })

  it('desligar grava NUVEM_DESLIGADA', () => {
    nuvemService.desligar()
    expect(worker.desligarNuvem).toHaveBeenCalled()
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ usuarioId: 7, acao: 'NUVEM_DESLIGADA', entidade: 'nuvem' }))
  })

  it('sincronizarAgora com a nuvem desligada falha com mensagem clara', async () => {
    worker.obterStatusNuvem.mockReturnValue({ ligada: false })
    await expect(nuvemService.sincronizarAgora()).rejects.toThrow('Ligue a nuvem antes de sincronizar.')
    expect(worker.sincronizarAgora).not.toHaveBeenCalled()
  })

  it('sincronizarAgora com a nuvem ligada chama o worker', async () => {
    worker.obterStatusNuvem.mockReturnValue({ ligada: true })
    await nuvemService.sincronizarAgora()
    expect(worker.sincronizarAgora).toHaveBeenCalled()
  })

  it('vendedor é barrado', async () => {
    permissao.negar = true
    expect(() => nuvemService.obterStatus()).toThrow()
    expect(() => nuvemService.ligar({ versaoTermo: 1 })).toThrow()
    expect(() => nuvemService.desligar()).toThrow()
    await expect(nuvemService.sincronizarAgora()).rejects.toThrow()
    expect(worker.ligarNuvem).not.toHaveBeenCalled()
  })

  it('versão de termo diferente da atual é recusada pelo schema', () => {
    expect(nuvemLigarSchema.safeParse({ versaoTermo: 99 }).success).toBe(false)
    expect(nuvemLigarSchema.safeParse({ versaoTermo: 1 }).success).toBe(true)
  })
})
