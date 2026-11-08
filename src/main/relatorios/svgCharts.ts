import { PALETA_VIZ, arcoRosca, niceTicks, retanguloPontaArredondada, retanguloTopoArredondado } from '@shared/graficos'
import { escapeHtml } from './formatacao'

/**
 * Graficos dos relatorios em PDF: SVG puro gerado no main, sem JavaScript
 * (a janela que imprime nao roda script). Regras de traco iguais as dos
 * graficos da tela: barras finas com a ponta arredondada e a base reta,
 * 2 px de respiro entre barras, grade discreta, uma escala so. Cada grafico
 * vem acompanhado da tabela do proprio relatorio, que traz os numeros exatos.
 */

const TINTA = '#17242a'
const TINTA_2 = '#43585f'
const TINTA_3 = '#6e858c'
const GRADE = '#e3e9e9'
const BASE = '#b6c7c7'
const VAZIO = '<div class="grafico-vazio">Sem dados no período.</div>'

const n = (v: number): string => (Math.round(v * 10) / 10).toString()

function textoSvg(x: number, y: number, conteudo: string, attrs = ''): string {
  return `<text x="${n(x)}" y="${n(y)}" ${attrs}>${escapeHtml(conteudo)}</text>`
}

function encurtar(rotulo: string, max: number): string {
  return rotulo.length > max ? `${rotulo.slice(0, max - 1).trimEnd()}…` : rotulo
}

export interface ItemLegenda {
  nome: string
  cor: string
  /** Linha para series desenhadas como linha; quadrado para barras e fatias. */
  tipo?: 'marca' | 'linha'
}

export function legenda(itens: ItemLegenda[]): string {
  return `<div class="legenda">${itens
    .map((i) => {
      const marca =
        i.tipo === 'linha'
          ? `<span class="marca" style="height:2px;border-radius:1px;background:${i.cor}"></span>`
          : `<span class="marca" style="background:${i.cor}"></span>`
      return `<span class="item">${marca}${escapeHtml(i.nome)}</span>`
    })
    .join('')}</div>`
}

/** Marcas do eixo cobrindo de `min` (<= 0) ate `max` (>= 0), com passos redondos. */
function ticksComNegativos(min: number, max: number): number[] {
  if (min >= 0) return niceTicks(max)
  const passo = niceTicks(max - min)[1] ?? 1
  const ticks: number[] = []
  for (let v = Math.floor(min / passo) * passo; ; v += passo) {
    ticks.push(v)
    if (v >= max) break
  }
  return ticks
}

function grade(ticks: number[], y: (v: number) => number, x0: number, x1: number, formatar: (v: number) => string): string {
  return ticks
    .map((t) => {
      const yy = y(t)
      return `<line x1="${n(x0)}" x2="${n(x1)}" y1="${n(yy)}" y2="${n(yy)}" stroke="${t === 0 ? BASE : GRADE}" stroke-width="1" />${textoSvg(
        x0 - 6,
        yy + 3,
        formatar(t),
        `text-anchor="end" font-size="8" fill="${TINTA_3}"`
      )}`
    })
    .join('')
}

function rotulosEixoX(rotulos: string[], centro: (i: number) => number, y: number): string {
  // Muitos dias no periodo: mostra um rotulo a cada k para nao encavalar.
  const passo = Math.max(1, Math.ceil(rotulos.length / 16))
  return rotulos
    .map((r, i) => (i % passo === 0 ? textoSvg(centro(i), y, r, `text-anchor="middle" font-size="8" fill="${TINTA_3}"`) : ''))
    .join('')
}

export interface SerieColunas {
  nome: string
  cor: string
  valores: number[]
}

/** Colunas agrupadas (ex.: receitas x despesas por dia ou por mes). */
export function svgColunas(input: {
  categorias: string[]
  series: SerieColunas[]
  formatarEixo: (v: number) => string
  largura: number
  altura?: number
  descricao: string
}): string {
  const total = input.series.reduce((s, serie) => s + serie.valores.reduce((a, v) => a + Math.abs(v), 0), 0)
  if (!input.categorias.length || total === 0) return VAZIO

  const altura = input.altura ?? 170
  const esq = 58
  const dir = 6
  const topo = 8
  const baseY = altura - 20
  const ticks = niceTicks(Math.max(...input.series.flatMap((s) => s.valores)))
  const topoEscala = ticks[ticks.length - 1]
  const y = (v: number): number => baseY - (v / topoEscala) * (baseY - topo)

  const banda = (input.largura - esq - dir) / input.categorias.length
  const qtd = input.series.length
  const larguraBarra = Math.max(2, Math.min(18, (banda * 0.72 - 2 * (qtd - 1)) / qtd))
  const larguraGrupo = larguraBarra * qtd + 2 * (qtd - 1)

  const barras = input.categorias
    .map((_, i) => {
      const inicio = esq + banda * i + (banda - larguraGrupo) / 2
      return input.series
        .map((serie, s) => {
          const v = serie.valores[i] ?? 0
          if (v <= 0) return ''
          const x = inicio + s * (larguraBarra + 2)
          const yy = y(v)
          return `<path d="${retanguloTopoArredondado(x, yy, larguraBarra, baseY - yy, 4)}" fill="${serie.cor}" />`
        })
        .join('')
    })
    .join('')

  const svg = `<svg viewBox="0 0 ${input.largura} ${altura}" role="img" aria-label="${escapeHtml(input.descricao)}">
    ${grade(ticks, y, esq, input.largura - dir, input.formatarEixo)}
    ${barras}
    ${rotulosEixoX(input.categorias, (i) => esq + banda * i + banda / 2, altura - 6)}
  </svg>`

  return (qtd >= 2 ? legenda(input.series.map((s) => ({ nome: s.nome, cor: s.cor }))) : '') + svg
}

