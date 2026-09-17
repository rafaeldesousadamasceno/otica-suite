import { app, BrowserWindow, dialog, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { getDb, closeDb } from '@main/db/connection'
import { MigrationError } from '@main/db/migrator'
import { registerAllIpc } from '@main/ipc/registerIpc'
import { iniciarAgendadorBackup } from '@main/services/backupService'
// Icone do sistema (janela em dev, taskbar) - o instalador em si usa
// resources/icon.png via electron-builder.yml, empacotado a parte.
import icon from '../../resources/icon.png?asset'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' || process.platform === 'win32' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      // Endurecimento (PRD NF 8.3): o renderer nunca toca em Node nem em
      // SQL. Toda a superficie exposta a ele passa pelo preload, que so
      // repassa chamadas de IPC.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: is.dev
    }
  })

  win.on('ready-to-show', () => win.show())

  // Diagnostico temporario: qualquer falha ao carregar o preload ou erro
  // de console do renderer aparece aqui, no log do processo main.
  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[preload-error]', preloadPath, error)
  })
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}]`, message, `(${sourceId}:${line})`)
  })
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[did-fail-load]', errorCode, errorDescription)
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.oticasuite.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Abre a conexao e roda as migrations pendentes antes de qualquer janela
  // ou handler de IPC existir - garante que o schema esta pronto quando a
  // UI fizer a primeira chamada.
  //
  // RF-16, CA2: se a atualizacao de versao trouxe uma migration que falha,
  // o banco ja foi restaurado ao estado anterior dentro de getDb() - aqui
  // so falta avisar a pessoa (nao ha janela/React de pe ainda para isso) e
  // encerrar, em vez de deixar a excecao virar um crash silencioso.
  try {
    getDb()
  } catch (err) {
    const mensagem = err instanceof MigrationError ? err.message : `Erro inesperado ao abrir o banco de dados: ${(err as Error).message}`
    dialog.showErrorBox('Não foi possível iniciar o Ótica Suite', mensagem)
    app.quit()
    return
  }

  registerAllIpc()
  iniciarAgendadorBackup()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})
