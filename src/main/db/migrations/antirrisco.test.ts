import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS } from './index'

const VERSAO = 12

/** Banco no estado de ANTES da migracao do ANTIRRISCO (versoes 1 a 11, como uma ótica que já usa o sistema). */
function bancoAntes(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS.filter((x) => x.version < VERSAO)) db.exec(m.sql)
  return db
}

const migracao = (): string => MIGRATIONS.find((m) => m.version === VERSAO)!.sql

const tratamentos = (db: DatabaseSync): { valor: string; ordem: number; ativo: number }[] =>
  db
    .prepare("SELECT valor, ordem, ativo FROM lista_valor WHERE tipo = 'tratamento_lente' ORDER BY ordem, valor")
    .all() as { valor: string; ordem: number; ativo: number }[]

describe('migração 12: ENDURECEDOR vira ANTIRRISCO', () => {
  it('renomeia a opção da lista mantendo a posição e o estado (ativo/inativo)', () => {
    const db = bancoAntes()
    expect(tratamentos(db).map((t) => t.valor)).toContain('ENDURECEDOR')

    db.exec(migracao())

    const lista = tratamentos(db)
    expect(lista.map((t) => t.valor)).toEqual(['ANTIRREFLEXO', 'FOTOSSENSÍVEL', 'FILTRO AZUL', 'ANTIRRISCO'])
    expect(lista.at(-1)).toMatchObject({ ordem: 4, ativo: 1 })
  })

  it('mantém a opção inativa se a ótica já a tinha desativado', () => {
    const db = bancoAntes()
    db.exec("UPDATE lista_valor SET ativo = 0 WHERE tipo = 'tratamento_lente' AND valor = 'ENDURECEDOR'")
    db.exec(migracao())
    expect(tratamentos(db).find((t) => t.valor === 'ANTIRRISCO')?.ativo).toBe(0)
  })

  it('se a ótica já cadastrou ANTIRRISCO, só retira o ENDURECEDOR (sem repetir nem falhar)', () => {
    const db = bancoAntes()
    db.exec("INSERT INTO lista_valor (tipo, valor, ordem) VALUES ('tratamento_lente', 'ANTIRRISCO', 9)")
    db.exec(migracao())

    const nomes = tratamentos(db).map((t) => t.valor)
    expect(nomes.filter((n) => n === 'ANTIRRISCO')).toHaveLength(1)
    expect(nomes).not.toContain('ENDURECEDOR')
  })

  it('não mexe em outras listas nem nas receitas já gravadas', () => {
    const db = bancoAntes()
    db.exec("INSERT INTO lista_valor (tipo, valor, ordem) VALUES ('laboratorio', 'ENDURECEDOR', 9)")
    db.exec("INSERT INTO cliente (nome) VALUES ('MARIA')")
    db.exec("INSERT INTO receita_optica (cliente_id, data_exame, tratamentos) VALUES (1, '2026-01-10', 'ENDURECEDOR')")

    db.exec(migracao())

    const lab = db.prepare("SELECT valor FROM lista_valor WHERE tipo = 'laboratorio' AND valor = 'ENDURECEDOR'").get()
    expect(lab).toBeDefined()
    const receita = db.prepare('SELECT tratamentos FROM receita_optica WHERE id = 1').get() as { tratamentos: string }
    expect(receita.tratamentos).toBe('ENDURECEDOR')
  })

  it('instalação nova (todas as migrações) termina com ANTIRRISCO e sem ENDURECEDOR', () => {
    const db = new DatabaseSync(':memory:')
    for (const m of MIGRATIONS) db.exec(m.sql)
    const nomes = tratamentos(db).map((t) => t.valor)
    expect(nomes).toContain('ANTIRRISCO')
    expect(nomes).not.toContain('ENDURECEDOR')
  })
})
