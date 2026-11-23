import { describe, expect, it } from 'vitest'
import {
  calcularDp,
  calcularPerto,
  converterLegado,
  mensagemForaDaGrade,
  normalizarPrescricao,
  resumoMedidas,
  validarMedidaArmacao,
  validarPrescricao,
  type EntradaPrescricao,
  type PrescricaoLegada
} from './prescricao'

const OLHO_OK = {
  Esf: -1.25,
  Cil: -0.5,
  Eixo: 90,
  Dnp: 31.5,
  Alt: null,
  Prisma: 0,
  BasePrisma: 'NENHUM' as const
}

function valida(extra: Partial<EntradaPrescricao> = {}): EntradaPrescricao {
  return {
    longeOdEsf: OLHO_OK.Esf, longeOdCil: OLHO_OK.Cil, longeOdEixo: OLHO_OK.Eixo, longeOdDnp: OLHO_OK.Dnp, longeOdAlt: null,
    longeOdPrisma: 0, longeOdBasePrisma: 'NENHUM', adicaoOd: 0, pertoOdDnp: null,
    longeOeEsf: 0, longeOeCil: 0, longeOeEixo: null, longeOeDnp: 32, longeOeAlt: null,
    longeOePrisma: 0, longeOeBasePrisma: 'NENHUM', adicaoOe: 0, pertoOeDnp: null,
    ponte: null, horizontal: null, vertical: null, diagonalMaior: null,
    ...extra
  }
}

const campos = (e: EntradaPrescricao): string[] => validarPrescricao(normalizarPrescricao(e)).map((p) => p.campo)

describe('Esf. de perto = Esf. longe + Adicao', () => {
  it('longe -2,00 com adição +2,00 → 0,00', () => {
    expect(calcularPerto({ esf: -2, cil: null, eixo: null }, 2).esf).toBe(0)
  })
  it('longe +1,25 com adição +1,75 → +3,00', () => {
    expect(calcularPerto({ esf: 1.25, cil: null, eixo: null }, 1.75).esf).toBe(3)
  })
  it('longe -0,75 com adição 0,00 → -0,75', () => {
    expect(calcularPerto({ esf: -0.75, cil: null, eixo: null }, 0).esf).toBe(-0.75)
  })
  it('cilindro e eixo de perto são os de longe; a adição só mexe no esférico', () => {
    expect(calcularPerto({ esf: -1, cil: -0.75, eixo: 90 }, 2)).toEqual({ esf: 1, cil: -0.75, eixo: 90 })
  })
  it('sem esférico de longe não há perto; sem adição vale 0', () => {
    expect(calcularPerto({ esf: null, cil: null, eixo: null }, 2).esf).toBeNull()
    expect(calcularPerto({ esf: 1, cil: null, eixo: null }, null).esf).toBe(1)
  })
})

describe('DP', () => {
  it('31,5 + 32,0 = 63,5', () => {
    expect(calcularDp(31.5, 32)).toBe(63.5)
  })
  it('sem um dos dois lados, sem DP', () => {
    expect(calcularDp(31.5, null)).toBeNull()
    expect(calcularDp(null, null)).toBeNull()
  })
  it('sem erro de ponto flutuante', () => {
    expect(calcularDp(30.1, 30.2)).toBe(60.3)
  })
})

describe('prisma e base', () => {
  it('prisma 1,00 com base "Nenhum" → inválido', () => {
    expect(campos(valida({ longeOdPrisma: 1, longeOdBasePrisma: 'NENHUM' }))).toEqual(['longeOdBasePrisma'])
  })
  it('prisma 1,00 com base escolhida → válido', () => {
    expect(campos(valida({ longeOdPrisma: 1, longeOdBasePrisma: 'NASAL' }))).toEqual([])
  })
  it('prisma 0 → a base volta para "Nenhum"', () => {
    const n = normalizarPrescricao(valida({ longeOdPrisma: 0, longeOdBasePrisma: 'TEMPORAL' }))
    expect(n.longeOdBasePrisma).toBe('NENHUM')
  })
  it('prisma acima de 10 Δ → inválido', () => {
    expect(campos(valida({ longeOdPrisma: 10.5, longeOdBasePrisma: 'NASAL' }))).toEqual(['longeOdPrisma'])
  })
})

