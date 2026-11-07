import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PALETA_VIZ, arcoRosca, formatarBRLCompacto, niceTicks, retanguloTopoArredondado } from './graficos'

describe('arcoRosca', () => {
  it('gera um caminho fechado sem NaN', () => {
    const d = arcoRosca(75, 75, 70, 45, 0, Math.PI / 2)
    expect(d).toMatch(/^M.*Z$/)
    expect(d).not.toMatch(/NaN|Infinity/)
  })

  it('uma fatia de volta inteira vira dois arcos (um arco so nao desenharia nada)', () => {
    expect(arcoRosca(75, 75, 70, 45, 0, Math.PI * 2).match(/M/g)).toHaveLength(2)
  })
})

describe('PALETA_VIZ', () => {
  it('bate com as variaveis --viz-* do tema claro do app', () => {
    const css = readFileSync(join(__dirname, '../renderer/src/index.css'), 'utf8')
    const temaClaro = css.slice(css.indexOf(':root {'), css.indexOf(":root[data-theme='escuro']"))
    const valor = (nome: string): string | undefined =>
      new RegExp(`--${nome}:\\s*(#[0-9a-f]{6})`, 'i').exec(temaClaro)?.[1].toLowerCase()
    expect(valor('viz-1')).toBe(PALETA_VIZ.categorica[0])
    expect(valor('viz-2')).toBe(PALETA_VIZ.categorica[1])
    expect(valor('viz-3')).toBe(PALETA_VIZ.categorica[2])
    expect(valor('viz-4')).toBe(PALETA_VIZ.categorica[3])
    expect(valor('viz-outros')).toBe(PALETA_VIZ.outros)
    expect([valor('viz-ord-1'), valor('viz-ord-2'), valor('viz-ord-3')]).toEqual([...PALETA_VIZ.ordinal])
  })
})

describe('niceTicks', () => {
  it('escolhe passos redondos e termina em um valor >= ao maximo', () => {
    expect(niceTicks(123_456)).toEqual([0, 50_000, 100_000, 150_000])
    expect(niceTicks(1000)).toEqual([0, 500, 1000])
    const ticks = niceTicks(87)
    expect(ticks[0]).toBe(0)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(87)
  })

  it('sem dados devolve uma escala minima em vez de dividir por zero', () => {
    expect(niceTicks(0)).toEqual([0, 1])
    expect(niceTicks(-5)).toEqual([0, 1])
  })

  it('os passos sao sempre 1, 2 ou 5 vezes uma potencia de 10', () => {
    for (const max of [3, 17, 260, 4_999, 82_000, 1_234_567]) {
      const ticks = niceTicks(max)
      const passo = ticks[1] - ticks[0]
      const mantissa = passo / 10 ** Math.floor(Math.log10(passo))
      expect([1, 2, 5]).toContain(mantissa)
    }
  })
})

describe('formatarBRLCompacto', () => {
  // O Intl do pt-BR separa "1,5" de "mil" com espaco inseparavel (NBSP): bom na
  // tela, porque o rotulo do eixo nunca quebra de linha - o teste so normaliza.
  const semNbsp = (texto: string): string => texto.replace(/ /g, ' ')

  it('abrevia milhares e milhoes em portugues', () => {
    expect(semNbsp(formatarBRLCompacto(85_000))).toBe('R$ 850')
    expect(semNbsp(formatarBRLCompacto(150_000))).toBe('R$ 1,5 mil')
    expect(semNbsp(formatarBRLCompacto(0))).toBe('R$ 0')
  })
})

describe('retanguloTopoArredondado', () => {
  it('nunca arredonda mais que a metade da largura nem que a altura (barra baixinha)', () => {
    // altura 2 < raio 4: o raio cai para 2, sem o caminho "vazar" acima da barra
    expect(retanguloTopoArredondado(10, 50, 20, 2, 4)).toContain('Q10,50 12,50')
  })

  it('a base fica reta: o caminho parte e termina em y + altura', () => {
    const d = retanguloTopoArredondado(0, 10, 24, 30, 4)
    expect(d.startsWith('M0,40')).toBe(true)
    expect(d).toContain('V40')
  })
})
