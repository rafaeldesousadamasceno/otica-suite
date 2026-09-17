import { randomBytes } from 'node:crypto'
import { argon2id, argon2Verify } from 'hash-wasm'

/**
 * Hash de senha com Argon2id (PRD NF 8.3), via WASM puro - sem modulo
 * nativo, sem passo de rebuild no instalador (D1: nunca texto puro).
 *
 * Parametros ajustados para um app desktop de balcao: ~150ms por hash em
 * hardware modesto, memoria suficiente para dificultar ataque por GPU sem
 * pesar em uma maquina de loja.
 */
const ARGON2_OPTIONS = {
  parallelism: 1,
  iterations: 3,
  memorySize: 19456, // 19 MiB
  hashLength: 32
} as const

export async function hashPassword(senha: string): Promise<string> {
  const salt = randomBytes(16)
  return argon2id({
    password: senha,
    salt,
    ...ARGON2_OPTIONS,
    outputType: 'encoded'
  })
}

export async function verifyPassword(senha: string, hash: string): Promise<boolean> {
  try {
    return await argon2Verify({ password: senha, hash })
  } catch {
    // hash em formato inesperado/corrompido - trata como senha incorreta,
    // nunca deixa vazar detalhe do erro para quem esta tentando logar.
    return false
  }
}
