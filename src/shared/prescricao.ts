/**
 * Regras da PRESCRICAO (no codigo, "receita optica": `receita_optica`,
 * `ReceitaOptica`... so o texto que o usuario le diz "Prescricao").
 *
 * Tudo aqui e funcao pura: a tela (enquanto se digita), o servico (ao salvar),
 * a impressao e o importador usam exatamente a mesma conta.
 */
import { calcularPertoEsf } from './receitaCalculo'

export const ROTULO_PRESCRICAO = 'Prescrição'
export const ROTULO_PRESCRICOES = 'Prescrições'

// ---------------------------------------------------------------------
// Faixas aceitas
// ---------------------------------------------------------------------

export interface Faixa {
  min: number
  max: number
  /** Multiplos aceitos dentro da faixa. */
  passo?: number
}

export const FAIXAS = {
  esf: { min: -30, max: 30, passo: 0.25 },
  cil: { min: -10, max: 10, passo: 0.25 },
  eixo: { min: 0, max: 180, passo: 1 },
  adicao: { min: 0, max: 4, passo: 0.25 },
  prisma: { min: 0, max: 10 },
  dnp: { min: 20, max: 45, passo: 0.5 },
  alt: { min: 10, max: 40, passo: 0.5 }
} as const satisfies Record<string, Faixa>

/** Medidas da armacao: a "grade". A da Ponte veio do sistema de referencia; as outras sao sugestoes e podem ser ajustadas aqui. */
export const GRADE_MEDIDAS = {
  ponte: { rotulo: 'Ponte', min: 10, max: 35 },
  horizontal: { rotulo: 'Horizontal', min: 30, max: 80 },
  vertical: { rotulo: 'Vertical', min: 15, max: 65 },
  diagonalMaior: { rotulo: 'Diagonal Maior', min: 30, max: 85 }
} as const

export type MedidaArmacao = keyof typeof GRADE_MEDIDAS
export const MEDIDAS_ARMACAO = Object.keys(GRADE_MEDIDAS) as MedidaArmacao[]

export const BASES_PRISMA = ['NENHUM', 'NASAL', 'SUPERIOR', 'TEMPORAL', 'INFERIOR'] as const
export type BasePrisma = (typeof BASES_PRISMA)[number]

export const ROTULO_BASE_PRISMA: Record<BasePrisma, string> = {
  NENHUM: 'Nenhum',
  NASAL: 'Nasal',
  SUPERIOR: 'Superior',
  TEMPORAL: 'Temporal',
  INFERIOR: 'Inferior'
}

export type Olho = 'Od' | 'Oe'
export const ROTULO_OLHO: Record<Olho, string> = { Od: 'Direito', Oe: 'Esquerdo' }

function multiploDe(valor: number, passo: number): boolean {
  const n = valor / passo
  return Math.abs(n - Math.round(n)) < 1e-6
}

function dentro(valor: number, f: Faixa): boolean {
  if (valor < f.min - 1e-9 || valor > f.max + 1e-9) return false
  return f.passo === undefined || multiploDe(valor, f.passo)
}

function virgula(n: number): string {
  return String(n).replace('.', ',')
}

