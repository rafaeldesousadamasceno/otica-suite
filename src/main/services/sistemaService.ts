import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SistemaInfo } from '@shared/types'

/**
 * RF-16: versao e notas de versao, para a tela "Sobre / Licenca".
 *
 * `CHANGELOG.md` e empacotado na raiz do app (mesmo esquema de
 * `resources/icon.png` - listado em `electron-builder.yml` e lido por
 * caminho relativo a partir de `out/main/`, funciona igual em dev e no
 * instalador).
 */
export const sistemaService = {
  obterInfo(): SistemaInfo {
    let notas = ''
    try {
      notas = readFileSync(join(__dirname, '../../CHANGELOG.md'), 'utf8')
    } catch {
      notas = 'Notas de versão indisponíveis.'
    }

    return {
      versao: app.getVersion(),
      notas
    }
  }
}
