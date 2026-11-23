import { separarTratamentos } from '@shared/receitaCalculo'
import { FAIXAS, type BasePrisma, type EntradaPrescricao, type Olho } from '@shared/prescricao'
import type { ReceitaOptica } from '@shared/types'
import type { Medidas } from '@renderer/components/prescricao/MedidasArmacao'

/** Tudo o que se digita para UM olho. Esf, cil, adicao e prisma comecam em 0,00; o resto, vazio. */
export interface EstadoOlho {
  esf: number | null
  cil: number | null
  eixo: number | null
  dnp: number | null
  alt: number | null
  prisma: number | null
  basePrisma: BasePrisma
  adicao: number | null
  dnpPerto: number | null
}

export interface EstadoPrescricao {
  dataExame: string
  profissionalNome: string
  od: EstadoOlho
  oe: EstadoOlho
  tipoLente: string
  indiceRefracao: string
  tratamentos: string[]
  armacaoTipo: string
  armacaoModelo: string
  armacaoMarca: string
  armacaoCor: string
  medidas: Medidas
  observacao: string
}

export const OLHO_VAZIO: EstadoOlho = {
  esf: 0,
  cil: 0,
  eixo: null,
  dnp: null,
  alt: null,
  prisma: 0,
  basePrisma: 'NENHUM',
  adicao: 0,
  dnpPerto: null
}

export const MEDIDAS_VAZIAS: Medidas = { ponte: null, horizontal: null, vertical: null, diagonalMaior: null }

export function estadoVazio(): EstadoPrescricao {
  return {
    dataExame: '',
    profissionalNome: '',
    od: { ...OLHO_VAZIO },
    oe: { ...OLHO_VAZIO },
    tipoLente: '',
    indiceRefracao: '',
    tratamentos: [],
    armacaoTipo: '',
    armacaoModelo: '',
    armacaoMarca: '',
    armacaoCor: '',
    medidas: { ...MEDIDAS_VAZIAS },
    observacao: ''
  }
}

/** A adicao unica de antes serve de ponto de partida so se for valida (0 a +4, de 0,25 em 0,25). */
function adicaoLegadaValida(a: number | null): number {
  if (a === null || a < FAIXAS.adicao.min || a > FAIXAS.adicao.max) return 0
  return Math.abs(a * 4 - Math.round(a * 4)) < 1e-6 ? a : 0
}

function olhoDaReceita(r: ReceitaOptica, o: Olho): EstadoOlho {
  const adicaoDoOlho = o === 'Od' ? r.adicaoOd : r.adicaoOe
  const cil = r[`longe${o}Cil`]
  return {
    esf: r[`longe${o}Esf`] ?? 0,
    cil: cil ?? 0,
    // Sem cilindro nao ha eixo (a prescricao antiga podia ter um eixo solto).
    eixo: cil === null || cil === 0 ? null : r[`longe${o}Eixo`],
    dnp: r[`longe${o}Dnp`],
    alt: r[`longe${o}Alt`],
    prisma: r[`longe${o}Prisma`],
    basePrisma: r[`longe${o}BasePrisma`],
    adicao: r.formatoAnterior ? adicaoLegadaValida(r.adicao) : (adicaoDoOlho ?? 0),
    dnpPerto: r[`perto${o}Dnp`]
  }
}

export function estadoDaReceita(r: ReceitaOptica): EstadoPrescricao {
  return {
    dataExame: r.dataExame,
    profissionalNome: r.profissionalNome ?? '',
    od: olhoDaReceita(r, 'Od'),
    oe: olhoDaReceita(r, 'Oe'),
    tipoLente: r.tipoLente ?? '',
    indiceRefracao: r.indiceRefracao ?? '',
    tratamentos: separarTratamentos(r.tratamentos),
    armacaoTipo: r.armacaoTipo ?? '',
    armacaoModelo: r.armacaoModelo ?? '',
    armacaoMarca: r.armacaoMarca ?? '',
    armacaoCor: r.armacaoCor ?? '',
    medidas: { ponte: r.ponte, horizontal: r.horizontal, vertical: r.vertical, diagonalMaior: r.diagonalMaior },
    observacao: r.observacao ?? ''
  }
}

/** Sem cilindro nao ha eixo; sem prisma a base e "Nenhum" (a mesma regra do servidor, aplicada enquanto se digita). */
export function normalizarOlho(o: EstadoOlho): EstadoOlho {
  return {
    ...o,
    eixo: o.cil === null || o.cil === 0 ? null : o.eixo,
    basePrisma: o.prisma === null || o.prisma === 0 ? 'NENHUM' : o.basePrisma
  }
}

/** O formato que `validarPrescricao` e o IPC entendem. */
export function paraEntrada(e: EstadoPrescricao): EntradaPrescricao {
  return {
    longeOdEsf: e.od.esf, longeOdCil: e.od.cil, longeOdEixo: e.od.eixo, longeOdDnp: e.od.dnp, longeOdAlt: e.od.alt,
    longeOdPrisma: e.od.prisma, longeOdBasePrisma: e.od.basePrisma, adicaoOd: e.od.adicao, pertoOdDnp: e.od.dnpPerto,
    longeOeEsf: e.oe.esf, longeOeCil: e.oe.cil, longeOeEixo: e.oe.eixo, longeOeDnp: e.oe.dnp, longeOeAlt: e.oe.alt,
    longeOePrisma: e.oe.prisma, longeOeBasePrisma: e.oe.basePrisma, adicaoOe: e.oe.adicao, pertoOeDnp: e.oe.dnpPerto,
    ponte: e.medidas.ponte, horizontal: e.medidas.horizontal, vertical: e.medidas.vertical, diagonalMaior: e.medidas.diagonalMaior
  }
}

/** "longeOdDnp" -> { olho: 'Od', campo: 'Dnp' }; "adicaoOe" -> { 'Oe', 'Adicao' }; medidas -> null. */
export function campoDoOlho(campo: string): { olho: Olho; campo: string } | null {
  const m = /^(longe|perto)(Od|Oe)(.+)$/.exec(campo)
  if (m) return { olho: m[2] as Olho, campo: m[1] === 'perto' ? `Perto${m[3]}` : m[3] }
  const a = /^adicao(Od|Oe)$/.exec(campo)
  return a ? { olho: a[1] as Olho, campo: 'Adicao' } : null
}
