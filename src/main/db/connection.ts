import { DatabaseSync } from 'node:sqlite'
import { paths } from '@main/paths'
import { runMigrations } from './migrator'

let db: DatabaseSync | null = null

/**
 * Abre (ou retorna) a conexao unica com o banco local.
 *
 * WAL + synchronous NORMAL: sobrevive a queda de energia sem corromper o
 * banco, com desempenho de escrita adequado para uso de balcao (NF 8.5).
 * `foreign_keys = ON` precisa ser setado por conexao - nao e persistente.
 */
export function getDb(): DatabaseSync {
  if (db) return db

  db = new DatabaseSync(paths.database())
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `)

  runMigrations(db)
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}
