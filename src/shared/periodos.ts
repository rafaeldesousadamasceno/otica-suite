/**
 * Periodos do painel gerencial: atalhos (hoje, este mes...), periodo de
 * comparacao e agrupamento da serie (dia, semana, mes).
 *
 * So datas 'YYYY-MM-DD' e conta de calendario em UTC (`Date.UTC`): nenhum
 * fuso entra aqui. "Hoje" chega sempre como parametro.
 */

import type { Granularidade } from './types'

export const PRESETS_PERIODO = [
  'hoje',
  'ontem',
  'ultimos7',
  'ultimos30',
  'esteMes',
  'mesAnterior',
  'ultimos3Meses',
  'ultimos6Meses',
  'esteAno',
  'anoAnterior',
  'personalizado'
] as const
export type PresetPeriodo = (typeof PRESETS_PERIODO)[number]

export const ROTULO_PRESET: Record<PresetPeriodo, string> = {
  hoje: 'Hoje',
  ontem: 'Ontem',
  ultimos7: 'Últimos 7 dias',
  ultimos30: 'Últimos 30 dias',
  esteMes: 'Este mês',
  mesAnterior: 'Mês anterior',
  ultimos3Meses: 'Últimos 3 meses',
  ultimos6Meses: 'Últimos 6 meses',
  esteAno: 'Este ano',
  anoAnterior: 'Ano anterior',
  personalizado: 'Personalizado'
}

export interface Periodo {
  inicio: string
  fim: string
}

/** Limite do filtro: mais que isso e volume de dado a toa para um painel. */
export const MAXIMO_DIAS_PERIODO = 366 * 3

const DIA_MS = 86_400_000

function emMs(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number)
  return Date.UTC(a, m - 1, d)
}

function deMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function somarDias(iso: string, dias: number): string {
  return deMs(emMs(iso) + dias * DIA_MS)
}

/** Dias entre duas datas (fim - inicio). */
export function diasEntre(inicio: string, fim: string): number {
  return Math.round((emMs(fim) - emMs(inicio)) / DIA_MS)
}

function primeiroDoMes(ano: number, mes0: number): string {
  return deMs(Date.UTC(ano, mes0, 1))
}

function ultimoDoMes(ano: number, mes0: number): string {
  return deMs(Date.UTC(ano, mes0 + 1, 0))
}

function partes(iso: string): { ano: number; mes0: number; dia: number } {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return { ano, mes0: mes - 1, dia }
}

/** Atalho -> datas. `personalizado` nao tem datas proprias: cai em "este mes". */
export function resolverPreset(preset: PresetPeriodo, hoje: string): Periodo {
  const { ano, mes0 } = partes(hoje)
  switch (preset) {
    case 'hoje':
      return { inicio: hoje, fim: hoje }
    case 'ontem': {
      const ontem = somarDias(hoje, -1)
      return { inicio: ontem, fim: ontem }
    }
    case 'ultimos7':
      return { inicio: somarDias(hoje, -6), fim: hoje }
    case 'ultimos30':
      return { inicio: somarDias(hoje, -29), fim: hoje }
    case 'mesAnterior':
      return { inicio: primeiroDoMes(ano, mes0 - 1), fim: ultimoDoMes(ano, mes0 - 1) }
    case 'ultimos3Meses':
      return { inicio: primeiroDoMes(ano, mes0 - 2), fim: hoje }
    case 'ultimos6Meses':
      return { inicio: primeiroDoMes(ano, mes0 - 5), fim: hoje }
    case 'esteAno':
      return { inicio: primeiroDoMes(ano, 0), fim: hoje }
    case 'anoAnterior':
      return { inicio: primeiroDoMes(ano - 1, 0), fim: ultimoDoMes(ano - 1, 11) }
    case 'esteMes':
    case 'personalizado':
    default:
      return { inicio: primeiroDoMes(ano, mes0), fim: hoje }
  }
}

/** Mesmo dia do mes em outro mes, sem passar do fim do mes (31/03 - 1 mes = 28/02). */
function mesmoDiaNoMes(ano: number, mes0: number, dia: number): string {
  const ultimo = partes(ultimoDoMes(ano, mes0)).dia
  return deMs(Date.UTC(ano, mes0, Math.min(dia, ultimo)))
}

/**
 * Periodo contra o qual comparar. Atalhos de calendario comparam com a mesma
 * fatia da unidade anterior ("este mes" 1-7/11 contra 1-7/10); os demais
 * comparam com o periodo imediatamente anterior, de mesma duracao.
 */
