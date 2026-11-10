// Gera o CÓDIGO DE RECUPERAÇÃO DE SENHA a partir do PEDIDO que o cliente mostra na
// tela de login ("Esqueci minha senha"). Só quem tem a chave PRIVADA do produto
// consegue emitir — é isso que impede um funcionário de se promover a Administrador.
//
// Uso:
//   node tools/gerar-codigo-recuperacao.mjs <PEDIDO> --chave <arquivo-da-chave-privada.pem>
//
// ANTES de emitir, confirme por outro meio (ligação, vídeo) que quem pediu é o dono
// da ótica. O código só vale para aquela máquina e aquele pedido, uma única vez.
//
// O formato abaixo é um contrato com src/main/auth/recuperacao.ts — mude os dois juntos.
import { createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const DOMINIO_ASSINATURA = 'OTICASUITE-RECUPERACAO-SENHA-v1\n'
export const TIPO_CODIGO = 'recuperacao_senha'

/** Aceita o pedido com ou sem hífens/espaços; devolve { fingerprint, nonce } ou null. */
export function lerPedido(texto) {
  const hex = String(texto).replace(/[^0-9a-fA-F]/g, '').toUpperCase()
  if (hex.length !== 48) return null
  return { fingerprint: hex.slice(0, 32), nonce: hex.slice(32) }
}

export function gerarCodigo(privadaPem, pedidoTexto, hoje = new Date().toISOString().slice(0, 10)) {
  const pedido = lerPedido(pedidoTexto)
  if (!pedido) {
    throw new Error('Pedido inválido: ele tem 48 caracteres (letras A-F e números), ex.: ABCD-EF01-… Confira se copiou inteiro.')
  }
  const chave = createPrivateKey(privadaPem)
  if (chave.asymmetricKeyType !== 'ed25519') throw new Error('A chave não é Ed25519.')

  const payload = Buffer.from(
    JSON.stringify({ tipo: TIPO_CODIGO, fingerprint: pedido.fingerprint, nonce: pedido.nonce, emitidoEm: hoje }),
    'utf8'
  )
  const assinatura = sign(null, Buffer.concat([Buffer.from(DOMINIO_ASSINATURA, 'utf8'), payload]), chave)
  return `${payload.toString('base64url')}.${assinatura.toString('base64url')}`
}

function principal() {
  const args = process.argv.slice(2)
  const i = args.indexOf('--chave')
  const arquivo = i >= 0 ? args[i + 1] : undefined
  const pedido = args.filter((_, k) => k !== i && k !== i + 1).join(' ')

  if (!arquivo || !pedido) {
    console.error('Uso: node tools/gerar-codigo-recuperacao.mjs <PEDIDO> --chave <chave-privada.pem>')
    process.exit(1)
  }
  try {
    const pem = readFileSync(arquivo, 'utf8')
    const publica = createPublicKey(createPrivateKey(pem)).export({ type: 'spki', format: 'pem' }).toString().trim()
    const { fingerprint } = lerPedido(pedido) ?? {}
    console.error(`Chave pública desta chave privada:\n${publica}\n(confira se é a mesma de src/main/license/chavePublica.ts)\n`)
    console.error(`Máquina (fingerprint): ${fingerprint ?? '?'}\n`)
    console.log(gerarCodigo(pem, pedido))
  } catch (e) {
    console.error(`Erro: ${e.message}`)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal()
