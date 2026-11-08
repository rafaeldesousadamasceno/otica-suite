// Gera src/main/db/migrations/010_sync_base.sql.
//
// Uso: node scripts/gerar-sync-sql.mjs
//
// Aplica as migracoes 1 a 9 num banco em memoria (para saber as colunas de cada
// tabela) e grava o SQL gerado. O arquivo gerado e commitado: migracao
// publicada nunca muda, entao este script so e rodado ao criar a 010.
import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gerarSyncSql } from '../src/main/sync/gerarSyncSql.ts'
import { TABELAS_SINCRONIZAVEIS } from '../src/main/sync/tabelasSincronizaveis.ts'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const pasta = join(raiz, 'src', 'main', 'db', 'migrations')

const db = new DatabaseSync(':memory:')
const anteriores = readdirSync(pasta)
  .filter((f) => /^\d{3}_.*\.sql$/.test(f) && f < '010')
  .sort()
for (const arquivo of anteriores) db.exec(readFileSync(join(pasta, arquivo), 'utf8'))

const colunasDe = (tabela) => db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name)
const sql = gerarSyncSql(TABELAS_SINCRONIZAVEIS, colunasDe)

const destino = join(pasta, '010_sync_base.sql')
writeFileSync(destino, sql, 'utf8')
console.log(`${destino}: ${TABELAS_SINCRONIZAVEIS.length} tabelas, ${sql.split('\n').length} linhas`)
