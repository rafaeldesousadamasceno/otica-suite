import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { normalizarFingerprint, verificarChave } from './chave'

function parDeChaves(): { publicaPem: string; emitir: (payload: unknown) => string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return {
    publicaPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    // Mesmo formato que a Central de Licenças produz: base64url(payload).base64url(assinatura).
    emitir: (payload) => {
      const buf = Buffer.from(JSON.stringify(payload), 'utf8')
      return `${buf.toString('base64url')}.${sign(null, buf, privateKey).toString('base64url')}`
    }
  }
}

const PAYLOAD = {
  cliente: 'Clínica Teste',
  fingerprint: 'ABCDEF0123456789ABCDEF0123456789',
  validade: '2026-12-31',
  emitidoEm: '2026-09-01'
}

describe('verificarChave', () => {
  it('aceita uma chave assinada pela chave privada correspondente', () => {
    const { publicaPem, emitir } = parDeChaves()
    expect(verificarChave(emitir(PAYLOAD), publicaPem)).toEqual({ ...PAYLOAD, plano: null })
  })

  it('lê o plano quando a chave o traz', () => {
    const { publicaPem, emitir } = parDeChaves()
    expect(verificarChave(emitir({ ...PAYLOAD, plano: 'anual' }), publicaPem)?.plano).toBe('anual')
  })

  it('aceita validade nula (sem vencimento)', () => {
    const { publicaPem, emitir } = parDeChaves()
    expect(verificarChave(emitir({ ...PAYLOAD, validade: null }), publicaPem)?.validade).toBeNull()
  })

  it('rejeita chave assinada por OUTRO par de chaves (outro produto)', () => {
    const dono = parDeChaves()
    const impostor = parDeChaves()
    expect(verificarChave(impostor.emitir(PAYLOAD), dono.publicaPem)).toBeNull()
  })

  it('rejeita payload adulterado depois de assinado', () => {
    const { publicaPem, emitir } = parDeChaves()
    const [, assinatura] = emitir(PAYLOAD).split('.')
    const forjado = Buffer.from(JSON.stringify({ ...PAYLOAD, validade: '2099-01-01' })).toString('base64url')
    expect(verificarChave(`${forjado}.${assinatura}`, publicaPem)).toBeNull()
  })

  it('rejeita lixo, vazio e chave truncada sem lançar exceção', () => {
    const { publicaPem, emitir } = parDeChaves()
    const boa = emitir(PAYLOAD)
    for (const ruim of ['', 'abc', 'a.b.c', boa.slice(0, boa.length - 10), '...']) {
      expect(verificarChave(ruim, publicaPem)).toBeNull()
    }
  })

  it('rejeita payload com campos inválidos, mesmo assinado', () => {
    const { publicaPem, emitir } = parDeChaves()
    expect(verificarChave(emitir({ ...PAYLOAD, validade: 'amanhã' }), publicaPem)).toBeNull()
    expect(verificarChave(emitir({ ...PAYLOAD, emitidoEm: undefined }), publicaPem)).toBeNull()
    expect(verificarChave(emitir({ ...PAYLOAD, cliente: 42 }), publicaPem)).toBeNull()
    expect(verificarChave(emitir(null), publicaPem)).toBeNull()
  })

  it('ignora espaços e quebras de linha (mensageiros quebram chaves longas)', () => {
    const { publicaPem, emitir } = parDeChaves()
    const chave = emitir(PAYLOAD)
    const quebrada = `  ${chave.slice(0, 40)}\r\n${chave.slice(40, 90)}\n${chave.slice(90)}  `
    expect(verificarChave(quebrada, publicaPem)?.cliente).toBe('Clínica Teste')
  })

  it('a chave pública embutida (provisória) não aceita chave de outro par', () => {
    const { emitir } = parDeChaves()
    expect(verificarChave(emitir(PAYLOAD))).toBeNull()
  })
})

describe('normalizarFingerprint', () => {
  it('tira espaços e hífens e põe em maiúsculas', () => {
    expect(normalizarFingerprint(' abcd-ef01 2345\n')).toBe('ABCDEF012345')
  })
})