describe('eixo e cilindro', () => {
  it('eixo é obrigatório quando há cilindro', () => {
    expect(campos(valida({ longeOdEixo: null }))).toEqual(['longeOdEixo'])
  })
  it('com cilindro 0 o eixo é limpo e não reclama', () => {
    const e = valida({ longeOeCil: 0, longeOeEixo: 90 })
    expect(normalizarPrescricao(e).longeOeEixo).toBeNull()
    expect(campos(e)).toEqual([])
  })
  it('eixo fora de 0 a 180', () => {
    expect(campos(valida({ longeOdEixo: 181 }))).toEqual(['longeOdEixo'])
  })
})

describe('DNP e demais faixas', () => {
  it('DNP é opcional: vazia passa nos dois olhos', () => {
    expect(campos(valida({ longeOdDnp: null, longeOeDnp: null }))).toEqual([])
  })
  it('DNP de 20 a 45, de 0,5 em 0,5', () => {
    expect(campos(valida({ longeOdDnp: 19.5 }))).toEqual(['longeOdDnp'])
    expect(campos(valida({ longeOdDnp: 45.5 }))).toEqual(['longeOdDnp'])
    expect(campos(valida({ longeOdDnp: 31.3 }))).toEqual(['longeOdDnp'])
    expect(campos(valida({ longeOdDnp: 20 }))).toEqual([])
  })
  it('altura de 10 a 40; vazia é permitida', () => {
    expect(campos(valida({ longeOdAlt: 9.5 }))).toEqual(['longeOdAlt'])
    expect(campos(valida({ longeOdAlt: 18 }))).toEqual([])
  })
  it('adição de 0 a +4', () => {
    expect(campos(valida({ adicaoOd: 4.25 }))).toEqual(['adicaoOd'])
    expect(campos(valida({ adicaoOe: -0.25 }))).toEqual(['adicaoOe'])
    expect(campos(valida({ adicaoOe: 4 }))).toEqual([])
  })
  it('esférico de -30 a +30 em passos de 0,25', () => {
    expect(campos(valida({ longeOdEsf: 30.25 }))).toEqual(['longeOdEsf'])
    expect(campos(valida({ longeOdEsf: -1.1 }))).toEqual(['longeOdEsf'])
  })
})

describe('grade das medidas da armação', () => {
  it('Ponte: 9 → fora da grade; 18 → ok; vazio → ok', () => {
    expect(validarMedidaArmacao('ponte', 9)).toBe('⚠ Valor fora da grade — Ponte: a grade permitida é de 10 a 35')
    expect(validarMedidaArmacao('ponte', 18)).toBeNull()
    expect(validarMedidaArmacao('ponte', null)).toBeNull()
  })
  it('limites inclusivos e as outras medidas', () => {
    expect(validarMedidaArmacao('ponte', 10)).toBeNull()
    expect(validarMedidaArmacao('ponte', 35)).toBeNull()
    expect(validarMedidaArmacao('horizontal', 29.9)).not.toBeNull()
    expect(validarMedidaArmacao('vertical', 65.1)).not.toBeNull()
    expect(validarMedidaArmacao('diagonalMaior', 85)).toBeNull()
    expect(mensagemForaDaGrade('diagonalMaior')).toContain('Diagonal Maior: a grade permitida é de 30 a 85')
  })
  it('valor fora da grade impede salvar', () => {
    expect(campos(valida({ ponte: 9 }))).toEqual(['ponte'])
  })
  it('resumo mostra só o preenchido', () => {
    expect(resumoMedidas({ ponte: 18, horizontal: 52, vertical: 40, diagonalMaior: 55 })).toBe('Ponte 18 · H 52 · V 40 · DM 55')
    expect(resumoMedidas({ ponte: 18.5, horizontal: null, vertical: null, diagonalMaior: 55 })).toBe('Ponte 18,5 · DM 55')
    expect(resumoMedidas({ ponte: null, horizontal: null, vertical: null, diagonalMaior: null })).toBe('')
  })
})

