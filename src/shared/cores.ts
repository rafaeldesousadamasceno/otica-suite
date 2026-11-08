/**
 * Tons derivados da cor de destaque de cada otica (`empresa.corDestaque`),
 * usados nos relatorios em PDF. A otica escolhe qualquer cor; daqui saem
 * versoes que sempre ficam legiveis: texto sobre a cor, um tom forte para
 * titulo sobre branco e tons claros para fundos.
 */

export const COR_DESTAQUE_PADRAO = '#0D6A70'

interface Rgb {
  r: number
  g: number
  b: number
}

function hexParaRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
}

function rgbParaHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`
}

/** Luminancia relativa (WCAG 2). */
function luminancia(cor: Rgb): number {
  const canal = (v: number): number => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(cor.r) + 0.7152 * canal(cor.g) + 0.0722 * canal(cor.b)
}

/** Razao de contraste WCAG entre duas cores (1 a 21). Hex invalido conta como preto. */
export function contraste(a: string, b: string): number {
  const la = luminancia(hexParaRgb(a) ?? { r: 0, g: 0, b: 0 })
  const lb = luminancia(hexParaRgb(b) ?? { r: 0, g: 0, b: 0 })
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Mistura `cor` com `alvo`: t = 0 devolve a cor, t = 1 devolve o alvo. */
export function misturar(cor: string, alvo: string, t: number): string {
  const a = hexParaRgb(cor) ?? { r: 0, g: 0, b: 0 }
  const b = hexParaRgb(alvo) ?? { r: 0, g: 0, b: 0 }
  return rgbParaHex({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t })
}

export interface TonsDestaque {
  /** A cor escolhida pela otica (ou a padrao, se a configurada for invalida). */
  base: string
  /** Texto sobre `base`: branco ou quase preto, o que tiver mais contraste. */
  tinta: string
  /** `base` escurecida ate ter contraste de texto (4,5:1) sobre branco - titulos. */
  forte: string
  /** Fundo claro (chips, cards de destaque). */
  suave: string
  /** Bordas e linhas de apoio. */
  borda: string
  /** Linhas alternadas de tabela. */
  zebra: string
}

export function derivarTonsDestaque(cor: string | null | undefined): TonsDestaque {
  const valida = cor ? hexParaRgb(cor) : null
  const base = rgbParaHex(valida ?? hexParaRgb(COR_DESTAQUE_PADRAO)!)

  const tinta = contraste(base, '#ffffff') >= contraste(base, '#111111') ? '#ffffff' : '#111111'

  let forte = base
  for (let i = 0; i < 20 && contraste(forte, '#ffffff') < 4.5; i++) forte = misturar(forte, '#000000', 0.12)

  return {
    base,
    tinta,
    forte,
    suave: misturar(base, '#ffffff', 0.88),
    borda: misturar(base, '#ffffff', 0.7),
    zebra: misturar(base, '#ffffff', 0.95)
  }
}
