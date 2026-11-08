import { describe, expect, it } from 'vitest'
import {
  MAXIMO_DIAS_PERIODO,
  agruparPorBalde,
  diasEntre,
  gerarBaldes,
  granularidadePara,
  periodoComparacao,
  resolverPreset,
  somarDias,
  validarPeriodo,
  variacaoPct
} from './periodos'

const HOJE = '2026-11-07' // sabado

describe('resolverPreset', () => {
  it('atalhos de dias', () => {
    expect(resolverPreset('hoje', HOJE)).toEqual({ inicio: HOJE, fim: HOJE })
    expect(resolverPreset('ontem', HOJE)).toEqual({ inicio: '2026-11-06', fim: '2026-11-06' })
    expect(resolverPreset('ultimos7', HOJE)).toEqual({ inicio: '2026-11-01', fim: HOJE })
    expect(resolverPreset('ultimos30', HOJE)).toEqual({ inicio: '2026-10-09', fim: HOJE })
  })

  it('este mes e mes anterior', () => {
    expect(resolverPreset('esteMes', HOJE)).toEqual({ inicio: '2026-11-01', fim: HOJE })
    expect(resolverPreset('mesAnterior', HOJE)).toEqual({ inicio: '2026-10-01', fim: '2026-10-31' })
  })

  it('mes anterior na virada do ano e em ano bissexto', () => {
    expect(resolverPreset('mesAnterior', '2027-01-15')).toEqual({ inicio: '2026-12-01', fim: '2026-12-31' })
    expect(resolverPreset('mesAnterior', '2028-03-10')).toEqual({ inicio: '2028-02-01', fim: '2028-02-29' })
  })

  it('ultimos 3 e 6 meses comecam no dia 1 do mes inicial', () => {
    expect(resolverPreset('ultimos3Meses', HOJE)).toEqual({ inicio: '2026-09-01', fim: HOJE })
    expect(resolverPreset('ultimos6Meses', HOJE)).toEqual({ inicio: '2026-06-01', fim: HOJE })
    expect(resolverPreset('ultimos3Meses', '2027-01-15').inicio).toBe('2026-11-01')
  })

  it('este ano e ano anterior', () => {
    expect(resolverPreset('esteAno', HOJE)).toEqual({ inicio: '2026-01-01', fim: HOJE })
    expect(resolverPreset('anoAnterior', HOJE)).toEqual({ inicio: '2025-01-01', fim: '2025-12-31' })
  })
})

describe('periodoComparacao', () => {
  it('este mes compara com a mesma fatia do mes anterior', () => {
    const p = resolverPreset('esteMes', HOJE)
    expect(periodoComparacao(p, 'esteMes')).toEqual({ inicio: '2026-10-01', fim: '2026-10-07' })
  })

  it('este mes no dia 31 nao passa do fim do mes anterior', () => {
    const p = resolverPreset('esteMes', '2026-03-31')
    expect(periodoComparacao(p, 'esteMes')).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' })
  })

  it('mes anterior compara com o mes antes dele, inteiro', () => {
    const p = resolverPreset('mesAnterior', HOJE)
    expect(periodoComparacao(p, 'mesAnterior')).toEqual({ inicio: '2026-09-01', fim: '2026-09-30' })
  })

  it('este ano compara com o mesmo trecho do ano passado', () => {
    const p = resolverPreset('esteAno', HOJE)
    expect(periodoComparacao(p, 'esteAno')).toEqual({ inicio: '2025-01-01', fim: '2025-11-07' })
  })

  it('este ano em 29/02 cai em 28/02 num ano nao bissexto', () => {
    expect(periodoComparacao({ inicio: '2028-01-01', fim: '2028-02-29' }, 'esteAno')).toEqual({
      inicio: '2027-01-01',
      fim: '2027-02-28'
    })
  })

  it('os demais usam o periodo anterior de mesma duracao', () => {
    expect(periodoComparacao({ inicio: '2026-11-01', fim: '2026-11-07' }, 'ultimos7')).toEqual({
      inicio: '2026-10-25',
      fim: '2026-10-31'
    })
    expect(periodoComparacao({ inicio: HOJE, fim: HOJE }, 'hoje')).toEqual({ inicio: '2026-11-06', fim: '2026-11-06' })
    const personalizado = periodoComparacao({ inicio: '2026-03-01', fim: '2026-03-31' }, 'personalizado')
    expect(diasEntre(personalizado.inicio, personalizado.fim)).toBe(30)
    expect(personalizado.fim).toBe('2026-02-28')
  })
})

