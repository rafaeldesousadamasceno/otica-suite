import { createPublicKey, verify } from 'node:crypto'

/**
 * Chave PUBLICA, par da chave PRIVADA guardada em `tools/chave-privada.pem`
 * (nunca commitada - ver .gitignore). Serve so para VERIFICAR uma licenca
 * assinada pela ferramenta separada `tools/gerar-licenca.mjs` - nao da para
 * emitir chaves novas com ela, por isso pode ficar no codigo-fonte.
 */
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAQjsHPHBmYU1dBFdOBg0r2CFtbq7uWZ9h7SaaRJ4JOeY=
-----END PUBLIC KEY-----`

const publicKey = createPublicKey(PUBLIC_KEY_PEM)

export interface LicencaPayload {
  otica: string
  fingerprint: string
  tipo: 'perpetua' | 'anual'
  /** null = sem vencimento (perpetua). */
  validade: string | null
  emitidoEm: string
}

function payloadValido(v: unknown): v is LicencaPayload {
  if (!v || typeof v !== 'object') return false
  const p = v as Record<string, unknown>
  return (
    typeof p.otica === 'string' &&
    typeof p.fingerprint === 'string' &&
    (p.tipo === 'perpetua' || p.tipo === 'anual') &&
    (p.validade === null || typeof p.validade === 'string') &&
    typeof p.emitidoEm === 'string'
  )
}

/**
 * Formato da chave: `base64url(JSON do payload).base64url(assinatura Ed25519)`.
 * Retorna o payload so se a assinatura for valida; nunca lanca excecao -
 * chave mal formada, adulterada ou corrompida vira `null`, e quem chama
 * decide a mensagem de erro (nunca vaza detalhe de criptografia pro usuario).
 */
export function verificarChave(chave: string): LicencaPayload | null {
  const partes = chave.trim().split('.')
  if (partes.length !== 2) return null

  try {
    const payloadBuf = Buffer.from(partes[0], 'base64url')
    const assinaturaBuf = Buffer.from(partes[1], 'base64url')

    if (!verify(null, payloadBuf, publicKey, assinaturaBuf)) return null

    const payload: unknown = JSON.parse(payloadBuf.toString('utf8'))
    return payloadValido(payload) ? payload : null
  } catch {
    return null
  }
}
