import type { DatabaseSync } from 'node:sqlite'
import { MIGRATIONS } from './migrations'

/**
 * Runner de migrations minimalista e idempotente.
 *
 * Cada migration roda no maximo uma vez, dentro de uma transacao: se o SQL
 * falhar no meio, o ROLLBACK desfaz tudo e a versao nao fica marcada como
 * aplicada - a proxima abertura do app tenta de novo. Sem dependencia
 * externa (drizzle-kit/umzug): o volume de migrations de um produto deste
 * porte nao justifica a dependencia extra.
 */
export function runMigrations(db: DatabaseSync): void {
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

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue

    db.exec('BEGIN IMMEDIATE');
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
      throw new Error(
        `Falha ao aplicar a migration ${migration.version} (${migration.name}): ${(err as Error).message}`
      )
    }
  }
}