describe('variacaoPct', () => {
  it('calcula a variacao e devolve null sem base', () => {
    expect(variacaoPct(35_000, 29_000)).toBeCloseTo(20.69, 2)
    expect(variacaoPct(50, 100)).toBe(-50)
    expect(variacaoPct(10, 0)).toBeNull()
  })

  it('base negativa nao inverte o sinal da variacao', () => {
    expect(variacaoPct(-50, -100)).toBe(50)
  })
})

describe('granularidadePara', () => {
  it('dia ate 31 dias, semana ate 120, mes acima', () => {
    expect(granularidadePara({ inicio: '2026-10-01', fim: '2026-10-31' })).toBe('dia')
    expect(granularidadePara({ inicio: '2026-10-01', fim: '2026-11-01' })).toBe('semana')
    expect(granularidadePara({ inicio: '2026-08-01', fim: '2026-11-28' })).toBe('semana')
    expect(granularidadePara({ inicio: '2026-07-01', fim: '2026-11-07' })).toBe('mes')
  })
})

describe('gerarBaldes', () => {
  it('por dia cobre todos os dias, inclusive os sem venda', () => {
    const baldes = gerarBaldes({ inicio: '2026-10-30', fim: '2026-11-02' }, 'dia')
    expect(baldes.map((b) => b.inicio)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    expect(baldes[3].rotulo).toBe('02/11')
    expect(baldes[3].titulo).toBe('segunda-feira, 2 de novembro')
  })

  it('semanas vao de segunda a domingo e sao cortadas nas pontas do periodo', () => {
    // 2026-11-04 e quarta; 2026-11-22 e domingo.
    const baldes = gerarBaldes({ inicio: '2026-11-04', fim: '2026-11-24' }, 'semana')
    expect(baldes.map((b) => [b.inicio, b.fim])).toEqual([
      ['2026-11-04', '2026-11-08'],
      ['2026-11-09', '2026-11-15'],
      ['2026-11-16', '2026-11-22'],
      ['2026-11-23', '2026-11-24']
    ])
    expect(baldes[0].titulo).toBe('semana de 04/11 a 08/11')
  })

  it('por mes, na virada do ano', () => {
    const baldes = gerarBaldes({ inicio: '2026-11-15', fim: '2027-01-10' }, 'mes')
    expect(baldes.map((b) => [b.inicio, b.fim])).toEqual([
      ['2026-11-15', '2026-11-30'],
      ['2026-12-01', '2026-12-31'],
      ['2027-01-01', '2027-01-10']
    ])
    expect(baldes[2].rotulo).toBe('jan/27')
  })

  it('os baldes sempre cobrem o periodo inteiro, sem buraco nem sobreposicao', () => {
    const p = { inicio: '2026-02-10', fim: '2027-03-05' }
    for (const g of ['dia', 'semana', 'mes'] as const) {
      const baldes = gerarBaldes(p, g)
      expect(baldes[0].inicio).toBe(p.inicio)
      expect(baldes[baldes.length - 1].fim).toBe(p.fim)
      baldes.slice(1).forEach((b, i) => expect(b.inicio).toBe(somarDias(baldes[i].fim, 1)))
    }
  })
})

describe('agruparPorBalde', () => {
  it('soma os dias de cada balde e ignora dias fora do periodo', () => {
    const baldes = gerarBaldes({ inicio: '2026-11-02', fim: '2026-11-15' }, 'semana')
    const soma = agruparPorBalde(
      [
        { data: '2026-11-02', valor: 10 },
        { data: '2026-11-08', valor: 5 },
        { data: '2026-11-09', valor: 7 },
        { data: '2026-10-31', valor: 999 }
      ],
      baldes
    )
    expect(soma).toEqual([15, 7])
  })
})

describe('validarPeriodo', () => {
  it('aceita um periodo valido', () => {
    expect(validarPeriodo({ inicio: '2026-11-01', fim: '2026-11-07' })).toBeNull()
  })

  it('rejeita inicio depois do fim, data inexistente e periodo longo demais', () => {
    expect(validarPeriodo({ inicio: '2026-11-08', fim: '2026-11-07' })).toMatch(/depois da final/)
    expect(validarPeriodo({ inicio: '2026-02-30', fim: '2026-03-01' })).toMatch(/válidas/)
    expect(validarPeriodo({ inicio: '2020-01-01', fim: '2026-01-01' })).toMatch(/3 anos/)
    expect(MAXIMO_DIAS_PERIODO).toBeGreaterThan(1000)
  })
})