export function periodoComparacao(periodo: Periodo, preset: PresetPeriodo): Periodo {
  const i = partes(periodo.inicio)
  const f = partes(periodo.fim)

  if (preset === 'esteMes') {
    return { inicio: primeiroDoMes(i.ano, i.mes0 - 1), fim: mesmoDiaNoMes(f.ano, f.mes0 - 1, f.dia) }
  }
  if (preset === 'mesAnterior') {
    return { inicio: primeiroDoMes(i.ano, i.mes0 - 1), fim: ultimoDoMes(i.ano, i.mes0 - 1) }
  }
  if (preset === 'esteAno') {
    return { inicio: primeiroDoMes(i.ano - 1, 0), fim: mesmoDiaNoMes(f.ano - 1, f.mes0, f.dia) }
  }
  if (preset === 'anoAnterior') {
    return { inicio: primeiroDoMes(i.ano - 1, 0), fim: ultimoDoMes(i.ano - 1, 11) }
  }

  const duracao = diasEntre(periodo.inicio, periodo.fim) + 1
  return { inicio: somarDias(periodo.inicio, -duracao), fim: somarDias(periodo.inicio, -1) }
}

/** Variacao percentual; `null` quando nao ha base (anterior zerado). */
export function variacaoPct(atual: number, anterior: number): number | null {
  if (anterior === 0) return null
  return ((atual - anterior) / Math.abs(anterior)) * 100
}

export type { Granularidade }

/** Ate 31 dias, por dia; ate 120, por semana; acima disso, por mes. */
export function granularidadePara(periodo: Periodo): Granularidade {
  const dias = diasEntre(periodo.inicio, periodo.fim) + 1
  return dias <= 31 ? 'dia' : dias <= 120 ? 'semana' : 'mes'
}

export interface Balde {
  /** Primeiro dia do balde dentro do periodo. */
  inicio: string
  /** Ultimo dia do balde dentro do periodo. */
  fim: string
  /** Rotulo curto do eixo ("07/11", "set/26"). */
  rotulo: string
  /** Titulo completo do tooltip ("sábado, 7 de novembro", "semana de 03/11 a 09/11"). */
  titulo: string
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

const diaMes = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** Baldes continuos e sem buracos do periodo, cortados nas pontas pelo proprio periodo. */
export function gerarBaldes(periodo: Periodo, granularidade: Granularidade): Balde[] {
  const baldes: Balde[] = []
  let cursor = periodo.inicio

  while (cursor <= periodo.fim) {
    let fim: string
    let rotulo: string
    let titulo: string
    const { ano, mes0, dia } = partes(cursor)

    if (granularidade === 'dia') {
      fim = cursor
      rotulo = diaMes(cursor)
      titulo = `${DIAS_SEMANA[new Date(emMs(cursor)).getUTCDay()]}, ${dia} de ${MESES_LONGOS[mes0]}`
    } else if (granularidade === 'semana') {
      // Semana de segunda a domingo.
      const diasAteDomingo = (7 - new Date(emMs(cursor)).getUTCDay()) % 7
      fim = somarDias(cursor, diasAteDomingo)
      if (fim > periodo.fim) fim = periodo.fim
      rotulo = diaMes(cursor)
      titulo = `semana de ${diaMes(cursor)} a ${diaMes(fim)}`
    } else {
      fim = ultimoDoMes(ano, mes0)
      if (fim > periodo.fim) fim = periodo.fim
      rotulo = `${MESES_CURTOS[mes0]}/${String(ano).slice(2)}`
      titulo = `${MESES_LONGOS[mes0]} de ${ano}`
    }

    baldes.push({ inicio: cursor, fim, rotulo, titulo })
    cursor = somarDias(fim, 1)
  }
  return baldes
}

/** Soma os valores diarios dentro de cada balde. Dia fora dos baldes e ignorado. */
export function agruparPorBalde(diarios: { data: string; valor: number }[], baldes: Balde[]): number[] {
  const soma = baldes.map(() => 0)
  for (const d of diarios) {
    const i = baldes.findIndex((b) => d.data >= b.inicio && d.data <= b.fim)
    if (i !== -1) soma[i] += d.valor
  }
  return soma
}

/** Validacao do filtro: datas validas, inicio <= fim, ate 3 anos. Devolve a mensagem de erro, ou null. */
export function validarPeriodo(periodo: Periodo): string | null {
  const valida = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && deMs(emMs(s)) === s
  if (!valida(periodo.inicio) || !valida(periodo.fim)) return 'Informe datas válidas.'
  if (periodo.inicio > periodo.fim) return 'A data inicial não pode ser depois da final.'
  if (diasEntre(periodo.inicio, periodo.fim) + 1 > MAXIMO_DIAS_PERIODO) return 'O período pode ter no máximo 3 anos.'
  return null
}
