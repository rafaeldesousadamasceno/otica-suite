import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verificarChave } from '@main/license/chave'
import {
  bytesParaBase64url,
  licencaLiberaNuvem,
  montarJwtDoPc,
  textoDaProva,
  verificarLicenca,
  verificarProvaDoPc
} from '../../../supabase/functions/pc-token/logica'

const central = generateKeyPairSync('ed25519')
const centralPem = central.publicKey.export({ type: 'spki', format: 'pem' }) as string
const pc = generateKeyPairSync('ed25519')
const pcPublica = (pc.publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64')

const LOJA = '11111111-1111-4111-8111-111111111111'
const DISP = '22222222-2222-4222-8222-222222222222'

function emitir(payload: object, chave = central.privateKey): string {
  const corpo = Buffer.from(JSON.stringify(payload))
  return `${corpo.toString('base64url')}.${sign(null, corpo, chave).toString('base64url')}`
}
const base = { cliente: 'Ótica Teste', fingerprint: 'AB12', validade: '2027-01-31', emitidoEm: '2026-11-01', plano: 'mensal' }

function prova(ts: string, loja = LOJA, disp = DISP): string {
  return sign(null, Buffer.from(textoDaProva(loja, disp, ts)), pc.privateKey).toString('base64url')
}

describe('pc-token: licença', () => {
  it('aceita a mesma licença que o app aceita (formato idêntico)', async () => {
    const chave = emitir(base)
    expect((await verificarLicenca(chave, centralPem))?.cliente).toBe('Ótica Teste')
    expect(verificarChave(chave, centralPem)?.cliente).toBe('Ótica Teste')
  })

  it('recusa licença adulterada, de outra chave e mal formada', async () => {
    const outra = generateKeyPairSync('ed25519')
    expect(await verificarLicenca(emitir(base, outra.privateKey), centralPem)).toBeNull()
    const [p, s] = emitir(base).split('.')
    const adulterada = `${Buffer.from(JSON.stringify({ ...base, validade: null })).toString('base64url')}.${s}`
    expect(await verificarLicenca(adulterada, centralPem)).toBeNull()
    expect(await verificarLicenca('lixo', centralPem)).toBeNull()
    expect(await verificarLicenca(`${p}.`, centralPem)).toBeNull()
  })

  it('vencida não libera a nuvem; sem vencimento libera', async () => {
    const l = (await verificarLicenca(emitir(base), centralPem))!
    expect(licencaLiberaNuvem(l, '2027-01-31', false)).toBeNull()
    expect(licencaLiberaNuvem(l, '2027-02-01', false)).toBe('LICENCA_VENCIDA')
    expect(licencaLiberaNuvem({ ...l, validade: null }, '2099-01-01', false)).toBeNull()
  })

  it('plano Premium: exige o recurso nuvem só quando ligado', async () => {
    const sem = (await verificarLicenca(emitir(base), centralPem))!
    const com = (await verificarLicenca(emitir({ ...base, recursos: ['nuvem'] }), centralPem))!
    expect(licencaLiberaNuvem(sem, '2026-11-24', true)).toBe('SEM_RECURSO_NUVEM')
    expect(licencaLiberaNuvem(com, '2026-11-24', true)).toBeNull()
    expect(licencaLiberaNuvem(sem, '2026-11-24', false)).toBeNull()
  })
})

describe('pc-token: prova de posse da chave do PC', () => {
  const agora = Date.parse('2026-11-24T12:00:00Z')
  const ts = '2026-11-24T12:00:00.000Z'

  it('aceita prova válida e recente', async () => {
    expect(await verificarProvaDoPc(pcPublica, LOJA, DISP, ts, prova(ts), agora)).toBeNull()
  })

  it('recusa prova de outro dispositivo, de outra loja ou de outra chave', async () => {
    const outroDisp = '33333333-3333-4333-8333-333333333333'
    expect(await verificarProvaDoPc(pcPublica, LOJA, outroDisp, ts, prova(ts), agora)).toBe('PROVA_INVALIDA')
    expect(await verificarProvaDoPc(pcPublica, outroDisp, DISP, ts, prova(ts), agora)).toBe('PROVA_INVALIDA')
    const intruso = generateKeyPairSync('ed25519')
    const falsa = sign(null, Buffer.from(textoDaProva(LOJA, DISP, ts)), intruso.privateKey).toString('base64url')
    expect(await verificarProvaDoPc(pcPublica, LOJA, DISP, ts, falsa, agora)).toBe('PROVA_INVALIDA')
  })

  it('recusa prova velha (reaproveitada) ou do futuro', async () => {
    expect(await verificarProvaDoPc(pcPublica, LOJA, DISP, ts, prova(ts), agora + 6 * 60_000)).toBe('PROVA_EXPIRADA')
    expect(await verificarProvaDoPc(pcPublica, LOJA, DISP, ts, prova(ts), agora - 6 * 60_000)).toBe('PROVA_EXPIRADA')
    expect(await verificarProvaDoPc(pcPublica, LOJA, DISP, 'lixo', prova('lixo'), agora)).toBe('PROVA_EXPIRADA')
  })

  it('chave pública malformada vira recusa, não exceção', async () => {
    expect(await verificarProvaDoPc('nao-e-chave', LOJA, DISP, ts, prova(ts), agora)).toBe('PROVA_INVALIDA')
  })
})

describe('pc-token: JWT', () => {
  it('traz loja_id e dispositivo_id no topo, role authenticated e dura 1 hora', async () => {
    const { token, expiraEm } = await montarJwtDoPc({ loja_id: LOJA, dispositivo_id: DISP, agora: 1_000_000 }, 'segredo')
    const [h, c, s] = token.split('.')
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'HS256', typ: 'JWT' })
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString())
    expect(claims).toMatchObject({ role: 'authenticated', aud: 'authenticated', loja_id: LOJA, dispositivo_id: DISP })
    expect(claims.exp).toBe(1_000_000 + 3600)
    expect(expiraEm).toBe(1_003_600)
    // A assinatura confere com o mesmo segredo e não com outro.
    const { createHmac } = await import('node:crypto')
    expect(s).toBe(createHmac('sha256', 'segredo').update(`${h}.${c}`).digest('base64url'))
    expect(s).not.toBe(createHmac('sha256', 'outro').update(`${h}.${c}`).digest('base64url'))
  })

  it('sub é o UUID nulo, nunca o dispositivo_id (que o PC escolhe e poderia ser o id de uma conta)', async () => {
    const { token } = await montarJwtDoPc({ loja_id: LOJA, dispositivo_id: DISP, agora: 1_000_000 }, 'segredo')
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    expect(claims.sub).toBe('00000000-0000-0000-0000-000000000000')
    expect(claims.dispositivo_id).toBe(DISP)
  })

  it('base64url ida e volta', () => {
    expect(bytesParaBase64url(new Uint8Array([251, 255, 254]))).toBe('-__-')
  })
})
