import { describe, expect, it } from 'vitest'
import { mesclarEstadoLocal, reancorarMarca, resolverHoje } from './relogio'

describe('mesclarEstadoLocal', () => {
  it('o teste começou na data MAIS ANTIGA e a marca é a MAIS RECENTE', () => {
    const r = mesclarEstadoLocal([
      { inicioTeste: '2026-10-05', maiorDataVista: '2026-10-08' },
      { inicioTeste: '2026-10-01', maiorDataVista: '2026-10-20' }
    ])
    expect(r).toEqual({ inicioTeste: '2026-10-01', maiorDataVista: '2026-10-20' })
  })

  it('apagar UMA das fontes não reinicia o teste', () => {
    const r = mesclarEstadoLocal([null, { inicioTeste: '2026-10-01', maiorDataVista: '2026-10-09' }])
    expect(r.inicioTeste).toBe('2026-10-01')
  })

  it('ignora lixo (datas inválidas, tipos errados, fontes ausentes)', () => {
    const r = mesclarEstadoLocal([
      { inicioTeste: 'ontem' as never, maiorDataVista: 42 as never },
      undefined,
      { inicioTeste: '2026-10-03', maiorDataVista: null }
    ])
    expect(r).toEqual({ inicioTeste: '2026-10-03', maiorDataVista: null })
  })

  it('sem nenhuma fonte, tudo nulo', () => {
    expect(mesclarEstadoLocal([null, null])).toEqual({ inicioTeste: null, maiorDataVista: null })
  })
})

describe('resolverHoje', () => {
  it('primeira abertura: o teste começa hoje', () => {
    const r = resolverHoje('2026-10-15', { inicioTeste: null, maiorDataVista: null })
    expect(r).toEqual({ hoje: '2026-10-15', inicioTeste: '2026-10-15', maiorDataVista: '2026-10-15' })
  })

  it('relógio voltado: "hoje" nunca é anterior à maior data já vista', () => {
    const r = resolverHoje('2026-10-02', { inicioTeste: '2026-10-01', maiorDataVista: '2026-10-20' })
    expect(r.hoje).toBe('2026-10-20')
  })

  it('início do teste no futuro (adulterado) é puxado para hoje, não estende o teste', () => {
    const r = resolverHoje('2026-10-15', { inicioTeste: '2030-01-01', maiorDataVista: '2026-10-14' })
    expect(r.inicioTeste).toBe('2026-10-15')
  })

  it('uso normal: a marca acompanha o relógio', () => {
    const r = resolverHoje('2026-10-16', { inicioTeste: '2026-10-01', maiorDataVista: '2026-10-15' })
    expect(r).toEqual({ hoje: '2026-10-16', inicioTeste: '2026-10-01', maiorDataVista: '2026-10-16' })
  })
})

describe('reancorarMarca (renovação destrava relógio adiantado por engano)', () => {
  it('usa o maior entre a data de emissão e o relógio real', () => {
    expect(reancorarMarca('2026-10-01', '2026-10-15')).toBe('2026-10-15')
    // relógio do PC atrasado em relação à emissão: a emissão é a âncora confiável
    expect(reancorarMarca('2026-10-20', '2026-10-15')).toBe('2026-10-20')
  })
})
