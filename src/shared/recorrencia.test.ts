import { describe, expect, it } from 'vitest'
import {
  HORIZONTE_MESES,
  aplicarReajuste,
  competenciaDeData,
  dataFimAoExcluirEstaEAsProximas,
  diferencaEmMeses,
  fimDoHorizonte,
  limiteDaListaPadrao,
  normalizarCompetencia,
  planejarOcorrencias,
  somarMeses,
  ultimoDiaDaCompetencia,
  valorVigenteNaCompetencia,
  vencimentoNaCompetencia
} from './recorrencia'

describe('competências', () => {
  it('normaliza AAAA-MM e AAAA-MM-DD, e recusa o resto', () => {
    expect(normalizarCompetencia('2026-07')).toBe('2026-07')
    expect(normalizarCompetencia('2026-07-15')).toBe('2026-07')
    expect(normalizarCompetencia(' 2026-07 ')).toBe('2026-07')
    expect(normalizarCompetencia('2026-13')).toBeNull()
    expect(normalizarCompetencia('07/2026')).toBeNull()
    expect(normalizarCompetencia(null)).toBeNull()
    expect(() => competenciaDeData('lixo')).toThrow()
  })

  it('soma meses virando o ano, para frente e para trás', () => {
    expect(somarMeses('2026-11', 1)).toBe('2026-12')
    expect(somarMeses('2026-11', 2)).toBe('2027-01')
    expect(somarMeses('2026-01', -1)).toBe('2025-12')
    expect(somarMeses('2026-01', 12)).toBe('2027-01')
    expect(somarMeses('2026-03', -15)).toBe('2024-12')
    expect(diferencaEmMeses('2026-01', '2027-03')).toBe(14)
  })

  it('o horizonte é de 12 meses contando o atual', () => {
    expect(HORIZONTE_MESES).toBe(12)
    expect(fimDoHorizonte('2026-01-20')).toBe('2026-12')
    expect(fimDoHorizonte('2026-11-23')).toBe('2027-10')
  })
})

describe('vencimento no fim do mês', () => {
  it('dia 31 vira o último dia do mês quando o mês é mais curto', () => {
    expect(vencimentoNaCompetencia('2026-01', 31)).toBe('2026-01-31')
    expect(vencimentoNaCompetencia('2026-02', 31)).toBe('2026-02-28')
    expect(vencimentoNaCompetencia('2026-04', 31)).toBe('2026-04-30')
    expect(vencimentoNaCompetencia('2026-02', 30)).toBe('2026-02-28')
  })

  it('ano bissexto: fevereiro tem 29', () => {
    expect(vencimentoNaCompetencia('2028-02', 31)).toBe('2028-02-29')
    expect(ultimoDiaDaCompetencia('2028-02')).toBe('2028-02-29')
    expect(ultimoDiaDaCompetencia('2100-02')).toBe('2100-02-28')
  })

  it('os dias normais não mudam', () => {
    expect(vencimentoNaCompetencia('2026-02', 5)).toBe('2026-02-05')
    expect(vencimentoNaCompetencia('2026-12', 28)).toBe('2026-12-28')
  })
})

describe('valor vigente na competência', () => {
  const vig = [
    { vigenteDesde: '2026-01', valorCentavos: 150000 },
    { vigenteDesde: '2026-07', valorCentavos: 165000 }
  ]

  it('cada competência usa a vigência mais recente que já começou', () => {
    expect(valorVigenteNaCompetencia(vig, '2026-01')).toBe(150000)
    expect(valorVigenteNaCompetencia(vig, '2026-06')).toBe(150000)
    expect(valorVigenteNaCompetencia(vig, '2026-07')).toBe(165000)
    expect(valorVigenteNaCompetencia(vig, '2027-03')).toBe(165000)
  })

  it('antes da primeira vigência vale a primeira; sem vigência, nada', () => {
    expect(valorVigenteNaCompetencia(vig, '2025-05')).toBe(150000)
    expect(valorVigenteNaCompetencia([], '2026-01')).toBeNull()
  })

  it('não depende da ordem em que as vigências chegam', () => {
    expect(valorVigenteNaCompetencia([...vig].reverse(), '2026-08')).toBe(165000)
  })
})