/** Linha de uma serie ao longo do tempo (ex.: saldo acumulado). Aceita valores negativos. */
export function svgLinha(input: {
  pontos: { rotulo: string; valor: number }[]
  cor: string
  formatarEixo: (v: number) => string
  formatarValor: (v: number) => string
  largura: number
  altura?: number
  descricao: string
}): string {
  if (!input.pontos.length) return VAZIO

  const altura = input.altura ?? 160
  const esq = 58
  const dir = 70 // espaco para o rotulo do ultimo valor
  const topo = 10
  const baseY = altura - 20
  const valores = input.pontos.map((p) => p.valor)
  const ticks = ticksComNegativos(Math.min(0, ...valores), Math.max(0, ...valores))
  const minimo = ticks[0]
  const maximo = ticks[ticks.length - 1] === minimo ? minimo + 1 : ticks[ticks.length - 1]
  const y = (v: number): number => baseY - ((v - minimo) / (maximo - minimo)) * (baseY - topo)
  const passoX = input.pontos.length > 1 ? (input.largura - esq - dir) / (input.pontos.length - 1) : 0
  const x = (i: number): number => esq + passoX * i

  const caminho = input.pontos.map((p, i) => `${i === 0 ? 'M' : 'L'}${n(x(i))},${n(y(p.valor))}`).join(' ')
  const ultimo = input.pontos[input.pontos.length - 1]
  const xu = x(input.pontos.length - 1)
  const yu = y(ultimo.valor)

  return `<svg viewBox="0 0 ${input.largura} ${altura}" role="img" aria-label="${escapeHtml(input.descricao)}">
    ${grade(ticks, y, esq, input.largura - dir, input.formatarEixo)}
    <path d="${caminho}" fill="none" stroke="${input.cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    <circle cx="${n(xu)}" cy="${n(yu)}" r="4" fill="${input.cor}" stroke="#fff" stroke-width="2" />
    ${textoSvg(xu + 8, yu + 3, input.formatarValor(ultimo.valor), `font-size="8.5" font-weight="700" fill="${TINTA}"`)}
    ${rotulosEixoX(
      input.pontos.map((p) => p.rotulo),
      x,
      altura - 6
    )}
  </svg>`
}

/** Barras horizontais com o valor na ponta (rankings, poucos itens). */
export function svgBarrasH(input: {
  itens: { rotulo: string; valor: number; cor?: string }[]
  formatarValor: (v: number) => string
  largura: number
  descricao: string
}): string {
  const itens = input.itens.filter((i) => i.valor > 0)
  if (!itens.length) return VAZIO

  const linha = 22
  const larguraRotulo = Math.min(190, input.largura * 0.3)
  const espacoValor = 78
  const altura = itens.length * linha
  const maximo = Math.max(...itens.map((i) => i.valor))
  const escala = (input.largura - larguraRotulo - espacoValor) / maximo

  const barras = itens
    .map((item, i) => {
      const yy = i * linha
      const comprimento = Math.max(2, item.valor * escala)
      return `${textoSvg(0, yy + 14, encurtar(item.rotulo, 30), `font-size="9" fill="${TINTA_2}"`)}
      <path d="${retanguloPontaArredondada(larguraRotulo, yy + 5, comprimento, 12, 4)}" fill="${item.cor ?? PALETA_VIZ.categorica[0]}" />
      ${textoSvg(larguraRotulo + comprimento + 6, yy + 14.5, input.formatarValor(item.valor), `font-size="9" font-weight="600" fill="${TINTA}"`)}`
    })
    .join('')

  return `<svg viewBox="0 0 ${input.largura} ${altura}" role="img" aria-label="${escapeHtml(input.descricao)}">${barras}</svg>`
}

export type ClasseAbc = 'A' | 'B' | 'C'

/** Cor por classe da curva ABC: A (mais importante) no tom mais escuro da rampa. */
export const COR_CLASSE_ABC: Record<ClasseAbc, string> = {
  A: PALETA_VIZ.ordinal[2],
  B: PALETA_VIZ.ordinal[1],
  C: PALETA_VIZ.ordinal[0]
}