function grauTexto(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(2).replace('.', ',')}`
}

// ---------------------------------------------------------------------
// Perto e DP (derivados: nunca digitados)
// ---------------------------------------------------------------------

export interface GrauLonge {
  esf: number | null
  cil: number | null
  eixo: number | null
}

/**
 * Perto de um olho a partir do Longe e da Adicao: so o esferico muda
 * (Esf longe + Adicao, em passos de 0,25); cilindro e eixo sao os de longe.
 * Sem esferico de longe nao ha o que calcular; sem adicao vale 0.
 */
export function calcularPerto(longe: GrauLonge, adicao: number | null): GrauLonge {
  return { esf: calcularPertoEsf(longe.esf, adicao ?? 0), cil: longe.cil, eixo: longe.eixo }
}

/** DP = DNP direito + DNP esquerdo; falta um dos dois, nao ha DP. Uma casa decimal (31,5 + 32 = 63,5). */
export function calcularDp(dnpOd: number | null, dnpOe: number | null): number | null {
  if (dnpOd === null || dnpOe === null) return null
  return Math.round((dnpOd + dnpOe) * 10) / 10
}

// ---------------------------------------------------------------------
// Entrada, normalizacao e validacao
// ---------------------------------------------------------------------

type N = number | null

/** O que a prescricao tem de digitavel, com os mesmos nomes do formulario e do IPC. */
export interface EntradaPrescricao {
  longeOdEsf: N
  longeOdCil: N
  longeOdEixo: N
  longeOdDnp: N
  longeOdAlt: N
  longeOdPrisma: N
  longeOdBasePrisma: BasePrisma
  adicaoOd: N
  pertoOdDnp: N
  longeOeEsf: N
  longeOeCil: N
  longeOeEixo: N
  longeOeDnp: N
  longeOeAlt: N
  longeOePrisma: N
  longeOeBasePrisma: BasePrisma
  adicaoOe: N
  pertoOeDnp: N
  ponte: N
  horizontal: N
  vertical: N
  diagonalMaior: N
}

/**
 * Regras que corrigem em vez de reclamar: sem cilindro nao ha eixo; sem
 * prisma a base e "Nenhum". Vale na tela e no servidor.
 */
export function normalizarPrescricao<T extends EntradaPrescricao>(entrada: T): T {
  const saida = { ...entrada }
  for (const o of ['Od', 'Oe'] as const) {
    const cil = saida[`longe${o}Cil`]
    if (cil === null || cil === 0) saida[`longe${o}Eixo`] = null
    const prisma = saida[`longe${o}Prisma`]
    if (prisma === null || prisma === 0) saida[`longe${o}BasePrisma`] = 'NENHUM'
  }
  return saida
}

export interface ProblemaPrescricao {
  /** Nome do campo da entrada, para destacar na tela. */
  campo: keyof EntradaPrescricao
  mensagem: string
}

export function mensagemForaDaGrade(medida: MedidaArmacao): string {
  const g = GRADE_MEDIDAS[medida]
  return `⚠ Valor fora da grade — ${g.rotulo}: a grade permitida é de ${g.min} a ${g.max}`
}

/** `null` = vazio ou dentro da grade (campo vazio e permitido). */
export function validarMedidaArmacao(medida: MedidaArmacao, valor: number | null): string | null {
  if (valor === null) return null
  const g = GRADE_MEDIDAS[medida]
  return valor >= g.min && valor <= g.max ? null : mensagemForaDaGrade(medida)
}

/** "Ponte 18 · H 52 · V 40 · DM 55" - so o que esta preenchido; vazio se nada. */
export function resumoMedidas(m: Pick<EntradaPrescricao, MedidaArmacao>): string {
  const partes: [string, N][] = [
    ['Ponte', m.ponte],
    ['H', m.horizontal],
    ['V', m.vertical],
    ['DM', m.diagonalMaior]
  ]
  return partes
    .filter(([, v]) => v !== null)
    .map(([r, v]) => `${r} ${virgula(v as number)}`)
    .join(' · ')
}

/**
 * Tudo o que impede salvar, na ordem em que aparece na tela. Chame
 * `normalizarPrescricao` antes: aqui o eixo sem cilindro ja nao existe.
 */
export function validarPrescricao(e: EntradaPrescricao): ProblemaPrescricao[] {
  const problemas: ProblemaPrescricao[] = []
  const erro = (campo: keyof EntradaPrescricao, mensagem: string): void => {
    problemas.push({ campo, mensagem })
  }

  for (const o of ['Od', 'Oe'] as const) {
    const lado = ROTULO_OLHO[o]
    const esf = e[`longe${o}Esf`]
    const cil = e[`longe${o}Cil`]
    const eixo = e[`longe${o}Eixo`]
    const dnp = e[`longe${o}Dnp`]
    const alt = e[`longe${o}Alt`]
    const prisma = e[`longe${o}Prisma`]
    const base = e[`longe${o}BasePrisma`]
    const adicao = e[`adicao${o}`]
    const dnpPerto = e[`perto${o}Dnp`]

    if (esf !== null && !dentro(esf, FAIXAS.esf)) erro(`longe${o}Esf`, `${lado}: o esférico vai de ${grauTexto(FAIXAS.esf.min)} a ${grauTexto(FAIXAS.esf.max)}, em passos de 0,25`)
    if (cil !== null && !dentro(cil, FAIXAS.cil)) erro(`longe${o}Cil`, `${lado}: o cilíndrico vai de ${grauTexto(FAIXAS.cil.min)} a ${grauTexto(FAIXAS.cil.max)}, em passos de 0,25`)
    if (cil !== null && cil !== 0 && eixo === null) erro(`longe${o}Eixo`, `${lado}: informe o eixo, ele é obrigatório quando há cilindro`)
    if (eixo !== null && !dentro(eixo, FAIXAS.eixo)) erro(`longe${o}Eixo`, `${lado}: o eixo vai de 0° a 180°`)
    if (dnp === null) erro(`longe${o}Dnp`, `${lado}: informe a DNP (obrigatória)`)
    else if (!dentro(dnp, FAIXAS.dnp)) erro(`longe${o}Dnp`, `${lado}: a DNP vai de ${FAIXAS.dnp.min} a ${FAIXAS.dnp.max} mm, em passos de 0,5`)
    if (alt !== null && !dentro(alt, FAIXAS.alt)) erro(`longe${o}Alt`, `${lado}: a altura vai de ${FAIXAS.alt.min} a ${FAIXAS.alt.max} mm, em passos de 0,5`)
    if (prisma !== null && (prisma < FAIXAS.prisma.min || prisma > FAIXAS.prisma.max)) erro(`longe${o}Prisma`, `${lado}: o prisma vai de 0 a ${FAIXAS.prisma.max} Δ`)
    else if (prisma !== null && prisma > 0 && base === 'NENHUM') erro(`longe${o}BasePrisma`, `${lado}: escolha a base do prisma`)
    if (adicao !== null && !dentro(adicao, FAIXAS.adicao)) erro(`adicao${o}`, `${lado}: a adição vai de 0,00 a +4,00, em passos de 0,25`)
    if (dnpPerto !== null && !dentro(dnpPerto, FAIXAS.dnp)) erro(`perto${o}Dnp`, `${lado}: a DNP de perto vai de ${FAIXAS.dnp.min} a ${FAIXAS.dnp.max} mm, em passos de 0,5`)
  }

  for (const medida of MEDIDAS_ARMACAO) {
    const mensagem = validarMedidaArmacao(medida, e[medida])
    if (mensagem) erro(medida, mensagem)
  }
  return problemas
}

// ---------------------------------------------------------------------
// Prescricoes gravadas antes do formato novo (migracao 014 e importador)
// ---------------------------------------------------------------------

/** O que uma prescricao antiga tinha: uma adicao so, e o perto gravado a parte. */
export interface PrescricaoLegada {
  longeOdEsf: N
  longeOdCil: N
  longeOdEixo: N
  longeOeEsf: N
  longeOeCil: N
  longeOeEixo: N
  longeOdDnp: N
  longeOeDnp: N
  pertoOdEsf: N
  pertoOdCil: N
  pertoOdEixo: N
  pertoOdDnp: N
  pertoOeEsf: N
  pertoOeCil: N
  pertoOeEixo: N
  pertoOeDnp: N
  adicao: N
}

export interface PrescricaoConvertida {
  adicaoOd: N
  adicaoOe: N
  dpLonge: N
  dpPerto: N
  /** true = o perto antigo nao segue Longe + Adicao: fica como estava, so para leitura. */
  formatoAnterior: boolean
}

function adicaoDoOlho(esfLonge: N, esfPerto: N, adicaoLegada: N): N {
  if (esfPerto !== null) return esfLonge === null ? null : Math.round((esfPerto - esfLonge) * 100) / 100
  return adicaoLegada ?? 0
}

/**
 * Adicao = Esf perto - Esf longe quando o perto antigo e so "longe + adicao"
 * (cilindro e eixo de perto iguais aos de longe, ou nao informados). Se nao
 * for, ou se der uma adicao fora de 0 a +4 em passos de 0,25, NAO recalcula:
 * marca como formato anterior e os valores originais continuam como estao.
 *
 * E o mesmo calculo da migracao 014 (em SQL) - um teste confere os dois.
 */
export function converterLegado(p: PrescricaoLegada): PrescricaoConvertida {
  const adicaoOd = adicaoDoOlho(p.longeOdEsf, p.pertoOdEsf, p.adicao)
  const adicaoOe = adicaoDoOlho(p.longeOeEsf, p.pertoOeEsf, p.adicao)

  const adicaoOk = (a: N): boolean => a !== null && dentro(a, FAIXAS.adicao)
  const mesmoQueLonge = (perto: N, longe: N): boolean => perto === null || perto === longe
  const seguraRegra =
    adicaoOk(adicaoOd) &&
    adicaoOk(adicaoOe) &&
    mesmoQueLonge(p.pertoOdCil, p.longeOdCil) &&
    mesmoQueLonge(p.pertoOdEixo, p.longeOdEixo) &&
    mesmoQueLonge(p.pertoOeCil, p.longeOeCil) &&
    mesmoQueLonge(p.pertoOeEixo, p.longeOeEixo)

  return {
    adicaoOd: seguraRegra ? adicaoOd : null,
    adicaoOe: seguraRegra ? adicaoOe : null,
    dpLonge: calcularDp(p.longeOdDnp, p.longeOeDnp),
    dpPerto: calcularDp(p.pertoOdDnp, p.pertoOeDnp),
    formatoAnterior: !seguraRegra
  }
}
