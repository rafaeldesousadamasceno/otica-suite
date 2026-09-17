import { BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'node:fs'

/**
 * RF-12: gera um PDF a partir de HTML usando o proprio Chromium do
 * Electron (`printToPDF` de uma janela oculta) - dispensa instalar
 * Puppeteer inteiro (que baixaria um segundo Chromium) so pra isso, mesma
 * filosofia de "zero dependencia pesada" ja aplicada a node:sqlite/hash-wasm.
 *
 * A janela nunca aparece (`show: false`) e carrega o HTML via uma data URL
 * - nao precisa de servidor nem de arquivo temporario em disco. `sandbox`
 * fica desligado aqui de proposito: essa janela nunca roda o preload do
 * app nem expoe `window.api`, so renderiza HTML estatico gerado pelo
 * proprio processo main (nunca por texto vindo do renderer) para virar PDF -
 * nao ha superficie de ataque nova (PRD NF 8.3 e sobre o app de verdade,
 * nao sobre este renderer descartavel).
 */
async function renderizarPdf(html: string): Promise<Buffer> {
  const janela = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: false, offscreen: true }
  })

  try {
    await janela.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`)
    return await janela.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
    })
  } finally {
    janela.destroy()
  }
}

/**
 * Renderiza o HTML, pergunta onde salvar (RF-12: "visualização antes de
 * imprimir" fica pro visualizador de PDF do proprio sistema operacional
 * depois de salvo) e grava o arquivo. Devolve `null` se a pessoa cancelar
 * o dialogo - nunca um erro, cancelar nao e uma falha.
 */
export async function gerarESalvarPdf(html: string, nomeArquivoSugerido: string): Promise<{ caminho: string } | null> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Salvar relatório',
    defaultPath: nomeArquivoSugerido,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (canceled || !filePath) return null

  const pdf = await renderizarPdf(html)
  writeFileSync(filePath, pdf)
  return { caminho: filePath }
}
