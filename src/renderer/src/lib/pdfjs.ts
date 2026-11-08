import type * as PdfJs from 'pdfjs-dist'

let carregando: Promise<typeof PdfJs> | null = null

/**
 * O pdf.js so e baixado para a memoria na primeira vez que um PDF abre: quem
 * nunca gera relatorio nao paga o custo. O worker vem empacotado pelo Vite
 * como arquivo proprio (`?url`), carregado do mesmo lugar que o app.
 */
export function carregarPdfjs(): Promise<typeof PdfJs> {
  carregando ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(
    ([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      return pdfjs
    }
  )
  return carregando
}
