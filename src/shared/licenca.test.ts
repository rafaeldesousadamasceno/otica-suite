import { describe, expect, it } from 'vitest'
import { descreverBanner, paraBanner } from './licenca'
import type { LicencaInfo } from './types'

const info = (p: Partial<LicencaInfo>): LicencaInfo => ({
  estado: 'ativa', cliente: 'X', plano: 'anual', validade: '2026-12-31', fingerprint: 'f', diasParaVencer: 100, chaveRecusada: null, somenteLeitura: false, ...p
})

describe('paraBanner', () => {
  it('nao vaza fingerprint nem nome da otica', () => {
    expect(Object.keys(paraBanner(info({})))).not.toContain('fingerprint')
    expect(Object.keys(paraBanner(info({})))).not.toContain('cliente')
  })
  it('conta a carencia: venceu ontem = 7 dias, ultimo dia = 1', () => {
    expect(paraBanner(info({ estado: 'carencia', diasParaVencer: -1 })).carenciaRestanteDias).toBe(7)
    expect(paraBanner(info({ estado: 'carencia', diasParaVencer: -7 })).carenciaRestanteDias).toBe(1)
    expect(paraBanner(info({ estado: 'ativa' })).carenciaRestanteDias).toBeNull()
  })
})

describe('descreverBanner', () => {
  it('ativa: neutro, sem acao', () => {
    const t = descreverBanner(paraBanner(info({})), true)
    expect(t).toMatchObject({ tom: 'ok', acao: null })
    expect(t.texto).toContain('31/12/2026')
  })
  it('perpetua', () => {
    expect(descreverBanner(paraBanner(info({ plano: null, validade: null, diasParaVencer: null })), true).texto).toBe('Licença perpétua ativa.')
  })
  it('perto de vencer: vermelho, singular e link so para o admin', () => {
    const b = paraBanner(info({ estado: 'proxima_vencimento', diasParaVencer: 1 }))
    expect(descreverBanner(b, true)).toMatchObject({ tom: 'erro', acao: 'Ativar / renovar' })
    expect(descreverBanner(b, true).texto).toContain('Faltam 1 dia ')
    expect(descreverBanner(b, false).acao).toBeNull()
    expect(descreverBanner(b, false).texto).toContain('administrador')
  })
  it('teste em andamento: informativo; encerrado: vermelho e somente leitura', () => {
    expect(descreverBanner(paraBanner(info({ estado: 'teste', validade: null, diasParaVencer: 14 })), true)).toMatchObject({ tom: 'ok' })
    const enc = descreverBanner(paraBanner(info({ estado: 'teste_encerrado', validade: null, diasParaVencer: 0 })), true)
    expect(enc.tom).toBe('erro')
    expect(enc.texto).toContain('somente leitura')
  })
  it('carencia e vencida', () => {
    expect(descreverBanner(paraBanner(info({ estado: 'carencia', diasParaVencer: -3 })), true).texto).toContain('mais 5 dias')
    expect(descreverBanner(paraBanner(info({ estado: 'vencida', diasParaVencer: -30 })), true).texto).toContain('somente leitura')
  })
})
