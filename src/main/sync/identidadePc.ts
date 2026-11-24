import { createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bytesParaBase64url, ehUuid } from '../../../supabase/functions/pc-token/logica'
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
  /** `configuracao.sync_dispositivo_id`, ou null se ausente. */
  lerDispositivoId(): string | null
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

/** Id com que a chave deste PC foi registrada na nuvem. Ausente ou inválido vira null. */
function lerIdDaChave(arquivo: string): string | null {
  try {
    const j = JSON.parse(readFileSync(arquivo, 'utf8')) as { dispositivoId?: unknown } | null
    return ehUuid(j?.dispositivoId) ? j.dispositivoId : null
  } catch {
    return null
  }
}

function gravarIdDaChave(arquivo: string, dispositivoId: string): void {
  const tmp = `${arquivo}.tmp`
  writeFileSync(tmp, JSON.stringify({ dispositivoId }))
  renameSync(tmp, arquivo)
}

/**
 * A chave e o id andam juntos: o id fica em `nuvem-dispositivo.json`, ao lado da chave, e vale mais que o do
 * banco (um backup restaurado traz o `sync_dispositivo_id` de outra época ou de outro PC). Sem chave, a
 * identidade é sempre nova (chave e id novos); o banco só recebe uma cópia do id.
 */
export function carregarIdentidadePc(d: DepsIdentidade): IdentidadePc {
  if (!d.cofre.disponivel()) throw new Error('Criptografia do sistema indisponível neste computador.')
  const arqChave = join(d.pasta, 'nuvem-chave.bin')
  const arqId = join(d.pasta, 'nuvem-dispositivo.json')
  const arqEstado = join(d.pasta, 'nuvem-estado.json')
  const estado = lerEstado(arqEstado)

  const gerar = (): IdentidadePc => {
    const id = randomUUID()
    const privada = gerarPrivada()
    // O id vai para o disco ANTES da chave: se o processo cair no meio, nunca sobra chave nova com id velho.
    gravarIdDaChave(arqId, id)
    writeFileSync(arqChave, d.cofre.cifrar(privada))
    gravarEstado(arqEstado, { fingerprint: d.fingerprint, cursor: 0 })
    d.gravarDispositivoId(id)
    return montar(privada, id, true)
  }

  if (!existsSync(arqChave)) return gerar()
  if (estado && estado.fingerprint !== d.fingerprint) return gerar()

  const privada = d.cofre.decifrar(readFileSync(arqChave))
  let id = lerIdDaChave(arqId)
  if (id) {
    if (d.lerDispositivoId() !== id) d.gravarDispositivoId(id)
  } else {
    // Chave criada antes de existir o arquivo de id: ela foi registrada com o id do banco.
    const doBanco = d.lerDispositivoId()
    if (!ehUuid(doBanco)) return gerar()
    id = doBanco
    gravarIdDaChave(arqId, id)
  }
  if (!estado) gravarEstado(arqEstado, { fingerprint: d.fingerprint, cursor: 0 })
  return montar(privada, id, false)
}
