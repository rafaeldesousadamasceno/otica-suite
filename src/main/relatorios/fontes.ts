import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff2?inline'
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff2?inline'
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff2?inline'

/** Inter (licenca OFL, a mesma fonte do app) para os relatorios em PDF. */
const FONTES_CSS = [
  [400, inter400],
  [600, inter600],
  [700, inter700]
]
  .map(
    ([peso, url]) =>
      `@font-face{font-family:'Inter';font-style:normal;font-display:block;font-weight:${peso};src:url(${url}) format('woff2');}`
  )
  .join('')

/** Injeta a fonte no `<head>`: os montadores de relatorio continuam produzindo HTML puro e leve. */
export function comFontes(html: string): string {
  return html.includes('</head>') ? html.replace('</head>', `<style>${FONTES_CSS}</style></head>`) : html
}
