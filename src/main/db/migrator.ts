import { DatabaseSync } from 'node:sqlite'
import { existsSync, unlinkSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from '@main/paths'
import { MIGRATIONS } from './migrations'

/**
 * RF-16, CA2: erro dedicado para uma falha de migracao que JA foi
 * restaurada - carrega o caminho do backup preservado para a tela de erro
 * poder informar o usuario com precisao, em vez de um erro generico.
 */
export class MigrationError extends Error {
  constructor(
    message: string,
    readonly backupRestaurado: string
  ) {
    super(message)
    this.name = 'MigrationError'
  }
}

function nomeBackupPreMigracao(): string {
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '')
  return `pre-migracao-${timestamp}.db`
}

/**
 * Runner de migrations minimalista e idempotente.
 *
 * Cada migration roda no maximo uma vez, dentro de uma transacao: se o SQL
 * falhar no meio, o ROLLBACK desfaz tudo e a versao nao fica marcada como
 * aplicada - a proxima abertura do app tenta de novo. Sem dependencia
 * externa (drizzle-kit/umzug): o volume de migrations de um produto deste
 * porte nao justifica a dependencia extra.
 *
 * RF-16 (atualizacao do app), CA1/CA2: quando a instalacao JA tinha
 * migrations aplicadas (ou seja, isto e uma atualizacao de versao, nao a
 * primeira execucao) e existe alguma migration nova pendente, um backup
 * completo e tirado ANTES de aplicar qualquer uma delas. Se qualquer
 * migration da leva falhar, o banco inteiro volta a esse snapshot - nunca
 * fica num estado parcialmente atualizado. `caminhoDb` (o arquivo vivo) e
 * passado a parte de `db` (a conexao aberta) porque a restauracao precisa
 * fechar a conexao e sobrescrever o arquivo por baixo dela.
 */
export function runMigrations(db: DatabaseSync, caminhoDb: string): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const applied = new Set(
    db
      .prepare('SELECT version FROM _migrations')
      .all()
      .map((row) => Number((row as { version: number }).version))
  )

  const ehAtualizacao = applied.size > 0
  const pendentes = MIGRATIONS.filter((m) => !applied.has(m.version))
  if (pendentes.length === 0) return

  const caminhoBackup = ehAtualizacao ? join(paths.backups(), nomeBackupPreMigracao()) : null
  if (caminhoBackup) {
    db.exec(`VACUUM INTO '${caminhoBackup.replace(/'/g, "''")}'`)
  }

  try {
    for (const migration of pendentes) {
      db.exec('BEGIN IMMEDIATE')
      try {
        db.exec(migration.sql)
        db.prepare('INSERT INTO _migrations (version, name) VALUES (:version, :name)').run({
          version: migration.version,
          name: migration.name
        })
        db.exec('COMMIT')
        console.log(`[db] migration ${migration.version} (${migration.name}) aplicada`)
      } catch (err) {
        db.exec('ROLLBACK')
        throw new Error(`Falha ao aplicar a migration ${migration.version} (${migration.name}): ${(err as Error).message}`)
      }
    }
  } catch (err) {
    if (!caminhoBackup) throw err

    // RF-16 CA2: restaura o snapshot tirado antes desta leva de migrations -
    // fecha a conexao, sobrescreve o arquivo vivo e limpa o WAL/SHM velhos.
    db.close()
    copyFileSync(caminhoBackup, caminhoDb)
    for (const sufixo of ['-wal', '-shm']) {
      const sidecar = `${caminhoDb}${sufixo}`
      if (existsSync(sidecar)) unlinkSync(sidecar)
    }

    throw new MigrationError(
      `A atualização do banco de dados falhou (${(err as Error).message}). O sistema foi restaurado ` +
        `automaticamente para o estado anterior à atualização - nenhum dado foi perdido. ` +
        `Um backup desse estado foi mantido em: ${caminhoBackup}`,
      caminhoBackup
    )
  }
}
