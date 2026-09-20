import { createPublicKey, verify } from 'node:crypto'
import { CHAVE_PUBLICA_PEM } from './chavePublica'

/**
 * Formato `padrao` da Central de Licenças — o mesmo que ela assina:
 * `{ cliente, fingerprint, validade, emitidoEm, plano? }`. Sem campo `tipo`: a
 * chave pública embutida já escopa a licença ao produto certo.
 */
export interface LicencaPayload {
  cliente: string
  fingerprint: string
  /** Última data de uso (YYYY-MM-DD). null = sem vencimento. */
  validade: string | null
  /** Data de emissão (YYYY-MM-DD) — âncora confiável de "hoje" e ordenação de renovações. */
  emitidoEm: string
  /** 'mensal' | 'anual' | …; ausente em chaves emitidas sem plano. */
  plano: string | null
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

export function ehDataIso(v: unknown): v is string {
  return typeof v === 'string' && DATA_ISO.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))
}

function payloadValido(v: unknown): LicencaPayload | null {
  if (!v || typeof v !== 'object') return null
  const p = v as Record<string, unknown>
  if (typeof p.cliente !== 'string' || typeof p.fingerprint !== 'string') return null
  if (!ehDataIso(p.emitidoEm)) return null
  if (p.validade !== null && !ehDataIso(p.validade)) return null
  return {
    cliente: p.cliente,
    fingerprint: p.fingerprint,
    validade: p.validade,
    emitidoEm: p.emitidoEm,
    plano: typeof p.plano === 'string' ? p.plano : null
  }
}

/** Fingerprint sem espaços/hífens e em maiúsculas — tolera colagem por WhatsApp/e-mail. */
export function normalizarFingerprint(texto: string): string {
  return texto.replace(/[^0-9a-fA-F]/g, '').toUpperCase()
}

/**
 * Formato da chave: `base64url(JSON do payload).base64url(assinatura Ed25519)`.
 * Devolve o payload só se a assinatura for válida; nunca lança — chave mal
 * formada, adulterada ou de outro produto vira `null` e quem chama decide a
 * mensagem (nunca vaza detalhe de criptografia para o usuário). Espaços e
 * quebras de linha são ignorados: mensageiros costumam quebrar chaves longas.
 */
export function verificarChave(
  chave: string,
  chavePublicaPem: string = CHAVE_PUBLICA_PEM
): LicencaPayload | null {
  const partes = chave.replace(/\s+/g, '').split('.')
  if (partes.length !== 2) return null

  try {
    const payloadBuf = Buffer.from(partes[0], 'base64url')
    const assinaturaBuf = Buffer.from(partes[1], 'base64url')

    if (!verify(null, payloadBuf, createPublicKey(chavePublicaPem), assinaturaBuf)) return null

    return payloadValido(JSON.parse(payloadBuf.toString('utf8')))
  } catch {
    return null
  }
}
