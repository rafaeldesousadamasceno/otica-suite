import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
// A ferramenta de assinatura do fornecedor (.mjs): o teste garante que ela e o app falam o mesmo formato.
import { gerarCodigo } from '../../../tools/gerar-codigo-recuperacao.mjs'
import {
  DOMINIO_ASSINATURA,
  formatarPedido,
  gerarNonce,
  lerPedido,
  pedidoExpirado,
  VALIDADE_PEDIDO_MS,
  verificarCodigoRecuperacao
} from './recuperacao'
import { verificarChave } from '@main/license/chave'

const FP = 'ABCDEF0123456789ABCDEF0123456789'

function par(): { publicaPem: string; privadaPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return {
    publicaPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privadaPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  }
}

describe('pedido de recuperação', () => {
  it('formata em grupos de 4 e é lido de volta com ou sem hífens e espaços', () => {
    const nonce = gerarNonce()
    expect(nonce).toMatch(/^[0-9A-F]{16}$/)
    const pedido = formatarPedido(FP, nonce)
    expect(pedido).toMatch(/^([0-9A-F]{4}-){11}[0-9A-F]{4}$/)
    expect(lerPedido(pedido)).toEqual({ fingerprint: FP, nonce })
    expect(lerPedido(pedido.toLowerCase().replaceAll('-', ' '))).toEqual({ fingerprint: FP, nonce })
  })

  it('recusa pedido com tamanho errado', () => {
    expect(lerPedido('ABCD-EF01')).toBeNull()
    expect(lerPedido('')).toBeNull()
  })

  it('o pedido expira depois de 7 dias', () => {
    const agora = 1_000_000_000_000
    expect(pedidoExpirado({ nonce: 'A', criadoEm: agora - VALIDADE_PEDIDO_MS + 1000 }, agora)).toBe(false)
    expect(pedidoExpirado({ nonce: 'A', criadoEm: agora - VALIDADE_PEDIDO_MS - 1000 }, agora)).toBe(true)
  })
})

describe('verificarCodigoRecuperacao', () => {
  const nonce = '0123456789ABCDEF'
  const esperado = { fingerprint: FP, nonce }

  it('aceita o código que a ferramenta do fornecedor gera para o pedido', () => {
    const { publicaPem, privadaPem } = par()
    const codigo = gerarCodigo(privadaPem, formatarPedido(FP, nonce))
    expect(verificarCodigoRecuperacao(codigo, esperado, publicaPem)).toMatchObject({ fingerprint: FP, nonce })
  })

  it('tolera quebras de linha e espaços (mensageiros quebram textos longos)', () => {
    const { publicaPem, privadaPem } = par()
    const codigo = gerarCodigo(privadaPem, formatarPedido(FP, nonce))
    const quebrado = `  ${codigo.slice(0, 40)}\n${codigo.slice(40, 90)} \r\n${codigo.slice(90)}  `
    expect(verificarCodigoRecuperacao(quebrado, esperado, publicaPem)).not.toBeNull()
  })

  it('recusa código de OUTRA máquina', () => {
    const { publicaPem, privadaPem } = par()
    const codigo = gerarCodigo(privadaPem, formatarPedido('11111111111111111111111111111111', nonce))
    expect(verificarCodigoRecuperacao(codigo, esperado, publicaPem)).toBeNull()
  })

  it('recusa código de OUTRO pedido (número de uso único diferente)', () => {
    const { publicaPem, privadaPem } = par()
    const codigo = gerarCodigo(privadaPem, formatarPedido(FP, 'FFFFFFFFFFFFFFFF'))
    expect(verificarCodigoRecuperacao(codigo, esperado, publicaPem)).toBeNull()
  })

  it('recusa código assinado por outra chave (quem não é o fornecedor)', () => {
    const dono = par()
    const impostor = par()
    const codigo = gerarCodigo(impostor.privadaPem, formatarPedido(FP, nonce))
    expect(verificarCodigoRecuperacao(codigo, esperado, dono.publicaPem)).toBeNull()
  })

  it('recusa payload adulterado depois de assinado', () => {
    const { publicaPem, privadaPem } = par()
    const [, assinatura] = gerarCodigo(privadaPem, formatarPedido(FP, nonce)).split('.')
    const forjado = Buffer.from(JSON.stringify({ tipo: 'recuperacao_senha', fingerprint: FP, nonce: 'FFFFFFFFFFFFFFFF' })).toString('base64url')
    expect(verificarCodigoRecuperacao(`${forjado}.${assinatura}`, esperado, publicaPem)).toBeNull()
  })

  it('uma LICENÇA assinada com a mesma chave nunca vale como código de recuperação', () => {
    const { publicaPem, privadaPem } = par()
    const licenca = Buffer.from(
      JSON.stringify({ cliente: 'Ótica', fingerprint: FP, validade: null, emitidoEm: '2026-11-10', tipo: 'recuperacao_senha', nonce })
    )
    const assinatura = sign(null, licenca, createPrivateKey(privadaPem))
    const chave = `${licenca.toString('base64url')}.${assinatura.toString('base64url')}`
    expect(verificarCodigoRecuperacao(chave, esperado, publicaPem)).toBeNull()
  })

  it('um CÓDIGO de recuperação nunca vale como licença', () => {
    const { publicaPem, privadaPem } = par()
    const codigo = gerarCodigo(privadaPem, formatarPedido(FP, nonce))
    expect(verificarChave(codigo, publicaPem)).toBeNull()
  })

  it('recusa lixo sem lançar erro', () => {
    const { publicaPem } = par()
    for (const lixo of ['', 'abc', 'a.b', 'a.b.c', '...', 'e30.e30']) {
      expect(verificarCodigoRecuperacao(lixo, esperado, publicaPem)).toBeNull()
    }
  })

  it('o prefixo de domínio faz parte do que é assinado', () => {
    expect(DOMINIO_ASSINATURA).toContain('RECUPERACAO-SENHA')
  })
})
