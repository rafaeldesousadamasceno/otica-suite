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

// Payload como o formulario da prescricao envia.
const PRESCRICAO: Record<string, unknown> = {
  clienteId: 1,
  dataExame: '2026-11-07',
  longeOdEsf: -1.25, longeOdCil: -0.5, longeOdEixo: 90, longeOdDnp: 31.5, longeOdAlt: '', longeOdPrisma: 0, longeOdBasePrisma: 'NENHUM', adicaoOd: 2, pertoOdDnp: '',
  longeOeEsf: 0, longeOeCil: 0, longeOeEixo: '', longeOeDnp: '32', longeOeAlt: '', longeOePrisma: 0, longeOeBasePrisma: 'NENHUM', adicaoOe: 2, pertoOeDnp: '',
  ponte: '', horizontal: '', vertical: '', diagonalMaior: ''
}

describe('receitaOpticaInputSchema (prescricao)', () => {
  it('aceita virgula decimal e converte para numero; vazio vira null', () => {
    const r = receitaOpticaInputSchema.parse({ ...PRESCRICAO, longeOdDnp: '31,5', ponte: '18,5', pertoOeDnp: '' })
    expect(r.longeOdDnp).toBe(31.5)
    expect(r.ponte).toBe(18.5)
    expect(r.pertoOeDnp).toBeNull()
    expect(r.longeOdAlt).toBeNull()
  })

  it('rejeita medida que nao e numero, dizendo qual', () => {
    const r = receitaOpticaInputSchema.safeParse({ ...PRESCRICAO, ponte: 'abc' })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0].message).toBe('Ponte inválido')
  })

  it('base do prisma fora da lista e rejeitada; sem base vale "Nenhum"', () => {
    expect(receitaOpticaInputSchema.safeParse({ ...PRESCRICAO, longeOdBasePrisma: 'LATERAL' }).success).toBe(false)
    const semBase = { ...PRESCRICAO }
    delete semBase.longeOdBasePrisma
    expect(receitaOpticaInputSchema.parse(semBase).longeOdBasePrisma).toBe('NENHUM')
  })

  it('campos antigos (perto digitado, DP por olho, adicao unica, armacao em texto) nao fazem parte do formato atual', () => {
    const r = receitaOpticaInputSchema.parse({ ...PRESCRICAO, pertoOdEsf: 1, longeOdDp: 31, adicao: 2, armacao: 'X' })
    for (const campo of ['pertoOdEsf', 'longeOdDp', 'adicao', 'armacao']) expect(r).not.toHaveProperty(campo)
  })
})

describe('produtoInputSchema: grau mínimo e máximo da lente (fase 4)', () => {
  const LENTE = { ...BASE, categoria: 'lente' as const, custoCentavos: '0', margem: '0', precoVendaCentavos: '10' }

  it('aceita mínimo menor ou igual ao máximo, com vírgula, e vazio', () => {
    const r = produtoInputSchema.parse({ ...LENTE, lenteGrauMin: '-6,00', lenteGrauMax: '4' })
    expect([r.lenteGrauMin, r.lenteGrauMax]).toEqual([-6, 4])
    expect(produtoInputSchema.safeParse({ ...LENTE, lenteGrauMin: -2, lenteGrauMax: -2 }).success).toBe(true)
    expect(produtoInputSchema.safeParse({ ...LENTE, lenteGrauMin: '', lenteGrauMax: '' }).success).toBe(true)
    expect(produtoInputSchema.safeParse({ ...LENTE, lenteGrauMin: -6 }).success).toBe(true)
  })

  it('recusa mínimo maior que o máximo, apontando o máximo', () => {
    const r = produtoInputSchema.safeParse({ ...LENTE, lenteGrauMin: 2, lenteGrauMax: -2 })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]).toMatchObject({ message: 'O grau mínimo não pode ser maior que o grau máximo', path: ['lenteGrauMax'] })
  })

  it('recusa grau fora de -30 a +30 ou fora do passo de 0,25', () => {
    expect(produtoInputSchema.safeParse({ ...LENTE, lenteGrauMin: -31 }).success).toBe(false)
    expect(produtoInputSchema.safeParse({ ...LENTE, lenteGrauMax: '6,1' }).success).toBe(false)
  })

  it('em produto que não é lente o grau é ignorado (não barra)', () => {
    const r = produtoInputSchema.safeParse({ ...BASE, categoria: 'armacao', custoCentavos: '0', margem: '0', precoVendaCentavos: '10', lenteGrauMin: 9, lenteGrauMax: -9 })
    expect(r.success).toBe(true)
  })
})