const LEGADA: PrescricaoLegada = {
  longeOdEsf: -1, longeOdCil: -0.5, longeOdEixo: 90, longeOeEsf: -1.25, longeOeCil: null, longeOeEixo: null,
  longeOdDnp: 31.5, longeOeDnp: 32,
  pertoOdEsf: 1, pertoOdCil: -0.5, pertoOdEixo: 90, pertoOdDnp: 30, pertoOeEsf: 0.75, pertoOeCil: null, pertoOeEixo: null, pertoOeDnp: 30.5,
  adicao: 2
}

describe('conversão das prescrições antigas', () => {
  it('perto = longe + adição: vira adição por olho e não é formato anterior', () => {
    expect(converterLegado(LEGADA)).toEqual({ adicaoOd: 2, adicaoOe: 2, dpLonge: 63.5, dpPerto: 60.5, formatoAnterior: false })
  })
  it('perto em branco usa a adição única de antes, nos dois olhos', () => {
    const r = converterLegado({ ...LEGADA, pertoOdEsf: null, pertoOeEsf: null, adicao: 1.5 })
    expect(r).toMatchObject({ adicaoOd: 1.5, adicaoOe: 1.5, formatoAnterior: false })
  })
  it('sem perto e sem adição: adição 0', () => {
    const r = converterLegado({ ...LEGADA, pertoOdEsf: null, pertoOeEsf: null, adicao: null })
    expect(r).toMatchObject({ adicaoOd: 0, adicaoOe: 0, formatoAnterior: false })
  })
  it('perto com cilindro diferente do longe não segue a regra: formato anterior, sem recalcular', () => {
    const r = converterLegado({ ...LEGADA, pertoOdCil: -1 })
    expect(r).toMatchObject({ adicaoOd: null, adicaoOe: null, formatoAnterior: true })
  })
  it('eixo de perto diferente → formato anterior', () => {
    expect(converterLegado({ ...LEGADA, pertoOeCil: null, pertoOeEixo: 10 }).formatoAnterior).toBe(true)
  })
  it('adição fora de 0 a +4 ou fora do passo de 0,25 → formato anterior', () => {
    expect(converterLegado({ ...LEGADA, pertoOdEsf: -2 }).formatoAnterior).toBe(true)
    expect(converterLegado({ ...LEGADA, pertoOdEsf: 5.5 }).formatoAnterior).toBe(true)
    expect(converterLegado({ ...LEGADA, pertoOdEsf: 1.1 }).formatoAnterior).toBe(true)
  })
  it('perto fora da grade de 0,25 → formato anterior (senão o valor mudaria sem aviso)', () => {
    // longe -1,10 e perto +0,90 dão adição 2,00, mas o perto calculado seria +1,00
    expect(converterLegado({ ...LEGADA, longeOdEsf: -1.1, pertoOdEsf: 0.9, adicao: 2 }).formatoAnterior).toBe(true)
    expect(converterLegado({ ...LEGADA, pertoOeEsf: 0.6, longeOeEsf: -1.4 }).formatoAnterior).toBe(true)
  })
  it('perto preenchido sem esférico de longe → formato anterior', () => {
    expect(converterLegado({ ...LEGADA, longeOdEsf: null }).formatoAnterior).toBe(true)
  })
  it('DP só quando há os dois lados', () => {
    expect(converterLegado({ ...LEGADA, longeOeDnp: null }).dpLonge).toBeNull()
  })
})
