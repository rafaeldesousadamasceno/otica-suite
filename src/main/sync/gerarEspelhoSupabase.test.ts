import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'
import { colunaUuid, gerarEspelhoSupabase, type ColunaSqlite, type FkSqlite } from './gerarEspelhoSupabase'
import { TABELAS_SINCRONIZAVEIS } from './tabelasSincronizaveis'

function gerar(): string {
  const db = new DatabaseSync(':memory:')
  for (const m of MIGRATIONS) db.exec(m.sql)
  return gerarEspelhoSupabase(TABELAS_SINCRONIZAVEIS, (t) => ({
    colunas: db.prepare(`PRAGMA table_info(${t})`).all() as unknown as ColunaSqlite[],
    fks: db.prepare(`PRAGMA foreign_key_list(${t})`).all() as unknown as FkSqlite[]
  }))
}

describe('espelho do Supabase (0002_espelho.sql)', () => {
  const sql = gerar()

  it('é exatamente a saída do gerador (não ficou desatualizado nem foi editado à mão)', () => {
    const arquivo = readFileSync(join(__dirname, '../../../supabase/migrations/0002_espelho.sql'), 'utf8')
    expect(arquivo.replace(/\r\n/g, '\n')).toBe(sql)
  })

  it('cria uma tabela, com RLS ligada, para cada tabela sincronizável', () => {
    for (const t of TABELAS_SINCRONIZAVEIS) {
      expect(sql).toContain(`CREATE TABLE optialeph."${t.nome}" (`)
      expect(sql).toContain(`ALTER TABLE optialeph."${t.nome}" ENABLE ROW LEVEL SECURITY;`)
    }
  })

  it('a senha e as colunas locais nunca existem na nuvem', () => {
    const usuario = sql.split('CREATE TABLE optialeph."usuario"')[1].split(');')[0]
    for (const c of ['senha_hash', 'tentativas_login', 'bloqueado_ate', 'ultimo_acesso']) expect(usuario).not.toContain(`"${c}"`)
  })

  it('chaves estrangeiras viram uuid, e o id inteiro local não viaja', () => {
    const venda = sql.split('CREATE TABLE optialeph."venda"')[1].split(');')[0]
    expect(venda).toContain('"cliente_uuid" uuid')
    expect(venda).not.toMatch(/"cliente_id"|"id" /)
  })

  it('nome da coluna de chave estrangeira', () => {
    expect(colunaUuid('cliente_id')).toBe('cliente_uuid')
    expect(colunaUuid('criado_por')).toBe('criado_por_uuid')
  })
})