describe('reajuste a partir de uma competência', () => {
  const vig = [
    { vigenteDesde: '2026-01', valorCentavos: 150000 },
    { vigenteDesde: '2026-07', valorCentavos: 165000 }
  ]

  it('cria a vigência nova e deixa o passado como estava', () => {
    const novas = aplicarReajuste([vig[0]], '2026-07', 165000)
    expect(novas).toEqual(vig)
  })

  it('substitui as vigências marcadas para depois', () => {
    const novas = aplicarReajuste(vig, '2026-04', 160000)
    expect(novas).toEqual([
      { vigenteDesde: '2026-01', valorCentavos: 150000 },
      { vigenteDesde: '2026-04', valorCentavos: 160000 }
    ])
  })

  it('reajustar na mesma competência troca o valor, sem duplicar', () => {
    const novas = aplicarReajuste(vig, '2026-07', 170000)
    expect(novas).toEqual([
      { vigenteDesde: '2026-01', valorCentavos: 150000 },
      { vigenteDesde: '2026-07', valorCentavos: 170000 }
    ])
  })
})

describe('plano de ocorrências (o que o job cria)', () => {
  const aluguel = { frequencia: 'MENSAL' as const, diaVencimento: 5, dataInicio: '2026-01-05', dataFim: null }
  const vigencias = [{ vigenteDesde: '2026-01', valorCentavos: 150000 }]

  it('aluguel desde janeiro, visto em janeiro: 12 ocorrências, janeiro a dezembro', () => {
    const plano = planejarOcorrencias({ serie: aluguel, vigencias, existentes: [], hoje: '2026-01-10' })
    expect(plano).toHaveLength(12)
    expect(plano[0]).toEqual({ competencia: '2026-01', vencimento: '2026-01-05', valorCentavos: 150000 })
    expect(plano[11].competencia).toBe('2026-12')
  })

  it('completa só o que falta: o que já existe (inclusive excluído) não volta', () => {
    const plano = planejarOcorrencias({ serie: aluguel, vigencias, existentes: ['2026-01', '2026-02', '2026-08'], hoje: '2026-01-10' })
    expect(plano.map((p) => p.competencia)).not.toContain('2026-08')
    expect(plano).toHaveLength(9)
  })

  it('rodar de novo com tudo já criado não planeja nada (idempotência)', () => {
    const primeira = planejarOcorrencias({ serie: aluguel, vigencias, existentes: [], hoje: '2026-01-10' })
    const segunda = planejarOcorrencias({ serie: aluguel, vigencias, existentes: primeira.map((p) => p.competencia), hoje: '2026-01-10' })
    expect(segunda).toEqual([])
  })

  it('o valor de cada ocorrência é o vigente na competência dela', () => {
    const vig = [
      { vigenteDesde: '2026-01', valorCentavos: 150000 },
      { vigenteDesde: '2026-07', valorCentavos: 165000 }
    ]
    const plano = planejarOcorrencias({ serie: aluguel, vigencias: vig, existentes: [], hoje: '2026-01-10' })
    expect(plano.slice(0, 6).every((p) => p.valorCentavos === 150000)).toBe(true)
    expect(plano.slice(6).every((p) => p.valorCentavos === 165000)).toBe(true)
  })

  it('o job do dia a dia não cria meses passados; a criação da série (incluirPassado) cria', () => {
    const job = planejarOcorrencias({ serie: aluguel, vigencias, existentes: [], hoje: '2026-04-10' })
    expect(job[0].competencia).toBe('2026-04')
    expect(job).toHaveLength(12)
    expect(job[11].competencia).toBe('2027-03')

    const criacao = planejarOcorrencias({ serie: aluguel, vigencias, existentes: [], hoje: '2026-04-10', incluirPassado: true })
    expect(criacao[0].competencia).toBe('2026-01')
    expect(criacao).toHaveLength(15)
  })

  it('série que começa no futuro só começa lá', () => {
    const plano = planejarOcorrencias({
      serie: { ...aluguel, dataInicio: '2026-09-05' },
      vigencias,
      existentes: [],
      hoje: '2026-04-10'
    })
    expect(plano[0].competencia).toBe('2026-09')
    expect(plano[plano.length - 1].competencia).toBe('2027-03')
  })

  it('dia 31: fevereiro vence no 28 (29 em bissexto), abril no 30', () => {
    const plano = planejarOcorrencias({
      serie: { frequencia: 'MENSAL', diaVencimento: 31, dataInicio: '2027-01-31', dataFim: null },
      vigencias: [{ vigenteDesde: '2027-01', valorCentavos: 1000 }],
      existentes: [],
      hoje: '2027-01-02'
    })
    const venc = Object.fromEntries(plano.map((p) => [p.competencia, p.vencimento]))
    expect(venc['2027-01']).toBe('2027-01-31')
    expect(venc['2027-02']).toBe('2027-02-28')
    expect(venc['2027-04']).toBe('2027-04-30')

    const bissexto = planejarOcorrencias({
      serie: { frequencia: 'MENSAL', diaVencimento: 31, dataInicio: '2028-01-31', dataFim: null },
      vigencias: [{ vigenteDesde: '2028-01', valorCentavos: 1000 }],
      existentes: [],
      hoje: '2028-01-02'
    })
    expect(bissexto.find((p) => p.competencia === '2028-02')?.vencimento).toBe('2028-02-29')
  })

  it('anual: uma ocorrência por ano, no mesmo mês do início', () => {
    const anual = { frequencia: 'ANUAL' as const, diaVencimento: 15, dataInicio: '2025-03-15', dataFim: null }
    const v = [{ vigenteDesde: '2025-03', valorCentavos: 90000 }]
    const plano = planejarOcorrencias({ serie: anual, vigencias: v, existentes: [], hoje: '2026-11-23' })
    expect(plano).toEqual([{ competencia: '2027-03', vencimento: '2027-03-15', valorCentavos: 90000 }])

    const emMarco = planejarOcorrencias({ serie: anual, vigencias: v, existentes: [], hoje: '2026-03-01' })
    expect(emMarco.map((p) => p.competencia)).toEqual(['2026-03'])

    const criacao = planejarOcorrencias({ serie: anual, vigencias: v, existentes: [], hoje: '2026-11-23', incluirPassado: true })
    expect(criacao.map((p) => p.competencia)).toEqual(['2025-03', '2026-03', '2027-03'])
  })

  it('a data de fim corta as ocorrências que vencem depois dela', () => {
    const plano = planejarOcorrencias({ serie: { ...aluguel, dataFim: '2026-09-30' }, vigencias, existentes: [], hoje: '2026-01-10' })
    expect(plano[plano.length - 1].competencia).toBe('2026-09')
    expect(plano).toHaveLength(9)

    // Fim no dia 3 de setembro: o vencimento do dia 5 já passou do fim.
    const antes = planejarOcorrencias({ serie: { ...aluguel, dataFim: '2026-09-03' }, vigencias, existentes: [], hoje: '2026-01-10' })
    expect(antes[antes.length - 1].competencia).toBe('2026-08')
  })

  it('sem vigência não há o que criar', () => {
    expect(planejarOcorrencias({ serie: aluguel, vigencias: [], existentes: [], hoje: '2026-01-10' })).toEqual([])
  })
})

describe('limites de lista e exclusão em série', () => {
  it('a lista padrão vai até o fim do mês seguinte', () => {
    expect(limiteDaListaPadrao('2026-01-15')).toBe('2026-02-28')
    expect(limiteDaListaPadrao('2026-12-31')).toBe('2027-01-31')
    expect(limiteDaListaPadrao('2027-01-31')).toBe('2027-02-28')
  })

  it('excluir "esta e as próximas" encerra no fim do mês anterior à competência', () => {
    expect(dataFimAoExcluirEstaEAsProximas('2026-08')).toBe('2026-07-31')
    expect(dataFimAoExcluirEstaEAsProximas('2026-01')).toBe('2025-12-31')
    expect(dataFimAoExcluirEstaEAsProximas('2028-03')).toBe('2028-02-29')
  })
})
