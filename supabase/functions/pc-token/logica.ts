/**
 * Lógica pura da Edge Function `pc-token` (sem Deno nem rede, para ser testada no vitest).
 *
 * O PC troca a LICENÇA (assinada pela Central) mais uma PROVA DE POSSE da chave dele por um token de curta
 * duração. Só WebCrypto: roda igual no Deno (Supabase) e no Node (testes).
 */

export interface LicencaPayload {
  cliente: string
  fingerprint: string
  validade: string | null
  emitidoEm: string
  plano: string | null
  /** Recursos liberados pela licença (ex.: ['nuvem']). Ausente em chaves antigas. */
  recursos: string[]
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export const ehUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

export function base64urlParaBytes(texto: string): Uint8Array {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export function bytesParaBase64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Aceita PEM (`-----BEGIN PUBLIC KEY-----`) ou só o base64 do SPKI DER. */
function spkiDer(chave: string): Uint8Array {
  const corpo = chave.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')
  return Uint8Array.from(atob(corpo), (c) => c.charCodeAt(0))
}

async function importarChavePublica(chave: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', spkiDer(chave), { name: 'Ed25519' }, false, ['verify'])
}

async function verificarEd25519(chavePublica: string, dados: Uint8Array, assinatura: Uint8Array): Promise<boolean> {
  try {
    return await crypto.subtle.verify({ name: 'Ed25519' }, await importarChavePublica(chavePublica), assinatura, dados)
  } catch {
    return false
  }
}

/** Mesmo formato de src/main/license/chave.ts: `base64url(JSON).base64url(assinatura Ed25519)`. Nunca lança. */
export async function verificarLicenca(chave: string, chavePublicaPem: string): Promise<LicencaPayload | null> {
  const partes = String(chave).replace(/\s+/g, '').split('.')
  if (partes.length !== 2) return null
  try {
    const payloadBytes = base64urlParaBytes(partes[0])
    if (!(await verificarEd25519(chavePublicaPem, payloadBytes, base64urlParaBytes(partes[1])))) return null
    const p = JSON.parse(new TextDecoder().decode(payloadBytes)) as Record<string, unknown>
    if (typeof p.cliente !== 'string' || typeof p.fingerprint !== 'string') return null
    if (typeof p.emitidoEm !== 'string' || !DATA_ISO.test(p.emitidoEm)) return null
    if (p.validade !== null && !(typeof p.validade === 'string' && DATA_ISO.test(p.validade))) return null
    return {
      cliente: p.cliente,
      fingerprint: p.fingerprint,
      validade: p.validade as string | null,
      emitidoEm: p.emitidoEm,
      plano: typeof p.plano === 'string' ? p.plano : null,
      recursos: Array.isArray(p.recursos) ? p.recursos.filter((r): r is string => typeof r === 'string') : []
    }
  } catch {
    return null
  }
}

export type MotivoRecusa = 'LICENCA_INVALIDA' | 'LICENCA_VENCIDA' | 'SEM_RECURSO_NUVEM' | 'PROVA_INVALIDA' | 'PROVA_EXPIRADA'

/**
 * Licença vale hoje? `hoje` é a data do SERVIDOR (YYYY-MM-DD). Sem carência aqui: o app dá carência ao usuário,
 * mas a nuvem só atende licença em dia. `exigirRecurso` liga a regra do plano Premium (licença com 'nuvem').
 */
export function licencaLiberaNuvem(l: LicencaPayload, hoje: string, exigirRecurso: boolean): MotivoRecusa | null {
  if (l.validade !== null && l.validade < hoje) return 'LICENCA_VENCIDA'
  if (exigirRecurso && !l.recursos.includes('nuvem')) return 'SEM_RECURSO_NUVEM'
  return null
}

/** Texto que o PC assina para provar que tem a chave privada do dispositivo. */
export function textoDaProva(lojaId: string, dispositivoId: string, timestampIso: string): Uint8Array {
  return new TextEncoder().encode(`optialeph-pc-token|${lojaId}|${dispositivoId}|${timestampIso}`)
}

/** A prova vale 5 minutos para os dois lados do relógio (impede reaproveitar uma prova interceptada). */
export async function verificarProvaDoPc(
  chavePublicaPc: string,
  lojaId: string,
  dispositivoId: string,
  timestampIso: string,
  assinaturaB64url: string,
  agoraMs: number
): Promise<MotivoRecusa | null> {
  const t = Date.parse(timestampIso)
  if (Number.isNaN(t) || Math.abs(agoraMs - t) > 5 * 60_000) return 'PROVA_EXPIRADA'
  const ok = await verificarEd25519(chavePublicaPc, textoDaProva(lojaId, dispositivoId, timestampIso), base64urlParaBytes(assinaturaB64url))
  return ok ? null : 'PROVA_INVALIDA'
}

export interface ClaimsPc {
  loja_id: string
  dispositivo_id: string
  /** Segundos desde 1970. */
  agora: number
  /** Duração em segundos (padrão 1 hora). */
  duracao?: number
}

/**
 * JWT HS256 que o PostgREST aceita: role `authenticated`, com `loja_id` e `dispositivo_id` no TOPO do token
 * (é onde `optialeph.pc_autorizado` lê; user_metadata nunca é usado).
 */
export async function montarJwtDoPc(c: ClaimsPc, segredo: string): Promise<{ token: string; expiraEm: number }> {
  const exp = c.agora + (c.duracao ?? 3600)
  const enc = (o: unknown) => bytesParaBase64url(new TextEncoder().encode(JSON.stringify(o)))
  const corpo = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({
    aud: 'authenticated',
    role: 'authenticated',
    sub: c.dispositivo_id,
    loja_id: c.loja_id,
    dispositivo_id: c.dispositivo_id,
    iat: c.agora,
    exp
  })}`
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const assinatura = new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpo)))
  return { token: `${corpo}.${bytesParaBase64url(assinatura)}`, expiraEm: exp }
}
