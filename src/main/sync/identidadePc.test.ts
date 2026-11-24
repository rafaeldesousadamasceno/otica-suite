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
  let id = 'id-do-banco'
  const grav = vi.fn((novo: string) => { id = novo })
  const deps = () => ({
    pasta,
    cofre: over.cofre ?? cofreFalso,
    fingerprint: over.fingerprint ?? 'FP1',
    lerDispositivoId: () => id,
    gravarDispositivoId: grav
  })
  return { pasta, grav, deps, getId: () => id }
}

describe('identidadePc', () => {
  it('primeira vez: gera chave, mantém o id do banco', () => {
    const m = montar()
    const i = carregarIdentidadePc(m.deps())
    expect(i.dispositivoId).toBe('id-do-banco')
    expect(i.nova).toBe(false)
    expect(m.grav).not.toHaveBeenCalled()
    expect(lerEstado(join(m.pasta, 'nuvem-estado.json'))).toEqual({ fingerprint: 'FP1', cursor: 0 })
  })
  it('segunda carga reutiliza a mesma chave pública', () => {
    const m = montar()
    const a = carregarIdentidadePc(m.deps())
    const b = carregarIdentidadePc(m.deps())
    expect(b.chavePublica).toBe(a.chavePublica)
    expect(b.nova).toBe(false)
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
    expect(b.dispositivoId).not.toBe('id-do-banco')
    expect(m.grav).toHaveBeenCalledWith(b.dispositivoId)
    expect(b.chavePublica).not.toBe(a.chavePublica)
    expect(lerEstado(join(m.pasta, 'nuvem-estado.json'))).toEqual({ fingerprint: 'FP2', cursor: 0 })
  })
  it('chave apagada com estado presente gera id novo', () => {
    const m = montar()
    carregarIdentidadePc(m.deps())
    rmSync(join(m.pasta, 'nuvem-chave.bin'))
    const b = carregarIdentidadePc(m.deps())
    expect(b.nova).toBe(true)
    expect(m.grav).toHaveBeenCalledTimes(1)
    expect(lerEstado(join(m.pasta, 'nuvem-estado.json'))?.cursor).toBe(0)
  })
  it('estado perdido reaproveita a chave e não troca o id', () => {
    const m = montar()
    const a = carregarIdentidadePc(m.deps())
    rmSync(join(m.pasta, 'nuvem-estado.json'))
    const b = carregarIdentidadePc(m.deps())
    expect(b.nova).toBe(false)
    expect(b.chavePublica).toBe(a.chavePublica)
    expect(m.grav).not.toHaveBeenCalled()
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
