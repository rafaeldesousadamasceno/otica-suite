import { describe, expect, it } from 'vitest'
import { produtoInputSchema, receitaOpticaInputSchema } from './ipc'

const BASE = {
  descricao: 'Armação teste',
  categoria: 'armacao' as const,
  unidade: 'UN'
}

describe('produtoInputSchema - dinheiro em formato brasileiro (PRD 10.4: centavos, inteiro)', () => {
  it('converte "89,90" em 8990 centavos', () => {
    const r = produtoInputSchema.parse({ ...BASE, custoCentavos: '89,90', margem: '0', precoVendaCentavos: '89,90' })
    expect(r.custoCentavos).toBe(8990)
    expect(r.precoVendaCentavos).toBe(8990)
  })

  it('trata o ponto como separador de milhar: "1.234,56" -> 123456 centavos', () => {
    const r = produtoInputSchema.parse({ ...BASE, custoCentavos: '1.234,56', margem: '0', precoVendaCentavos: '0' })
    expect(r.custoCentavos).toBe(123456)
  })

  it('string vazia vira zero, nunca NaN', () => {
    const r = produtoInputSchema.parse({ ...BASE, custoCentavos: '', margem: '0', precoVendaCentavos: '0' })
    expect(r.custoCentavos).toBe(0)
  })

  it('aceita numero puro (ja em centavos) sem reinterpretar', () => {
    const r = produtoInputSchema.parse({ ...BASE, custoCentavos: 5000, margem: '0', precoVendaCentavos: 5000 })
    expect(r.custoCentavos).toBe(5000)
  })

  it('rejeita valor negativo', () => {
    expect(() =>
      produtoInputSchema.parse({ ...BASE, custoCentavos: '-10,00', margem: '0', precoVendaCentavos: '0' })
    ).toThrow()
  })

  it('margem aceita percentual com virgula', () => {
    const r = produtoInputSchema.parse({ ...BASE, custoCentavos: '0', margem: '35,5', precoVendaCentavos: '0' })
    expect(r.margem).toBe(35.5)
  })
})

// Payload como o formulario enviava antes da migracao 008: sem DP e com altura.
const RECEITA_ANTIGA: Record<string, unknown> = {
  clienteId: 1,
  dataExame: '2026-11-07',
  adicao: '',
  altura: '18'
}
for (const lado of ['longeOd', 'longeOe', 'pertoOd', 'pertoOe']) {
  for (const campo of ['Esf', 'Cil', 'Eixo', 'Dnp']) RECEITA_ANTIGA[`${lado}${campo}`] = ''
}

describe('receitaOpticaInputSchema - DP por olho (migracao 008)', () => {
  it('aceita DP com virgula e converte para numero', () => {
    const r = receitaOpticaInputSchema.parse({ ...RECEITA_ANTIGA, longeOdDp: '31,5', pertoOeDp: 30 })
    expect(r.longeOdDp).toBe(31.5)
    expect(r.pertoOeDp).toBe(30)
  })

  it('DP vazio vira null', () => {
    const r = receitaOpticaInputSchema.parse({ ...RECEITA_ANTIGA, longeOeDp: '' })
    expect(r.longeOeDp).toBeNull()
  })

  it('rejeita DP que nao e numero', () => {
    const r = receitaOpticaInputSchema.safeParse({ ...RECEITA_ANTIGA, pertoOdDp: 'abc' })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0].message).toBe('DP inválido')
  })

  it('payload antigo, sem DP, continua valido', () => {
    const r = receitaOpticaInputSchema.parse(RECEITA_ANTIGA)
    expect(r.longeOdDp).toBeUndefined()
    expect(r.altura).toBe(18)
  })

  it('formulario novo nao envia altura e continua valido', () => {
    const semAltura = { ...RECEITA_ANTIGA }
    delete semAltura.altura
    const r = receitaOpticaInputSchema.parse(semAltura)
    expect(r.altura).toBeUndefined()
  })
})
