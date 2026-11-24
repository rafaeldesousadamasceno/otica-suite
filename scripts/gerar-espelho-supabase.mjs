// Gera supabase/migrations/0002_espelho.sql (espelho da loja no Postgres do Supabase).
//
// Uso: node scripts/gerar-espelho-supabase.mjs
//
// Aplica TODAS as migracoes do SQLite num banco em memoria (schema atual) e, para cada tabela de
// src/main/sync/tabelasSincronizaveis.ts, le colunas e chaves estrangeiras. Rode de novo sempre que
// uma tabela ou coluna nova entrar na sincronizacao; um teste falha se o arquivo ficar desatualizado.
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gerarEspelhoSupabase } from '../src/main/sync/gerarEspelhoSupabase.ts'
import { TABELAS_SINCRONIZAVEIS } from '../src/main/sync/tabelasSincronizaveis.ts'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const pasta = join(raiz, 'src', 'main', 'db', 'migrations')

const db = new DatabaseSync(':memory:')
for (const f of readdirSync(pasta).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort()) {
  db.exec(readFileSync(join(pasta, f), 'utf8'))
}

const infoDe = (tabela) => ({
  colunas: db.prepare(`PRAGMA table_info(${tabela})`).all(),
  fks: db.prepare(`PRAGMA foreign_key_list(${tabela})`).all()
})
const sql = gerarEspelhoSupabase(TABELAS_SINCRONIZAVEIS, infoDe)

const destinoPasta = join(raiz, 'supabase', 'migrations')
mkdirSync(destinoPasta, { recursive: true })
const destino = join(destinoPasta, '0002_espelho.sql')
writeFileSync(destino, sql, 'utf8')
console.log(`${destino}: ${TABELAS_SINCRONIZAVEIS.length} tabelas, ${sql.split('\n').length} linhas`)
