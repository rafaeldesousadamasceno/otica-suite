/**
 * Guarda por pouco tempo os PDFs gerados para o visualizador: o renderer
 * recebe so os bytes para mostrar, e "Salvar" / "Imprimir" voltam ao main
 * pelo id. O HTML fica junto porque a impressao usa o HTML original (sai
 * igual ao PDF, com a mesma regra de `@page`).
 *
 * Sem `electron` aqui de proposito: o modulo e puro e testavel.
 */

export interface PdfGerado {
  html: string
  pdf: Uint8Array
  nomeArquivo: string
  titulo: string
  /** So quem gerou consegue salvar/imprimir/descartar. */
  usuarioId: number
  criadoEm: number
}

/** Tempo que o PDF fica disponivel para salvar/imprimir depois de gerado. */
export const PDF_VALIDADE_MS = 10 * 60 * 1000
/** Mais que isso e memoria a toa: um PDF fica aberto por vez no visualizador. */
export const PDF_MAXIMO_EM_MEMORIA = 4

export interface CachePdf {
  guardar(id: string, item: PdfGerado): void
  obter(id: string, usuarioId: number): PdfGerado | null
  descartar(id: string, usuarioId: number): void
  limpar(): void
  readonly tamanho: number
}

export function criarCachePdf(agora: () => number = Date.now): CachePdf {
  const itens = new Map<string, PdfGerado>()

  function removerVencidos(): void {
    const limite = agora() - PDF_VALIDADE_MS
    for (const [id, item] of itens) {
      if (item.criadoEm < limite) itens.delete(id)
    }
  }

  return {
    guardar(id, item) {
      removerVencidos()
      itens.set(id, item)
      // Map guarda a ordem de insercao: o primeiro e sempre o mais antigo.
      while (itens.size > PDF_MAXIMO_EM_MEMORIA) {
        const maisAntigo = itens.keys().next().value
        if (maisAntigo === undefined) break
        itens.delete(maisAntigo)
      }
    },
    obter(id, usuarioId) {
      removerVencidos()
      const item = itens.get(id)
      return item && item.usuarioId === usuarioId ? item : null
    },
    descartar(id, usuarioId) {
      const item = itens.get(id)
      if (item && item.usuarioId === usuarioId) itens.delete(id)
    },
    limpar() {
      itens.clear()
    },
    get tamanho() {
      return itens.size
    }
  }
}

const ENTIDADES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }

/** Titulo do documento a partir do `<title>` do HTML do relatorio. */
export function tituloDoHtml(html: string): string | null {
  const m = /<title>([^<]*)<\/title>/i.exec(html)
  const titulo = m?.[1].replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTIDADES[e]).trim()
  return titulo ? titulo : null
}

/** Relatorio em paisagem declara `@page { size: A4 landscape }` no proprio HTML. */
export function emPaisagem(html: string): boolean {
  return /size:\s*A4\s+landscape/i.test(html)
}
