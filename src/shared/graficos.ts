/**
 * Utilitarios de grafico usados tanto pelos graficos da tela (React/SVG) quanto
 * pelos graficos dos relatorios em PDF (SVG gerado no main).
 */

/**
 * Paleta fixa dos graficos (tema claro), na ordem validada para daltonismo.
 * Os mesmos valores estao em `--viz-*` no `index.css` do renderer; um teste
 * confere que os dois lugares nao se desencontram.
 */
export const PALETA_VIZ = {
  /** Categoricas, sempre nesta ordem: azul, laranja, verde-agua, amarelo. */
  categorica: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'],
  /** "Outros" e o que nao tem identidade propria: neutro. */
  outros: '#8a9a9e',
  /** Rampa ordinal (etapas em ordem, ex.: OS aberta -> laboratorio -> chegou). */
  ordinal: ['#86b6ef', '#3987e5', '#1c5cab']
} as const

/** Marcas "redondas" do eixo (0, 1, 2, 5 x 10^k), de 0 ate um valor >= `max`. */
export function niceTicks(max: number, alvo = 4): number[] {
  if (max <= 0) return [0, 1]
  const bruto = max / alvo
  const magnitude = 10 ** Math.floor(Math.log10(bruto))
  const norm = bruto / magnitude
  const passo = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * magnitude

  const ticks: number[] = []
  for (let i = 0; ; i++) {
    const v = i * passo
    ticks.push(v)
    if (v >= max) break
  }
  return ticks
}

/** Centavos -> "R$ 1,5 mil" (eixos e legendas curtas; o valor exato fica no tooltip e na tabela). */
export function formatarBRLCompacto(centavos: number): string {
  const reais = centavos / 100
  return `R$ ${reais.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })}`
}

/** Retangulo com so os cantos de cima arredondados: a base fica reta, ancorada na linha de base. */
export function retanguloTopoArredondado(x: number, y: number, largura: number, altura: number, raio: number): string {
  const r = Math.min(raio, largura / 2, altura)
  return [
    `M${x},${y + altura}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + largura - r}`,
    `Q${x + largura},${y} ${x + largura},${y + r}`,
    `V${y + altura}`,
    'Z'
  ].join(' ')
}

/** Retangulo horizontal com so os cantos da ponta direita arredondados (barra que cresce a partir da esquerda). */
export function retanguloPontaArredondada(x: number, y: number, largura: number, altura: number, raio: number): string {
  const r = Math.min(raio, altura / 2, largura)
  return [
    `M${x},${y}`,
    `H${x + largura - r}`,
    `Q${x + largura},${y} ${x + largura},${y + r}`,
    `V${y + altura - r}`,
    `Q${x + largura},${y + altura} ${x + largura - r},${y + altura}`,
    `H${x}`,
    'Z'
  ].join(' ')
}

function ponto(cx: number, cy: number, r: number, angulo: number): [number, number] {
  // Angulo 0 = meio-dia, crescendo no sentido horario.
  return [cx + r * Math.sin(angulo), cy - r * Math.cos(angulo)]
}

const f = (n: number): string => (Math.round(n * 100) / 100).toString()

/**
 * Fatia de rosca entre os angulos `a0` e `a1` (radianos, 0 = meio-dia,
 * sentido horario). Uma fatia de volta inteira vira dois arcos, porque um
 * arco SVG com inicio igual ao fim nao desenha nada.
 */
export function arcoRosca(cx: number, cy: number, rExterno: number, rInterno: number, a0: number, a1: number): string {
  const volta = Math.PI * 2
  if (a1 - a0 >= volta - 1e-6) {
    const meio = a0 + Math.PI
    return `${arcoRosca(cx, cy, rExterno, rInterno, a0, meio)} ${arcoRosca(cx, cy, rExterno, rInterno, meio, a0 + volta)}`
  }
  const grande = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = ponto(cx, cy, rExterno, a0)
  const [x1, y1] = ponto(cx, cy, rExterno, a1)
  const [x2, y2] = ponto(cx, cy, rInterno, a1)
  const [x3, y3] = ponto(cx, cy, rInterno, a0)
  return [
    `M${f(x0)},${f(y0)}`,
    `A${f(rExterno)},${f(rExterno)} 0 ${grande} 1 ${f(x1)},${f(y1)}`,
    `L${f(x2)},${f(y2)}`,
    `A${f(rInterno)},${f(rInterno)} 0 ${grande} 0 ${f(x3)},${f(y3)}`,
    'Z'
  ].join(' ')
}
