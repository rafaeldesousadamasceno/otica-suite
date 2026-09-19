import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

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

/** Mede a largura do elemento e acompanha redimensionamento da janela. */
export function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [largura, setLargura] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setLargura(el.clientWidth)
    const observer = new ResizeObserver((entries) => setLargura(entries[0].contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, largura]
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
