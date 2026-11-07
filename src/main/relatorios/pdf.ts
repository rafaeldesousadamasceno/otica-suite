import { app, BrowserWindow, dialog } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { requireSessao } from '@main/auth/session'
import { Errors } from '@main/errors'
import type { PdfVisualizacao } from '@shared/types'
import { criarCachePdf, emPaisagem, tituloDoHtml, type PdfGerado } from './pdfCache'

/**
 * RF-12: gera um PDF a partir de HTML usando o proprio Chromium do
 * Electron (`printToPDF` de uma janela oculta) - dispensa instalar
 * Puppeteer inteiro (que baixaria um segundo Chromium) so pra isso, mesma
 * filosofia de "zero dependencia pesada" ja aplicada a node:sqlite/hash-wasm.
 *
 * Fluxo: gerar -> o PDF abre no visualizador do proprio sistema -> dali a
 * pessoa salva ou imprime. Nada e gravado em disco antes de ela pedir.
 */
const cache = criarCachePdf()

/**
 * Carrega o HTML numa janela oculta e entrega a janela pronta. O HTML vai
 * por um arquivo temporario (e nao por data: URL, que estoura com logo grande
 * mais tabela longa) e o arquivo e apagado assim que a pagina carrega - dado
 * de cliente nao fica no disco. A janela nao roda JavaScript: o HTML e
 * estatico e gerado pelo proprio main.
 */
async function comHtmlCarregado<T>(html: string, usar: (janela: BrowserWindow) => Promise<T>): Promise<T> {
  const pasta = join(app.getPath('temp'), 'optialeph-pdf')
  mkdirSync(pasta, { recursive: true })
  const arquivo = join(pasta, `${randomUUID()}.html`)
  writeFileSync(arquivo, html, 'utf8')

  const janela = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
  try {
    await janela.loadFile(arquivo)
    rmSync(arquivo, { force: true })
    return await usar(janela)
  } finally {
    rmSync(arquivo, { force: true })
    if (!janela.isDestroyed()) janela.destroy()
  }
}

/**
 * `preferCSSPageSize` + margens zero: quem manda no tamanho, na orientacao e
 * nas margens e o `@page` de cada relatorio (antes as margens do printToPDF
 * se somavam as do CSS e a paisagem saia em retrato).
 */
async function renderizarPdf(html: string): Promise<Buffer> {
  return comHtmlCarregado(html, (janela) =>
    janela.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    })
  )
}

/** Gera o PDF e guarda para salvar/imprimir; devolve os bytes para o visualizador. */
export async function gerarPdfVisualizacao(html: string, nomeArquivo: string, titulo?: string): Promise<PdfVisualizacao> {
  const sessao = requireSessao()
  const pdf = new Uint8Array(await renderizarPdf(html))
  const id = randomUUID()
  const tituloFinal = titulo ?? tituloDoHtml(html) ?? nomeArquivo.replace(/\.pdf$/i, '')

  cache.guardar(id, { html, pdf, nomeArquivo, titulo: tituloFinal, usuarioId: sessao.usuario.id, criadoEm: Date.now() })
  return { id, nomeArquivo, titulo: tituloFinal, bytes: pdf }
}

function obterDoUsuario(id: string): PdfGerado {
  const sessao = requireSessao()
  const item = cache.obter(id, sessao.usuario.id)
  if (!item) throw Errors.validacao('Este PDF não está mais disponível. Feche e gere de novo.')
  return item
}

/** "Salvar" do visualizador: pergunta onde e grava. `null` se a pessoa cancelar. */
export async function salvarPdf(id: string): Promise<{ caminho: string } | null> {
  const item = obterDoUsuario(id)
  const opcoes = {
    title: 'Salvar PDF',
    defaultPath: join(app.getPath('documents'), item.nomeArquivo),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  }
  const janela = BrowserWindow.getFocusedWindow()
  const { canceled, filePath } = janela ? await dialog.showSaveDialog(janela, opcoes) : await dialog.showSaveDialog(opcoes)
  if (canceled || !filePath) return null

  writeFileSync(filePath, item.pdf)
  return { caminho: filePath }
}

/**
 * "Imprimir" do visualizador: abre o dialogo de impressao do Windows (com a
 * escolha da impressora) sobre o mesmo HTML que gerou o PDF. Cancelar o
 * dialogo nao e erro: devolve `impresso: false`.
 */
export async function imprimirPdf(id: string): Promise<{ impresso: boolean }> {
  const item = obterDoUsuario(id)
  return comHtmlCarregado(
    item.html,
    (janela) =>
      new Promise((resolve, reject) => {
        janela.webContents.print(
          { silent: false, printBackground: true, landscape: emPaisagem(item.html) },
          (sucesso, motivo) => {
            if (sucesso) resolve({ impresso: true })
            else if (!motivo || /cancel/i.test(motivo)) resolve({ impresso: false })
            else reject(Errors.validacao(`Não foi possível imprimir: ${motivo}`))
          }
        )
      })
  )
}

/** O visualizador fechou: libera a memoria. */
export function descartarPdf(id: string): void {
  const sessao = requireSessao()
  cache.descartar(id, sessao.usuario.id)
}

/** Logout: nenhum PDF de uma sessao fica para a proxima. */
export function limparPdfs(): void {
  cache.limpar()
}
