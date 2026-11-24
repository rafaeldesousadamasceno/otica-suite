import { generateKeyPairSync, sign } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bytesParaBase64url, verificarProvaDoPc } from '../../../supabase/functions/pc-token/logica'
import { criarClienteNuvem, NuvemErro, type ConfigCliente } from './clienteNuvem'
import type { IdentidadePc } from './identidadePc'

const LOJA = { id: '11111111-1111-4111-8111-111111111111', nome: 'Ótica Teste', cnpj: null }
const LICENCA = 'LICENCA-SECRETA.ASSINATURA'
const ANON = 'sb_publishable_teste'

interface Chamada { url: string; metodo: string; headers: Record<string, string>; corpo: string | undefined }

function identidade(): IdentidadePc {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    dispositivoId: '22222222-2222-4222-8222-222222222222',
    chavePublica: (publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64'),
    nova: false,
    assinar: (d) => bytesParaBase64url(sign(null, d, privateKey))
  }
}

function montar(opts: { tokenResp?: () => Response; restResp?: () => Response; falha?: boolean } = {}) {
  const chamadas: Chamada[] = []
  let agora = Date.parse('2026-11-24T12:00:00Z')
  let n = 0
  const f = (async (url: string, init: RequestInit) => {
    if (opts.falha) throw new Error('sem rede')
    chamadas.push({ url, metodo: init.method ?? 'GET', headers: init.headers as Record<string, string>, corpo: init.body as string | undefined })
    if (url.endsWith('/functions/v1/pc-token')) {
      if (opts.tokenResp) return opts.tokenResp()
      n++
      return new Response(JSON.stringify({ token: `tok${n}`, expira_em: Math.floor(agora / 1000) + 3600 }), { status: 200 })
    }
    return opts.restResp ? opts.restResp() : new Response(null, { status: 204 })
  }) as unknown as typeof fetch
  const config: ConfigCliente = {
    url: 'https://x.supabase.co', chaveAnon: ANON, loja: LOJA, identidade: identidade(),
    obterLicenca: () => LICENCA, fetch: f, agora: () => agora
  }
  return { cliente: criarClienteNuvem(config), chamadas, avancar: (ms: number) => { agora += ms }, agora: () => agora }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('clienteNuvem', () => {
  it('pede o token com a prova que a pc-token verifica', async () => {
    const m = montar()
    await m.cliente.upsert('cliente', [{ uuid: 'a' }], '2026-11-24T12:00:00Z')
    const corpo = JSON.parse(m.chamadas[0].corpo!)
    expect(corpo.licenca).toBe(LICENCA)
    expect(corpo.loja).toEqual(LOJA)
    expect(await verificarProvaDoPc(corpo.chave_publica, LOJA.id, corpo.dispositivo_id, corpo.timestamp, corpo.assinatura, m.agora())).toBeNull()
  })

  it('reaproveita o token até 5 minutos antes de vencer', async () => {
    const m = montar()
    await m.cliente.upsert('t', [{ uuid: 'a' }], 'x')
    await m.cliente.upsert('t', [{ uuid: 'b' }], 'x')
    expect(m.chamadas.filter((c) => c.url.endsWith('pc-token'))).toHaveLength(1)
    m.avancar(56 * 60_000)
    await m.cliente.upsert('t', [{ uuid: 'c' }], 'x')
    expect(m.chamadas.filter((c) => c.url.endsWith('pc-token'))).toHaveLength(2)
  })

  it('upsert envia loja_id e recebido_em em cada linha e usa on_conflict', async () => {
    const m = montar()
    await m.cliente.upsert('cliente', [{ uuid: 'a' }, { uuid: 'b' }], '2026-11-24T12:00:00Z')
    const c = m.chamadas[1]
    expect(c.metodo).toBe('POST')
    expect(c.url).toBe('https://x.supabase.co/rest/v1/cliente?on_conflict=loja_id,uuid')
    expect(c.headers.Prefer).toBe('resolution=merge-duplicates,return=minimal')
    expect(c.headers['Content-Profile']).toBe('optialeph')
    expect(c.headers['Accept-Profile']).toBe('optialeph')
    expect(c.headers.apikey).toBe(ANON)
    expect(c.headers.Authorization).toBe('Bearer tok1')
    expect(JSON.parse(c.corpo!)).toEqual([
      { uuid: 'a', loja_id: LOJA.id, recebido_em: '2026-11-24T12:00:00Z' },
      { uuid: 'b', loja_id: LOJA.id, recebido_em: '2026-11-24T12:00:00Z' }
    ])
  })

  it('apagar quebra em blocos de 100 uuids', async () => {
    const m = montar()
    await m.cliente.apagar('cliente', Array.from({ length: 250 }, (_, i) => `u${i}`))
    const dels = m.chamadas.filter((c) => c.metodo === 'DELETE')
    expect(dels).toHaveLength(3)
    expect(dels[0].url).toContain(`loja_id=eq.${LOJA.id}&uuid=in.(u0,u1,`)
    expect(dels[2].url.endsWith('u249)')).toBe(true)
  })

  it('varrer apaga só o que veio antes do início', async () => {
    const m = montar()
    await m.cliente.varrer(['cliente', 'venda'], '2026-11-24T11:00:00.000Z')
    const dels = m.chamadas.filter((c) => c.metodo === 'DELETE')
    expect(dels).toHaveLength(2)
    expect(dels[0].url).toBe(`https://x.supabase.co/rest/v1/cliente?loja_id=eq.${LOJA.id}&recebido_em=lt.${encodeURIComponent('2026-11-24T11:00:00.000Z')}`)
    expect(dels[1].url).toContain('/rest/v1/venda?')
  })

  it('gravarPainel faz upsert em painel_snapshot', async () => {
    const m = montar()
    await m.cliente.gravarPainel('2026-11', { a: 1 })
    const c = m.chamadas[1]
    expect(c.url).toBe('https://x.supabase.co/rest/v1/painel_snapshot?on_conflict=loja_id,periodo')
    const b = JSON.parse(c.corpo!)
    expect(b.loja_id).toBe(LOJA.id)
    expect(b.periodo).toBe('2026-11')
    expect(b.indicadores).toEqual({ a: 1 })
    expect(typeof b.gerado_em).toBe('string')
  })

  it('401 renova o token e repete uma vez; segundo 401 vira NuvemErro', async () => {
    let r = 0
    const m = montar({ restResp: () => (++r === 1 ? new Response('x', { status: 401 }) : new Response(null, { status: 204 })) })
    await m.cliente.upsert('t', [{ uuid: 'a' }], 'x')
    expect(m.chamadas.filter((c) => c.url.endsWith('pc-token'))).toHaveLength(2)
    expect(m.chamadas.at(-1)!.headers.Authorization).toBe('Bearer tok2')

    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m2 = montar({ restResp: () => new Response('x', { status: 401 }) })
    const e = await m2.cliente.upsert('t', [{ uuid: 'a' }], 'x').catch((x) => x)
    expect(e).toBeInstanceOf(NuvemErro)
    expect(e.status).toBe(401)
    expect(e.codigo).toBe('NUVEM_HTTP')
    expect(m2.chamadas.filter((c) => !c.url.endsWith('pc-token'))).toHaveLength(2)
  })

  it.each([400, 403, 404, 409, 422])('HTTP %i do PostgREST: NuvemErro NUVEM_RECUSOU e log com tabela, status e código', async (status) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const corpo = JSON.stringify({ code: '42501', message: 'new row violates row-level security policy for table "cliente"', details: null, hint: null })
    const m = montar({ restResp: () => new Response(corpo, { status }) })
    const e = await m.cliente.upsert('cliente', [{ uuid: 'a' }], 'x').catch((x) => x)
    expect(e).toBeInstanceOf(NuvemErro)
    expect(e.codigo).toBe('NUVEM_RECUSOU')
    expect(e.status).toBe(status)
    expect(e.message).not.toContain('row-level')
    const texto = JSON.stringify(log.mock.calls)
    expect(texto).toContain('cliente')
    expect(texto).toContain(String(status))
    expect(texto).toContain('42501')
    for (const segredo of ['tok1', ANON, LICENCA]) expect(texto).not.toContain(segredo)
  })

  it.each([500, 502, 503, 408, 429])('HTTP %i do PostgREST: NuvemErro NUVEM_HTTP (tenta de novo mais tarde)', async (status) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = montar({ restResp: () => new Response('<html>erro</html>', { status }) })
    const e = await m.cliente.apagar('venda', ['a']).catch((x) => x)
    expect(e).toBeInstanceOf(NuvemErro)
    expect(e.codigo).toBe('NUVEM_HTTP')
    expect(e.status).toBe(status)
  })

  it('corpo de erro enorme: o log fica curto', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const m = montar({ restResp: () => new Response('x'.repeat(100_000), { status: 400 }) })
    await m.cliente.upsert('cliente', [{ uuid: 'a' }], 'x').catch(() => {})
    expect(JSON.stringify(log.mock.calls).length).toBeLessThan(1_000)
  })

  it('pc-token com corpo ilegível: 4xx vira NUVEM_RECUSOU, 5xx vira NUVEM_HTTP', async () => {
    const m404 = montar({ tokenResp: () => new Response('not found', { status: 404 }) })
    expect((await m404.cliente.upsert('t', [{ uuid: 'a' }], 'x').catch((x) => x)).codigo).toBe('NUVEM_RECUSOU')
    const m503 = montar({ tokenResp: () => new Response('indisponível', { status: 503 }) })
    expect((await m503.cliente.upsert('t', [{ uuid: 'a' }], 'x').catch((x) => x)).codigo).toBe('NUVEM_HTTP')
  })

  it('erro da pc-token vira NuvemErro com o código do corpo', async () => {
    const m = montar({ tokenResp: () => new Response(JSON.stringify({ erro: { codigo: 'PC_NOVO_PRECISA_APROVACAO', mensagem: 'm' } }), { status: 409 }) })
    const e = await m.cliente.upsert('t', [{ uuid: 'a' }], 'x').catch((x) => x)
    expect(e).toBeInstanceOf(NuvemErro)
    expect(e.codigo).toBe('PC_NOVO_PRECISA_APROVACAO')
    expect(e.status).toBe(409)
  })

  it('falha de rede vira NuvemErro REDE', async () => {
    const m = montar({ falha: true })
    const e = await m.cliente.upsert('t', [{ uuid: 'a' }], 'x').catch((x) => x)
    expect(e).toBeInstanceOf(NuvemErro)
    expect(e.codigo).toBe('REDE')
    expect(e.status).toBe(0)
  })

  it('nenhuma requisição leva a chave de licença fora da chamada da pc-token', async () => {
    const m = montar()
    await m.cliente.upsert('t', [{ uuid: 'a' }], 'x')
    await m.cliente.apagar('t', ['a'])
    for (const c of m.chamadas) {
      if (c.url.endsWith('pc-token')) expect(c.corpo).toContain(LICENCA)
      else expect(JSON.stringify(c)).not.toContain(LICENCA)
    }
  })
})
