import { createPublicKey, randomBytes, verify } from 'node:crypto'
import { CHAVE_PUBLICA_PEM } from '@main/license/chavePublica'

/**
 * Recuperação de senha do Administrador, sem internet e sem e-mail: desafio e
 * resposta assinada pelo fornecedor (mesma chave Ed25519 da licença).
 *
 *  1. O app gera um PEDIDO = fingerprint da máquina (32 hex) + número aleatório
 *     de uso único (16 hex), mostrado na tela de login.
 *  2. O dono do sistema envia o pedido ao fornecedor, que confirma quem é
 *     (a confiança é humana) e devolve um CÓDIGO assinado para aquele pedido.
 *  3. O app confere a assinatura, a máquina e o número, e só então deixa
 *     escolher um Administrador e uma senha nova.
 *
 * Por que assinado e não um "arquivo de reset": quem tem acesso ao Windows da
 * loja (um funcionário, por exemplo) não consegue se promover a Administrador;
 * só quem tem a chave privada autoriza.
 *
 * O código é preso à máquina (fingerprint) e ao pedido (número aleatório, apagado
 * depois do uso), então não serve em outro computador nem pode ser reaproveitado.
 *
 * ⚠️ O formato é um contrato com quem assina (tools/gerar-codigo-recuperacao.mjs
 * e a Central de Licenças): mude os dois juntos.
 */

/**
 * Prefixo assinado junto com o conteúdo (separação de domínio): uma assinatura
 * de licença nunca vale como código de recuperação, nem o contrário.
 */
export const DOMINIO_ASSINATURA = 'OTICASUITE-RECUPERACAO-SENHA-v1\n'
export const TIPO_CODIGO = 'recuperacao_senha'

const FINGERPRINT_HEX = 32
const NONCE_HEX = 16

/** Um pedido pendente vale por este tempo; depois disso gera-se outro. */
export const VALIDADE_PEDIDO_MS = 7 * 24 * 60 * 60 * 1000

export interface PedidoPendente {
  nonce: string
  criadoEm: number
}

export interface CodigoRecuperacaoPayload {
  tipo: typeof TIPO_CODIGO
  fingerprint: string
  nonce: string
  emitidoEm: string
}

function soHex(texto: string): string {
  return texto.replace(/[^0-9a-fA-F]/g, '').toUpperCase()
}

export function gerarNonce(): string {
  return randomBytes(NONCE_HEX / 2).toString('hex').toUpperCase()
}

/** "ABCD-EF01-…": grupos de 4, para ler e digitar sem erro. */
export function formatarPedido(fingerprint: string, nonce: string): string {
  const hex = soHex(fingerprint) + soHex(nonce)
  return (hex.match(/.{1,4}/g) ?? []).join('-')
}

/** Aceita o pedido com ou sem hífens/espaços e devolve as duas partes, ou null se malformado. */
export function lerPedido(texto: string): { fingerprint: string; nonce: string } | null {
  const hex = soHex(texto)
  if (hex.length !== FINGERPRINT_HEX + NONCE_HEX) return null
  return { fingerprint: hex.slice(0, FINGERPRINT_HEX), nonce: hex.slice(FINGERPRINT_HEX) }
}

export function pedidoExpirado(pendente: PedidoPendente, agora: number = Date.now()): boolean {
  return agora - pendente.criadoEm > VALIDADE_PEDIDO_MS
}

/**
 * Formato do código: `base64url(JSON do payload).base64url(assinatura Ed25519)`,
 * a assinatura cobrindo `DOMINIO_ASSINATURA + payload`. Devolve o payload só se a
 * assinatura for válida, o tipo certo e se bater com ESTA máquina e ESTE pedido;
 * nunca lança (código errado vira `null`, sem detalhe de criptografia).
 */
export function verificarCodigoRecuperacao(
  codigo: string,
  esperado: { fingerprint: string; nonce: string },
  chavePublicaPem: string = CHAVE_PUBLICA_PEM
): CodigoRecuperacaoPayload | null {
  const partes = codigo.replace(/\s+/g, '').split('.')
  if (partes.length !== 2) return null

  try {
    const payloadBuf = Buffer.from(partes[0], 'base64url')
    const assinatura = Buffer.from(partes[1], 'base64url')
    const assinado = Buffer.concat([Buffer.from(DOMINIO_ASSINATURA, 'utf8'), payloadBuf])
    if (!verify(null, assinado, createPublicKey(chavePublicaPem), assinatura)) return null

    const p = JSON.parse(payloadBuf.toString('utf8')) as Record<string, unknown>
    if (p.tipo !== TIPO_CODIGO) return null
    if (typeof p.fingerprint !== 'string' || typeof p.nonce !== 'string') return null
    if (soHex(p.fingerprint) !== soHex(esperado.fingerprint)) return null
    if (soHex(p.nonce) !== soHex(esperado.nonce)) return null

    return {
      tipo: TIPO_CODIGO,
      fingerprint: soHex(p.fingerprint),
      nonce: soHex(p.nonce),
      emitidoEm: typeof p.emitidoEm === 'string' ? p.emitidoEm : ''
    }
  } catch {
    return null
  }
}
