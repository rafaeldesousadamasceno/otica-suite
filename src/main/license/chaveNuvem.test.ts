import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const FP = 'ABCDEF0123456789ABCDEF0123456789'

const { pasta, electron } = vi.hoisted(() => ({
  pasta: { dir: '' },
  electron: { app: { isPackaged: false, getPath: () => '' } }
}))
vi.mock('electron', () => electron)
vi.mock('@main/paths', () => ({
  paths: { root: () => pasta.dir, licenca: () => join(pasta.dir, 'license.dat') }
}))
vi.mock('@main/db/connection', () => ({
  getDb: () => {
    throw new Error('a chave da nuvem não deveria tocar no banco')
  }
}))
vi.mock('./fingerprint', () => ({ obterFingerprint: () => FP }))

import { hojeLocalIso } from './estado'
import { obterChaveParaNuvem } from './service'

// Mesmo molde de chave.test.ts: base64url(payload).base64url(assinatura Ed25519).
function parDeChaves(): { publicaPem: string; emitir: (payload: unknown) => string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return {
    publicaPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    emitir: (payload) => {
      const buf = Buffer.from(JSON.stringify(payload), 'utf8')
      return `${buf.toString('base64url')}.${sign(null, buf, privateKey).toString('base64url')}`
    }
  }
}

const PAYLOAD = { cliente: 'Clínica Teste', fingerprint: FP, validade: '2099-12-31', emitidoEm: '2026-09-01', plano: 'anual' }

const produto = parDeChaves()
const instalar = (chave: string): void => writeFileSync(join(pasta.dir, 'license.dat'), chave, 'utf8')

beforeAll(() => {
  pasta.dir = mkdtempSync(join(tmpdir(), 'chave-nuvem-'))
})
afterAll(() => rmSync(pasta.dir, { recursive: true, force: true }))

beforeEach(() => {
  rmSync(join(pasta.dir, 'license.dat'), { force: true })
  electron.app.isPackaged = false
  // Fora do build empacotado: liga a cobrança e troca a chave pública pela do par descartável.
  vi.stubEnv('OTICASUITE_FORCAR_LICENCA', '1')
  vi.stubEnv('OTICASUITE_CHAVE_PUBLICA_TESTE', produto.publicaPem)
})
afterEach(() => vi.unstubAllEnvs())

describe('obterChaveParaNuvem', () => {
  it('só devolve a chave quando assinatura e fingerprint conferem', () => {
    expect(obterChaveParaNuvem()).toBeNull() // nenhuma chave instalada

    const boa = produto.emitir(PAYLOAD)
    instalar(boa)
    expect(obterChaveParaNuvem()).toBe(boa)

    // Arquivo com quebra de linha no fim (colado à mão): sai sem espaços.
    instalar(`${boa}\r\n`)
    expect(obterChaveParaNuvem()).toBe(boa)

    instalar(parDeChaves().emitir(PAYLOAD)) // assinada por outro par
    expect(obterChaveParaNuvem()).toBeNull()

    instalar(produto.emitir({ ...PAYLOAD, fingerprint: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF' })) // outra máquina
    expect(obterChaveParaNuvem()).toBeNull()

    instalar('lixo')
    expect(obterChaveParaNuvem()).toBeNull()
  })

  it('licença vencida não libera', () => {
    instalar(produto.emitir({ ...PAYLOAD, validade: '2020-01-31' }))
    expect(obterChaveParaNuvem()).toBeNull()

    // A validade é o último dia de uso: hoje ainda vale (a nuvem não dá carência, mas o dia conta).
    const hoje = produto.emitir({ ...PAYLOAD, validade: hojeLocalIso() })
    instalar(hoje)
    expect(obterChaveParaNuvem()).toBe(hoje)

    const semVencimento = produto.emitir({ ...PAYLOAD, validade: null })
    instalar(semVencimento)
    expect(obterChaveParaNuvem()).toBe(semVencimento)
  })

  it('modo desenvolvimento devolve null', () => {
    instalar(produto.emitir(PAYLOAD))
    vi.stubEnv('OTICASUITE_FORCAR_LICENCA', '')
    expect(obterChaveParaNuvem()).toBeNull()
  })
})
