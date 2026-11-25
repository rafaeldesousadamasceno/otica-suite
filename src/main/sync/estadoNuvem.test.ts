import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { gravarEstado, lerEstado } from './estadoNuvem'

const pasta = () => mkdtempSync(join(tmpdir(), 'estado-'))

describe('estadoNuvem', () => {
  it('lê null quando não existe ou está corrompido', () => {
    const p = pasta()
    const f = join(p, 'e.json')
    expect(lerEstado(f)).toBeNull()
    writeFileSync(f, '{lixo')
    expect(lerEstado(f)).toBeNull()
    writeFileSync(f, JSON.stringify({ fingerprint: 1 }))
    expect(lerEstado(f)).toBeNull()
  })
  it('grava e lê de volta', () => {
    const f = join(pasta(), 'e.json')
    gravarEstado(f, { fingerprint: 'AB', cursor: 7 })
    expect(lerEstado(f)).toEqual({ fingerprint: 'AB', cursor: 7 })
  })
  it('não deixa .tmp para trás', () => {
    const p = pasta()
    const f = join(p, 'e.json')
    gravarEstado(f, { fingerprint: 'AB', cursor: 1 })
    expect(existsSync(`${f}.tmp`)).toBe(false)
    expect(readdirSync(p)).toEqual(['e.json'])
  })
})
