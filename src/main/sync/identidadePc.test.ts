import { createPublicKey, verify } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { textoDaProva } from '../../../supabase/functions/pc-token/logica'
import { type Cofre, carregarIdentidadePc } from './identidadePc'
import { gravarEstado, lerEstado } from './estadoNuvem'

const cofreFalso: Cofre = {
  disponivel: () => true,
  cifrar: (t) => Buffer.from(Buffer.from(t).toString('base64')).reverse(),
  decifrar: (d) => Buffer.from(Buffer.from(d).reverse().toString(), 'base64').toString()
}

function montar(over: Partial<{ cofre: Cofre; fingerprint: string; pasta: string }> = {}) {
  const pasta = over.pasta ?? mkdtempSync(join(tmpdir(), 'idpc-'))
  let id: string | null = 'id-do-banco'
  const grav = vi.fn((novo: string) => { id = novo })
  const deps = () => ({
    pasta,
    cofre: over.cofre ?? cofreFalso,
    fingerprint: over.fingerprint ?? 'FP1',
    lerDispositivoId: () => id,
    gravarDispositivoId: grav
  })
  /** Simula trocar o banco (backup restaurado) sem passar pelo gravarDispositivoId. */
  const setIdDoBanco = (novo: string | null) => { id = novo }
  return { pasta, grav, deps, getId: () => id, setIdDoBanco }
}

const arqId = (pasta: string) => join(pasta, 'nuvem-dispositivo.json')
const ID_ANTIGO = '33333333-3333-4333-8333-333333333333'

