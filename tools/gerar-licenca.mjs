#!/usr/bin/env node
// Ferramenta separada de emissao de licencas (RF-13.4/14.4) - uso EXCLUSIVO
// do fornecedor. NUNCA distribua este script nem `chave-privada.pem` junto
// com o instalador da otica: quem tiver a chave privada emite licenca para
// qualquer maquina.
//
// Uso:
//   node tools/gerar-licenca.mjs --otica "Ótica Exemplo" --fingerprint ABCDEF0123456789 --tipo anual --validade 2027-01-15
//   node tools/gerar-licenca.mjs --otica "Ótica Exemplo" --fingerprint ABCDEF0123456789 --tipo perpetua
//
// O fingerprint aparece na tela "Licença" do app, na maquina do cliente
// (RF-13.4) - peca para ele te mandar antes de gerar a chave.

import { readFileSync, existsSync } from 'node:fs'
import { createPrivateKey, sign } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CHAVE_PRIVADA_PATH = join(__dirname, 'chave-privada.pem')

function parseArgs() {
  const args = {}
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i += 2) {
    const chave = argv[i]?.replace(/^--/, '')
    if (chave) args[chave] = argv[i + 1]
  }
  return args
}

function main() {
  if (!existsSync(CHAVE_PRIVADA_PATH)) {
    console.error(`Chave privada não encontrada em ${CHAVE_PRIVADA_PATH}.`)
    console.error('Gere um par de chaves Ed25519 e guarde a privada aqui (nunca comite este arquivo).')
    process.exit(1)
  }

  const { otica, fingerprint, tipo, validade } = parseArgs()

  if (!otica || !fingerprint || !tipo) {
    console.error(
      'Uso: node gerar-licenca.mjs --otica "Nome da Ótica" --fingerprint XXXX --tipo perpetua|anual [--validade YYYY-MM-DD]'
    )
    process.exit(1)
  }
  if (tipo !== 'perpetua' && tipo !== 'anual') {
    console.error('--tipo precisa ser "perpetua" ou "anual".')
    process.exit(1)
  }
  if (tipo === 'anual' && !validade) {
    console.error('Licença anual exige --validade YYYY-MM-DD.')
    process.exit(1)
  }

  const payload = {
    otica,
    fingerprint: fingerprint.trim().toUpperCase(),
    tipo,
    validade: tipo === 'perpetua' ? null : validade,
    emitidoEm: new Date().toISOString().slice(0, 10)
  }

  const privateKey = createPrivateKey(readFileSync(CHAVE_PRIVADA_PATH, 'utf8'))
  const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8')
  const assinatura = sign(null, payloadBuf, privateKey)

  const chave = `${payloadBuf.toString('base64url')}.${assinatura.toString('base64url')}`

  console.log('\nChave de licença gerada:\n')
  console.log(chave)
  console.log('\nDados:', payload, '\n')
}

main()
