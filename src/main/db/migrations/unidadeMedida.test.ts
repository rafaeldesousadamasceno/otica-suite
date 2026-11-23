import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS } from './index'

const VERSAO = 13

/** Banco no estado de ANTES da lista de unidades (versoes 1 a 12, como uma ótica que já usa o sistema). */
function bancoAntes(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS.filter((x) => x.version < VERSAO)) db.exec(m.sql)
  return db
}

const migracao = (): string => MIGRATIONS.find((m) => m.version === VERSAO)!.sql

function produto(db: DatabaseSync, descricao: string, unidade: string): void {
  db.prepare(
    `INSERT INTO produto (descricao, categoria, unidade, custo_centavos, margem, preco_venda_centavos, estoque_minimo)
     VALUES (?, 'acessorio', ?, 0, 0, 0, 0)`
  ).run(descricao, unidade)
}

const unidades = (db: DatabaseSync): { valor: string; descricao: string | null; ordem: number; ativo: number }[] =>
  db
    .prepare("SELECT valor, descricao, ordem, ativo FROM lista_valor WHERE tipo = 'unidade_medida' ORDER BY ordem, valor")
    .all() as { valor: string; descricao: string | null; ordem: number; ativo: number }[]

const unidadeDe = (db: DatabaseSync, descricao: string): string =>
  (db.prepare('SELECT unidade FROM produto WHERE descricao = ?').get(descricao) as { unidade: string }).unidade

describe('migração 13: lista de unidades de medida', () => {
  it('instalação nova começa com UN, PAR, CX e KIT, nessa ordem e com descrição', () => {
    const db = new DatabaseSync(':memory:')
    for (const m of MIGRATIONS) db.exec(m.sql)
    expect(unidades(db)).toEqual([
      { valor: 'UN', descricao: 'UNIDADE', ordem: 1, ativo: 1 },
      { valor: 'PAR', descricao: 'PAR', ordem: 2, ativo: 1 },
      { valor: 'CX', descricao: 'CAIXA', ordem: 3, ativo: 1 },
      { valor: 'KIT', descricao: 'KIT', ordem: 4, ativo: 1 }
    ])
  })

  it('padroniza a unidade já digitada nos produtos: maiúsculas, sem espaço nas pontas, vazio vira UN', () => {
    const db = bancoAntes()
    produto(db, 'CORDÃO', 'un')
    produto(db, 'ESTOJO', ' cx ')
    produto(db, 'FLANELA', '  ')

    db.exec(migracao())

    expect(unidadeDe(db, 'CORDÃO')).toBe('UN')
    expect(unidadeDe(db, 'ESTOJO')).toBe('CX')
    expect(unidadeDe(db, 'FLANELA')).toBe('UN')
  })

  it('sigla em uso que não é das quatro padrão entra na lista (sem descrição), depois das padrão', () => {
    const db = bancoAntes()
    produto(db, 'LÍQUIDO LIMPA-LENTES', 'fr')
    produto(db, 'SPRAY', 'FR')
    produto(db, 'LENTE DE CONTATO', 'BL')

    db.exec(migracao())

    const lista = unidades(db)
    expect(lista.map((u) => u.valor)).toEqual(['UN', 'PAR', 'CX', 'KIT', 'BL', 'FR'])
    expect(lista.slice(4)).toEqual([
      { valor: 'BL', descricao: null, ordem: 5, ativo: 1 },
      { valor: 'FR', descricao: null, ordem: 6, ativo: 1 }
    ])
  })

  it('não mexe nas outras listas: elas ficam sem descrição', () => {
    const db = bancoAntes()
    db.exec(migracao())
    const outras = db.prepare("SELECT COUNT(*) AS n FROM lista_valor WHERE tipo <> 'unidade_medida' AND descricao IS NOT NULL").get() as {
      n: number
    }
    expect(outras.n).toBe(0)
    const tratamentos = db.prepare("SELECT valor FROM lista_valor WHERE tipo = 'tratamento_lente' ORDER BY ordem").all() as { valor: string }[]
    expect(tratamentos.map((t) => t.valor)).toEqual(['ANTIRREFLEXO', 'FOTOSSENSÍVEL', 'FILTRO AZUL', 'ANTIRRISCO'])
  })

  it('as unidades novas ganham uuid de sincronização como qualquer linha da lista', () => {
    const db = bancoAntes()
    produto(db, 'SPRAY', 'FR')
    db.exec(migracao())
    const semUuid = db.prepare("SELECT COUNT(*) AS n FROM lista_valor WHERE tipo = 'unidade_medida' AND uuid IS NULL").get() as { n: number }
    expect(semUuid.n).toBe(0)
  })
})
