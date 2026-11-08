import { DatabaseSync } from 'node:sqlite'
import { paths } from '@main/paths'
import { runMigrations } from './migrator'
import { registrarFuncoesSql } from './funcoesSql'
import { padronizarTextos } from './padronizarTextos'

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

  const caminhoDb = paths.database()
  const conexao = new DatabaseSync(caminhoDb)
  conexao.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `)

  registrarFuncoesSql(conexao)

  try {
    runMigrations(conexao, caminhoDb)
  } catch (err) {
    // RF-16: em falha de migracao a conexao pode ja ter sido fechada
    // dentro de runMigrations (para restaurar o backup por baixo dela) -
    // o try/catch aqui so garante que nunca fica presa aberta.
    try {
      conexao.close()
    } catch {
      // ja fechada
    }
    throw err
  }

  // Acabamento dos dados antigos: se falhar, o app abre mesmo assim e tenta de novo na proxima vez.
  try {
    padronizarTextos(conexao)
  } catch (err) {
    console.error('Padronizacao de textos adiada:', err)
  }

  db = conexao
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}
