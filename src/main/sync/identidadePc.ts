import { createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bytesParaBase64url } from '../../../supabase/functions/pc-token/logica'
import { gravarEstado, lerEstado } from './estadoNuvem'

export interface Cofre {
  disponivel(): boolean
  cifrar(texto: string): Buffer
  decifrar(dados: Buffer): string
}

export interface IdentidadePc {
  dispositivoId: string
  /** Ed25519 SPKI DER em base64. */
  chavePublica: string
  /** Ed25519 sobre os bytes dados; retorna base64url. */
  assinar(dados: Uint8Array): string
  nova: boolean
}

export interface DepsIdentidade {
  pasta: string
  cofre: Cofre
  fingerprint: string
  lerDispositivoId(): string
  gravarDispositivoId(id: string): void
}

function montar(privadaB64: string, dispositivoId: string, nova: boolean): IdentidadePc {
  const privada = createPrivateKey({ key: Buffer.from(privadaB64, 'base64'), format: 'der', type: 'pkcs8' })
  const chavePublica = (createPublicKey(privada).export({ type: 'spki', format: 'der' }) as Buffer).toString('base64')
  return { dispositivoId, chavePublica, nova, assinar: (dados) => bytesParaBase64url(sign(null, dados, privada)) }
}

function gerarPrivada(): string {
  const { privateKey } = generateKeyPairSync('ed25519')
  return (privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64')
}

export function carregarIdentidadePc(d: DepsIdentidade): IdentidadePc {
  if (!d.cofre.disponivel()) throw new Error('Criptografia do sistema indisponível neste computador.')
  const arqChave = join(d.pasta, 'nuvem-chave.bin')
  const arqEstado = join(d.pasta, 'nuvem-estado.json')
  const temChave = existsSync(arqChave)
  const estado = lerEstado(arqEstado)

  const gerar = (dispositivoId: string, nova: boolean): IdentidadePc => {
    const privada = gerarPrivada()
    writeFileSync(arqChave, d.cofre.cifrar(privada))
    gravarEstado(arqEstado, { fingerprint: d.fingerprint, cursor: 0 })
    return montar(privada, dispositivoId, nova)
  }
  const novoId = (): string => {
    const id = randomUUID()
    d.gravarDispositivoId(id)
    return id
  }

  if (!temChave) return estado ? gerar(novoId(), true) : gerar(d.lerDispositivoId(), false)
  if (estado && estado.fingerprint !== d.fingerprint) return gerar(novoId(), true)

  const privada = d.cofre.decifrar(readFileSync(arqChave))
  if (!estado) gravarEstado(arqEstado, { fingerprint: d.fingerprint, cursor: 0 })
  return montar(privada, d.lerDispositivoId(), false)
}
