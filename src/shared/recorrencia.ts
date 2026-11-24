/**
 * Regras da recorrencia de contas a pagar (documento de melhorias, secao 10), todas em funcoes
 * puras: o servidor (job que materializa as ocorrencias, reajuste, encerramento) e a tela usam
 * exatamente as mesmas contas.
 *
 * Vocabulario:
 *  - competencia: o mes a que a ocorrencia se refere, 'AAAA-MM';
 *  - vigencia: valor que vale a partir de uma competencia (`vigenteDesde`, 'AAAA-MM');
 *  - serie: a recorrencia em si (aluguel, energia...); cada ocorrencia vira uma conta a pagar.
 *
 * Datas sao strings ISO 'AAAA-MM-DD' e dinheiro e centavos inteiros. Nunca se usa `new Date('AAAA-MM-DD')`
 * (que e UTC e escorrega um dia no Brasil): a conta e feita sobre os numeros do calendario.
 */
import type { FrequenciaRecorrencia, RecorrenciaValor } from './types'

/** Quantos meses (contando o atual) ficam materializados a frente. */
export const HORIZONTE_MESES = 12

const RE_COMPETENCIA = /^(\d{4})-(0[1-9]|1[0-2])$/
const RE_DATA = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function competenciaValida(texto: string): boolean {
  return RE_COMPETENCIA.test(texto)
}

/** 'AAAA-MM' ou 'AAAA-MM-DD' -> 'AAAA-MM'; qualquer outra coisa -> null. */
export function normalizarCompetencia(texto: string | null | undefined): string | null {
  const t = (texto ?? '').trim()
  if (RE_COMPETENCIA.test(t)) return t
  const d = RE_DATA.exec(t)
  return d ? `${d[1]}-${d[2]}` : null
}

/** A competencia de uma data ISO ('2026-03-31' -> '2026-03'). */
export function competenciaDeData(iso: string): string {
  const c = normalizarCompetencia(iso)
  if (!c) throw new Error(`Data inválida: ${iso}`)
  return c
}

function partes(competencia: string): [number, number] {
  const m = RE_COMPETENCIA.exec(competencia)
  if (!m) throw new Error(`Competência inválida: ${competencia}`)
  return [Number(m[1]), Number(m[2])]
}

/** Soma (ou subtrai, com n negativo) meses a uma competencia. */
export function somarMeses(competencia: string, n: number): string {
  const [ano, mes] = partes(competencia)
  const indice = ano * 12 + (mes - 1) + n
  return `${String(Math.floor(indice / 12)).padStart(4, '0')}-${pad2((indice % 12) + 1)}`
}

/** Diferenca em meses: `b - a` (positiva quando b vem depois de a). */
export function diferencaEmMeses(a: string, b: string): number {
  const [aa, am] = partes(a)
  const [ba, bm] = partes(b)
  return (ba - aa) * 12 + (bm - am)
}

export function diasNaCompetencia(competencia: string): number {
  const [ano, mes] = partes(competencia)
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

/** Ultimo dia da competencia, ISO ('2026-02' -> '2026-02-28'). */
export function ultimoDiaDaCompetencia(competencia: string): string {
  return `${competencia}-${pad2(diasNaCompetencia(competencia))}`
}

/** Dia do mes de uma data ISO. */
export function diaDeData(iso: string): number {
  const d = RE_DATA.exec(iso)
  if (!d) throw new Error(`Data inválida: ${iso}`)
  return Number(d[3])
}

/**
 * Vencimento do dia `dia` na competencia, respeitando o ultimo dia do mes:
 * dia 31 em fevereiro de 2026 vence em 28/02; em ano bissexto, 29/02.
 */
export function vencimentoNaCompetencia(competencia: string, dia: number): string {
  const d = Math.min(Math.max(Math.trunc(dia), 1), diasNaCompetencia(competencia))
  return `${competencia}-${pad2(d)}`
}

/**
 * Valor que vale numa competencia: a vigencia mais recente que ja comecou ate ela. Se a competencia vem
 * antes da primeira vigencia, vale a primeira (nao ha "sem valor"). Sem nenhuma vigencia: null.
 */
export function valorVigenteNaCompetencia(vigencias: readonly RecorrenciaValor[], competencia: string): number | null {
  if (vigencias.length === 0) return null
  const ordenadas = [...vigencias].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde))
  let valor = ordenadas[0].valorCentavos
  for (const v of ordenadas) {
    if (v.vigenteDesde <= competencia) valor = v.valorCentavos
    else break
  }
  return valor
}

/**
 * Reajuste "a partir de": a vigencia nova vale dali em diante e SUBSTITUI as que estavam marcadas para
 * depois (quem reajusta de abril em diante quer todos os meses seguintes no valor novo). Uma vigencia
 * que ja comecava na mesma competencia e trocada. O que veio antes nao muda.
 */
export function aplicarReajuste(vigencias: readonly RecorrenciaValor[], aPartirDe: string, valorCentavos: number): RecorrenciaValor[] {
  const anteriores = vigencias.filter((v) => v.vigenteDesde < aPartirDe)
  return [...anteriores, { vigenteDesde: aPartirDe, valorCentavos }].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde))
}

