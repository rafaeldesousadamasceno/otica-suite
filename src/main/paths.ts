import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'

/**
 * Local dos dados da aplicacao.
 *
 * O PRD (secao 9.5) sugere `%PROGRAMDATA%\<NomeOtica>\`. Optamos por
 * `app.getPath('userData')` (equivalente a `%APPDATA%\otica-suite`) porque:
 *   - nao exige elevacao de administrador para gravar;
 *   - nao depende do nome da otica, que so existe DEPOIS do wizard (RF-02);
 *   - e o local padrao que o Windows já isola por usuario.
 *
 * Se no futuro for necessario um caminho compartilhado entre usuarios da
 * mesma maquina (ex.: multi-terminal local), troque so este arquivo.
 */
function ensureDir(path: string): string {
  if (!existsSync(path)) mkdirSync(path, { recursive: true })
  return path
}

export const paths = {
  root: () => ensureDir(app.getPath('userData')),
  database: () => join(paths.root(), 'dados.db'),
  backups: () => ensureDir(join(paths.root(), 'backups')),
  logs: () => ensureDir(join(paths.root(), 'logs')),
  logoAtual: (ext: string) => join(paths.root(), `logo.${ext}`),
  /** RF-13.4: arquivo com a chave de licenca ativada (PRD secao 9.5). */
  licenca: () => join(paths.root(), 'license.dat')
}
