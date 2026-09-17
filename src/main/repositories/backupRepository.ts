import { DatabaseSync } from 'node:sqlite'
import { existsSync, readdirSync, statSync, unlinkSync, copyFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { getDb, closeDb } from '@main/db/connection'
import { paths } from '@main/paths'
import type { BackupInfo } from '@shared/types'

const PREFIXO = 'backup-'
const SUFIXO = '.db'

/** Nome de arquivo seguro para sistema de arquivos: sem `:` nem fracao de segundo. */
function nomeArquivoBackup(): string {
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '')
  return `${PREFIXO}${timestamp}${SUFIXO}`
}

/**
 * Confere a integridade de um arquivo `.db` isolado, sem tocar na conexao
 * principal - abre um `DatabaseSync` proprio, so leitura, e fecha em seguida.
 */
function verificarIntegridade(caminho: string): boolean {
  let temp: DatabaseSync | null = null
  try {
    temp = new DatabaseSync(caminho, { readOnly: true })
    const resultado = temp.prepare('PRAGMA integrity_check').get() as
      | { integrity_check: string }
      | undefined
    return resultado?.integrity_check === 'ok'
  } catch {
    return false
  } finally {
    temp?.close()
  }
}

/**
 * RF-13.1/13.2: gera um snapshot consistente do banco vivo via `VACUUM INTO`
 * e confirma que o arquivo gerado abre e passa em `PRAGMA integrity_check`.
 *
 * `VACUUM INTO` exige o caminho como literal SQL (nao aceita `:param` para
 * isso) - o caminho e sempre construido aqui mesmo (pasta de backups +
 * timestamp gerado agora), nunca vem de entrada do usuario, mas ainda assim
 * escapamos aspas simples dobrando-as (regra padrao de string literal SQL)
 * para o caminho no Windows nunca quebrar a sintaxe do VACUUM INTO.
 */
export function criarArquivoBackup(): { arquivo: string; tamanhoBytes: number; integro: boolean } {
  const caminho = join(paths.backups(), nomeArquivoBackup())
  const caminhoEscapado = caminho.replace(/'/g, "''")

  getDb().exec(`VACUUM INTO '${caminhoEscapado}'`)

  const integro = verificarIntegridade(caminho)
  const tamanhoBytes = statSync(caminho).size

  return { arquivo: caminho, tamanhoBytes, integro }
}

/** RF-13.3, CA1: lista os backups existentes com tamanho, data e integridade de cada um. */
export function listarBackups(): BackupInfo[] {
  const dir = paths.backups()
  const arquivos = readdirSync(dir).filter((nome) => nome.startsWith(PREFIXO) && nome.endsWith(SUFIXO))

  const infos: BackupInfo[] = arquivos.map((nome) => {
    const caminho = join(dir, nome)
    const stat = statSync(caminho)
    return {
      arquivo: caminho,
      tamanhoBytes: stat.size,
      criadoEm: stat.birthtime.toISOString(),
      integro: verificarIntegridade(caminho)
    }
  })

  infos.sort((a, b) => Date.parse(b.criadoEm) - Date.parse(a.criadoEm))
  return infos
}

/**
 * RF-13.1: retencao simples - mantem um arquivo se ele ainda esta dentro do
 * prazo de dias OU ainda esta entre os `maxArquivos` mais recentes; so
 * remove quando AMBAS as condicoes dizem para remover.
 */
export function aplicarRetencao(diasRetencao: number, maxArquivos: number): void {
  const backups = listarBackups() // ja vem ordenado do mais novo pro mais velho
  const limiteMs = diasRetencao * 24 * 60 * 60 * 1000
  const agora = Date.now()

  backups.forEach((backup, indice) => {
    const idade = agora - Date.parse(backup.criadoEm)
    const dentroDoPrazo = idade <= limiteMs
    const dentroDoLimiteDeArquivos = indice < maxArquivos
    if (dentroDoPrazo || dentroDoLimiteDeArquivos) return

    try {
      unlinkSync(backup.arquivo)
    } catch (err) {
      console.error('[backup] falha ao aplicar retencao em', backup.arquivo, err)
    }
  })
}

/**
 * RF-13.3: restaura o banco vivo a partir de um arquivo de backup.
 *
 * Nunca confia no caminho recebido alem de exigir que ele esteja DENTRO da
 * pasta de backups (o schema Zod so garante uma string nao vazia - a
 * checagem de path traversal e daqui).
 */
export function restaurar(caminhoArquivoBackup: string): void {
  const dirBackups = resolve(paths.backups())
  const caminhoAbsoluto = resolve(caminhoArquivoBackup)

  if (!caminhoAbsoluto.startsWith(dirBackups + sep)) {
    throw new Error('Arquivo de backup inválido: fora da pasta de backups.')
  }
  if (!existsSync(caminhoAbsoluto)) {
    throw new Error('Arquivo de backup não encontrado.')
  }

  closeDb()

  const destino = paths.database()
  copyFileSync(caminhoAbsoluto, destino)

  for (const sufixo of ['-wal', '-shm']) {
    const sidecar = `${destino}${sufixo}`
    if (existsSync(sidecar)) unlinkSync(sidecar)
  }

  // Reabre e roda migrations pendentes (idempotente) contra o banco restaurado.
  getDb()
}