/** Passo, em meses, entre uma ocorrencia e a seguinte. */
export function passoEmMeses(frequencia: FrequenciaRecorrencia): number {
  return frequencia === 'ANUAL' ? 12 : 1
}

export interface SerieParaPlanejar {
  frequencia: FrequenciaRecorrencia
  diaVencimento: number
  /** Data de inicio da serie (ISO): a primeira ocorrencia e a da competencia dela. */
  dataInicio: string
  /** Ultimo vencimento permitido (ISO), ou null enquanto a serie nao tem fim. */
  dataFim: string | null
}

export interface OcorrenciaPlanejada {
  competencia: string
  vencimento: string
  valorCentavos: number
}

/** Ultima competencia do horizonte a partir de hoje: o mes atual e mais 11, no total 12. */
export function fimDoHorizonte(hoje: string): string {
  return somarMeses(competenciaDeData(hoje), HORIZONTE_MESES - 1)
}

/**
 * Plano de ocorrencias que faltam criar para a serie: toda competencia do horizonte (do mes de `hoje`
 * ate `fimDoHorizonte`) que cai na cadencia da serie, nao passa da data de fim e ainda nao existe.
 *
 *  - `existentes`: competencias que ja tem registro, INCLUSIVE as excluidas (assim uma ocorrencia removida
 *    com "excluir somente esta" nao volta);
 *  - `incluirPassado`: usado so na criacao da serie, para materializar tambem os meses entre o inicio
 *    informado (que pode estar no passado) e hoje. O job do dia a dia nunca cria meses passados: uma
 *    serie antiga (ou com buraco) nao ganha de repente varias contas vencidas;
 *  - o valor de cada ocorrencia e o vigente na competencia dela.
 */
export function planejarOcorrencias(entrada: {
  serie: SerieParaPlanejar
  vigencias: readonly RecorrenciaValor[]
  existentes: Iterable<string>
  hoje: string
  incluirPassado?: boolean
}): OcorrenciaPlanejada[] {
  const { serie, vigencias, hoje } = entrada
  const existentes = new Set(entrada.existentes)
  const inicio = competenciaDeData(serie.dataInicio)
  const atual = competenciaDeData(hoje)
  const fim = fimDoHorizonte(hoje)
  const passo = passoEmMeses(serie.frequencia)
  const primeira = entrada.incluirPassado ? inicio : inicio > atual ? inicio : atual

  const plano: OcorrenciaPlanejada[] = []
  // Alinha na cadencia da serie: a partir do inicio, de `passo` em `passo` meses.
  let competencia = inicio
  if (competencia < primeira) {
    const saltos = Math.ceil(diferencaEmMeses(inicio, primeira) / passo)
    competencia = somarMeses(inicio, saltos * passo)
  }
  for (; competencia <= fim; competencia = somarMeses(competencia, passo)) {
    if (existentes.has(competencia)) continue
    const vencimento = vencimentoNaCompetencia(competencia, serie.diaVencimento)
    if (serie.dataFim && vencimento > serie.dataFim) break
    const valor = valorVigenteNaCompetencia(vigencias, competencia)
    if (valor === null) break
    plano.push({ competencia, vencimento, valorCentavos: valor })
  }
  return plano
}

/** Uma ocorrencia fica depois do fim da serie quando vence depois da data de fim. */
export function vencePosFim(vencimento: string, dataFim: string): boolean {
  return vencimento > dataFim
}

/**
 * Ultimo vencimento permitido ao excluir "esta e as proximas": o fim do mes anterior a competencia da
 * conta excluida (a conta excluida e as seguintes saem; as anteriores ficam).
 */
export function dataFimAoExcluirEstaEAsProximas(competencia: string): string {
  return ultimoDiaDaCompetencia(somarMeses(competencia, -1))
}

/**
 * Limite da lista de contas a pagar por padrao: ate o ultimo dia do MES SEGUINTE ao de hoje. As
 * ocorrencias materializadas alem disso so aparecem com "Mostrar contas futuras".
 */
export function limiteDaListaPadrao(hoje: string): string {
  return ultimoDiaDaCompetencia(somarMeses(competenciaDeData(hoje), 1))
}

const ROTULO_FREQUENCIA: Record<FrequenciaRecorrencia, string> = { MENSAL: 'Mensal', ANUAL: 'Anual' }

export function rotuloFrequencia(f: FrequenciaRecorrencia): string {
  return ROTULO_FREQUENCIA[f]
}

/** 'AAAA-MM' -> 'MM/AAAA' (para a tela). */
export function competenciaParaTexto(competencia: string): string {
  const [ano, mes] = partes(competencia)
  return `${pad2(mes)}/${ano}`
}

/** 'AAAA-MM-DD' que existe no calendario ('2026-02-30' nao existe). */
export function dataIsoValida(texto: string): boolean {
  const d = RE_DATA.exec(texto)
  if (!d) return false
  return Number(d[3]) <= diasNaCompetencia(`${d[1]}-${d[2]}`)
}
