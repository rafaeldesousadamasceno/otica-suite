import { describe, expect, it, vi } from 'vitest'

// Só o encerramento: o resto do index (janela, IPC, migrações) não roda aqui (whenReady nunca resolve).
const { handlers, ordem } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => void>(),
  ordem: [] as string[]
}))
vi.mock('electron', () => ({
  app: {
    on: (evento: string, fn: (...args: unknown[]) => void) => handlers.set(evento, fn),
    whenReady: () => new Promise(() => {}),
    quit: () => ordem.push('quit')
  },
  BrowserWindow: { getAllWindows: () => [] },
  dialog: {},
  shell: {}
}))
vi.mock('@electron-toolkit/utils', () => ({ electronApp: {}, is: { dev: false }, optimizer: {} }))
vi.mock('@main/db/connection', () => ({ getDb: vi.fn(), closeDb: () => ordem.push('closeDb') }))
vi.mock('@main/db/migrator', () => ({ MigrationError: class extends Error {} }))
vi.mock('@main/ipc/registerIpc', () => ({ registerAllIpc: vi.fn() }))
vi.mock('@main/services/backupService', () => ({ iniciarAgendadorBackup: vi.fn() }))
vi.mock('@main/sync/workerNuvem', () => ({
  iniciarWorkerNuvem: vi.fn(),
  pararWorkerNuvem: () => ordem.push('pararWorkerNuvem')
}))
vi.mock('../../resources/icon.png?asset', () => ({ default: 'icon.png' }))

describe('encerramento do app', () => {
  it('fechar todas as janelas para o worker da nuvem antes de fechar o banco', async () => {
    await import('./index')
    const fechar = handlers.get('window-all-closed')
    expect(fechar).toBeDefined()
    fechar!()
    expect(ordem.indexOf('pararWorkerNuvem')).toBeGreaterThanOrEqual(0)
    expect(ordem.indexOf('pararWorkerNuvem')).toBeLessThan(ordem.indexOf('closeDb'))
  })
})