describe('identidadePc', () => {
  it('primeira vez (sem chave): gera chave e id novos, grava o id no banco e ao lado da chave', () => {
    const m = montar()
    const i = carregarIdentidadePc(m.deps())
    expect(i.dispositivoId).not.toBe('id-do-banco')
    expect(i.dispositivoId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(i.nova).toBe(true)
    expect(m.grav).toHaveBeenCalledWith(i.dispositivoId)
    expect(m.getId()).toBe(i.dispositivoId)
    expect(JSON.parse(readFileSync(arqId(m.pasta), 'utf8'))).toEqual({ dispositivoId: i.dispositivoId })
    expect(lerEstado(join(m.pasta, 'nuvem-estado.json'))).toEqual({ fingerprint: 'FP1', cursor: 0 })
  })
  it('computador novo montado com backup de outro PC (sem chave e sem estado): não reaproveita o id do banco', () => {
    const m = montar()
    m.setIdDoBanco('id-do-pc-antigo')
    const i = carregarIdentidadePc(m.deps())
    expect(i.nova).toBe(true)
    expect(i.dispositivoId).not.toBe('id-do-pc-antigo')
    expect(m.getId()).toBe(i.dispositivoId)
  })
  it('segunda carga reutiliza a mesma chave pública e o mesmo id', () => {
    const m = montar()
    const a = carregarIdentidadePc(m.deps())
    const b = carregarIdentidadePc(m.deps())
    expect(b.chavePublica).toBe(a.chavePublica)
    expect(b.dispositivoId).toBe(a.dispositivoId)
    expect(b.nova).toBe(false)
    expect(m.grav).toHaveBeenCalledTimes(1)
  })
  it('chave existe mas o banco foi trocado por um backup com outro id: vale o id da chave e o banco é corrigido', () => {
    const m = montar()
    const a = carregarIdentidadePc(m.deps())
    m.setIdDoBanco('id-de-um-backup')
    const b = carregarIdentidadePc(m.deps())
    expect(b.nova).toBe(false)
    expect(b.chavePublica).toBe(a.chavePublica)
    expect(b.dispositivoId).toBe(a.dispositivoId)
    expect(m.grav).toHaveBeenLastCalledWith(a.dispositivoId)
    expect(m.getId()).toBe(a.dispositivoId)
  })
  it('chave de antes do arquivo de id (instalação anterior): adota o id do banco e passa a guardá-lo ao lado da chave', () => {
    const m = montar()
    const a = carregarIdentidadePc(m.deps())
    rmSync(arqId(m.pasta))
    m.setIdDoBanco(ID_ANTIGO)
    m.grav.mockClear()
    const b = carregarIdentidadePc(m.deps())
    expect(b.nova).toBe(false)
    expect(b.chavePublica).toBe(a.chavePublica)
    expect(b.dispositivoId).toBe(ID_ANTIGO)
    expect(m.grav).not.toHaveBeenCalled()
    expect(JSON.parse(readFileSync(arqId(m.pasta), 'utf8'))).toEqual({ dispositivoId: ID_ANTIGO })
  })
  it.each([null, 'nao-e-uuid'])('chave sem arquivo de id e id do banco %s: gera identidade nova', (doBanco) => {
    const m = montar()
    const a = carregarIdentidadePc(m.deps())
    rmSync(arqId(m.pasta))
    m.setIdDoBanco(doBanco)
    const b = carregarIdentidadePc(m.deps())
    expect(b.nova).toBe(true)
    expect(b.chavePublica).not.toBe(a.chavePublica)
    expect(m.getId()).toBe(b.dispositivoId)
    expect(JSON.parse(readFileSync(arqId(m.pasta), 'utf8'))).toEqual({ dispositivoId: b.dispositivoId })
  })
  it('assinatura confere com a chave pública', () => {
    const i = carregarIdentidadePc(montar().deps())
    const dados = textoDaProva('loja', i.dispositivoId, '2026-11-24T00:00:00Z')
    const sig = i.assinar(dados)
    const pub = createPublicKey({ key: Buffer.from(i.chavePublica, 'base64'), format: 'der', type: 'spki' })
    expect(verify(null, dados, pub, Buffer.from(sig, 'base64url'))).toBe(true)
  })
  it('fingerprint diferente gera id novo e zera o cursor', () => {
    const m = montar()
    const a = carregarIdentidadePc(m.deps())
    gravarEstado(join(m.pasta, 'nuvem-estado.json'), { fingerprint: 'FP1', cursor: 9 })
    const b = carregarIdentidadePc({ ...m.deps(), fingerprint: 'FP2' })
    expect(b.nova).toBe(true)
    expect(b.dispositivoId).not.toBe(a.dispositivoId)
    expect(m.grav).toHaveBeenLastCalledWith(b.dispositivoId)
    expect(b.chavePublica).not.toBe(a.chavePublica)
    expect(JSON.parse(readFileSync(arqId(m.pasta), 'utf8'))).toEqual({ dispositivoId: b.dispositivoId })
    expect(lerEstado(join(m.pasta, 'nuvem-estado.json'))).toEqual({ fingerprint: 'FP2', cursor: 0 })
  })
  it('chave apagada com estado presente gera id novo', () => {
    const m = montar()
    const a = carregarIdentidadePc(m.deps())
    gravarEstado(join(m.pasta, 'nuvem-estado.json'), { fingerprint: 'FP1', cursor: 9 })
    rmSync(join(m.pasta, 'nuvem-chave.bin'))
    const b = carregarIdentidadePc(m.deps())
    expect(b.nova).toBe(true)
    expect(b.dispositivoId).not.toBe(a.dispositivoId)
    expect(m.grav).toHaveBeenCalledTimes(2)
    expect(m.grav).toHaveBeenLastCalledWith(b.dispositivoId)
    expect(lerEstado(join(m.pasta, 'nuvem-estado.json'))?.cursor).toBe(0)
  })
  it('estado perdido reaproveita a chave e não troca o id', () => {
    const m = montar()
    const a = carregarIdentidadePc(m.deps())
    rmSync(join(m.pasta, 'nuvem-estado.json'))
    const b = carregarIdentidadePc(m.deps())
    expect(b.nova).toBe(false)
    expect(b.chavePublica).toBe(a.chavePublica)
    expect(b.dispositivoId).toBe(a.dispositivoId)
    expect(m.grav).toHaveBeenCalledTimes(1)
    expect(existsSync(join(m.pasta, 'nuvem-estado.json'))).toBe(true)
  })
  it('a chave privada nunca fica em texto puro no disco', () => {
    const m = montar()
    let privada = ''
    const cofre: Cofre = { ...cofreFalso, cifrar: (t) => { privada = t; return cofreFalso.cifrar(t) } }
    carregarIdentidadePc({ ...m.deps(), cofre })
    const disco = readFileSync(join(m.pasta, 'nuvem-chave.bin'))
    expect(privada.length).toBeGreaterThan(20)
    expect(disco.toString('latin1')).not.toContain(privada)
    expect(disco.toString('latin1')).not.toContain(privada.slice(0, 20))
  })
  it('cofre indisponível lança', () => {
    const m = montar({ cofre: { ...cofreFalso, disponivel: () => false } })
    expect(() => carregarIdentidadePc(m.deps())).toThrow('Criptografia do sistema indisponível neste computador.')
  })
})