/**
 * Pareto da curva ABC: cada barra e a participacao do produto na receita e a
 * linha e o acumulado. Os dois sao percentuais, entao a escala e uma so (0 a
 * 100%). Linhas de referencia em 80% (fim da classe A) e 95% (fim da B).
 */
export function svgPareto(input: {
  itens: { rotulo: string; participacao: number; acumulado: number; classe: ClasseAbc }[]
  largura: number
  altura?: number
  descricao: string
}): string {
  if (!input.itens.length) return VAZIO

  const altura = input.altura ?? 180
  const esq = 36
  const dir = 30
  const topo = 8
  const baseY = altura - 20
  const y = (pct: number): number => baseY - (pct / 100) * (baseY - topo)
  const banda = (input.largura - esq - dir) / input.itens.length
  const larguraBarra = Math.max(3, Math.min(22, banda - 2))
  const centro = (i: number): number => esq + banda * i + banda / 2

  const referencia = [80, 95]
    .map(
      (pct) =>
        `<line x1="${esq}" x2="${input.largura - dir}" y1="${n(y(pct))}" y2="${n(y(pct))}" stroke="${TINTA_3}" stroke-width="1" stroke-dasharray="3 3" />${textoSvg(
          input.largura - dir + 4,
          y(pct) + 3,
          `${pct}%`,
          `font-size="8" fill="${TINTA_3}"`
        )}`
    )
    .join('')

  const barras = input.itens
    .map((item, i) => {
      const yy = y(item.participacao)
      return `<path d="${retanguloTopoArredondado(centro(i) - larguraBarra / 2, yy, larguraBarra, baseY - yy, 4)}" fill="${COR_CLASSE_ABC[item.classe]}" />`
    })
    .join('')

  const caminho = input.itens.map((item, i) => `${i === 0 ? 'M' : 'L'}${n(centro(i))},${n(y(item.acumulado))}`).join(' ')
  const pontos = input.itens
    .map((item, i) => `<circle cx="${n(centro(i))}" cy="${n(y(item.acumulado))}" r="2.5" fill="${TINTA}" stroke="#fff" stroke-width="1.5" />`)
    .join('')

  const svg = `<svg viewBox="0 0 ${input.largura} ${altura}" role="img" aria-label="${escapeHtml(input.descricao)}">
    ${grade([0, 25, 50, 75, 100], y, esq, input.largura - dir, (v) => `${v}%`)}
    ${referencia}
    ${barras}
    <path d="${caminho}" fill="none" stroke="${TINTA}" stroke-width="2" stroke-linejoin="round" />
    ${pontos}
    ${rotulosEixoX(
      input.itens.map((item) => item.rotulo),
      centro,
      altura - 6
    )}
  </svg>`

  return (
    legenda([
      { nome: 'Classe A', cor: COR_CLASSE_ABC.A },
      { nome: 'Classe B', cor: COR_CLASSE_ABC.B },
      { nome: 'Classe C', cor: COR_CLASSE_ABC.C },
      { nome: 'Receita acumulada', cor: TINTA, tipo: 'linha' }
    ]) + svg
  )
}

/**
 * Rosca de participacao, com a lista ao lado (cor, nome, valor e %). Fatias
 * separadas por 2 px de respiro; o total vai no centro.
 */
export function svgRosca(input: {
  fatias: { rotulo: string; valor: number; cor: string }[]
  formatarValor: (v: number) => string
  centro: { valor: string; rotulo: string }
  descricao: string
}): string {
  const fatias = input.fatias.filter((f) => f.valor > 0)
  const total = fatias.reduce((s, f) => s + f.valor, 0)
  if (!fatias.length || total <= 0) return VAZIO

  const cx = 75
  const cy = 75
  let angulo = 0
  const caminhos = fatias
    .map((f) => {
      const a0 = angulo
      angulo += (f.valor / total) * Math.PI * 2
      return `<path d="${arcoRosca(cx, cy, 72, 46, a0, angulo)}" fill="${f.cor}" stroke="#fff" stroke-width="2" stroke-linejoin="round" />`
    })
    .join('')

  const lista = fatias
    .map((f) => {
      const pct = ((f.valor / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
      return `<tr>
        <td><span class="marca" style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;background:${f.cor}"></span>${escapeHtml(f.rotulo)}</td>
        <td class="num">${escapeHtml(input.formatarValor(f.valor))}</td>
        <td class="num">${pct}%</td>
      </tr>`
    })
    .join('')

  return `<div class="rosca">
    <svg viewBox="0 0 150 150" role="img" aria-label="${escapeHtml(input.descricao)}">
      ${caminhos}
      ${textoSvg(cx, cy + 1, input.centro.valor, `text-anchor="middle" font-size="12" font-weight="700" fill="${TINTA}"`)}
      ${textoSvg(cx, cy + 14, input.centro.rotulo, `text-anchor="middle" font-size="7.5" fill="${TINTA_3}"`)}
    </svg>
    <table class="lista">${lista}</table>
  </div>`
}
