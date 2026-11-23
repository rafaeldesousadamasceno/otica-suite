import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS } from './index'
import { converterLegado, type PrescricaoLegada } from '@shared/prescricao'

const VERSAO = 14

/** Banco no estado de ANTES da prescricao nova (versoes 1 a 13, como uma otica que ja usa o sistema). */
function bancoAntes(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS.filter((x) => x.version < VERSAO)) db.exec(m.sql)
  db.exec("INSERT INTO cliente (nome) VALUES ('MARIA')")
  return db
}

const migracao = (): string => MIGRATIONS.find((m) => m.version === VERSAO)!.sql

const BASE: PrescricaoLegada = {
  longeOdEsf: -1, longeOdCil: -0.5, longeOdEixo: 90, longeOeEsf: -1.25, longeOeCil: null, longeOeEixo: null,
  longeOdDnp: 31.5, longeOeDnp: 32,
  pertoOdEsf: 1, pertoOdCil: -0.5, pertoOdEixo: 90, pertoOdDnp: 30, pertoOeEsf: 0.75, pertoOeCil: null, pertoOeEixo: null, pertoOeDnp: 30.5,
  adicao: 2
}

function inserir(db: DatabaseSync, p: PrescricaoLegada, armacao: string | null = null): number {
  const info = db
    .prepare(
      `INSERT INTO receita_optica (
         cliente_id, data_exame,
         longe_od_esf, longe_od_cil, longe_od_eixo, longe_od_dnp, longe_oe_esf, longe_oe_cil, longe_oe_eixo, longe_oe_dnp,
         perto_od_esf, perto_od_cil, perto_od_eixo, perto_od_dnp, perto_oe_esf, perto_oe_cil, perto_oe_eixo, perto_oe_dnp,
         adicao, armacao
       ) VALUES (1, '2026-01-10', ?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?, ?, ?)`
    )
    .run(
      p.longeOdEsf, p.longeOdCil, p.longeOdEixo, p.longeOdDnp, p.longeOeEsf, p.longeOeCil, p.longeOeEixo, p.longeOeDnp,
      p.pertoOdEsf, p.pertoOdCil, p.pertoOdEixo, p.pertoOdDnp, p.pertoOeEsf, p.pertoOeCil, p.pertoOeEixo, p.pertoOeDnp,
      p.adicao, armacao
    )
  return Number(info.lastInsertRowid)
}

interface Linha {
  adicao_od: number | null
  adicao_oe: number | null
  dp_longe: number | null
  dp_perto: number | null
  formato_anterior: number
}

const linha = (db: DatabaseSync, id: number): Linha => db.prepare('SELECT * FROM receita_optica WHERE id = ?').get(id) as unknown as Linha

const CASOS: [string, Partial<PrescricaoLegada>][] = [
  ['perto = longe + adição', {}],
  ['perto em branco usa a adição única', { pertoOdEsf: null, pertoOeEsf: null, adicao: 1.5 }],
  ['sem perto e sem adição', { pertoOdEsf: null, pertoOeEsf: null, adicao: null }],
  ['cilindro de perto diferente', { pertoOdCil: -1 }],
  ['eixo de perto diferente', { pertoOeCil: null, pertoOeEixo: 10 }],
  ['adição negativa', { pertoOdEsf: -2 }],
  ['adição acima de +4', { pertoOdEsf: 5.5 }],
  ['adição fora do passo de 0,25', { pertoOdEsf: 1.1 }],
  ['perto fora da grade com adição certinha', { longeOdEsf: -1.1, pertoOdEsf: 0.9 }],
  ['perto sem esférico de longe', { longeOdEsf: null }],
  ['sem DNP de um lado', { longeOeDnp: null, pertoOdDnp: null }],
  ['tudo vazio', { longeOdEsf: null, longeOdCil: null, longeOdEixo: null, longeOeEsf: null, pertoOdEsf: null, pertoOeEsf: null, pertoOdCil: null, pertoOdEixo: null, adicao: null }]
]

describe('migração 14: prescrição', () => {
  it.each(CASOS)('o SQL e converterLegado dão o mesmo resultado: %s', (_nome, mudanca) => {
    const db = bancoAntes()
    const dados = { ...BASE, ...mudanca }
    const id = inserir(db, dados)
    db.exec(migracao())

    const esperado = converterLegado(dados)
    const real = linha(db, id)
    expect(real.adicao_od).toBe(esperado.adicaoOd)
    expect(real.adicao_oe).toBe(esperado.adicaoOe)
    expect(real.dp_longe).toBe(esperado.dpLonge)
    expect(real.dp_perto).toBe(esperado.dpPerto)
    expect(real.formato_anterior === 1).toBe(esperado.formatoAnterior)
  })

  it('não apaga nem muda nenhum valor antigo, nem do que ficou como formato anterior', () => {
    const db = bancoAntes()
    const dados = { ...BASE, pertoOdCil: -1 }
    const id = inserir(db, dados, 'RAY-BAN RB5154')
    db.exec(migracao())

    const r = db.prepare('SELECT * FROM receita_optica WHERE id = ?').get(id) as Record<string, unknown>
    expect(r.perto_od_esf).toBe(1)
    expect(r.perto_od_cil).toBe(-1)
    expect(r.perto_oe_esf).toBe(0.75)
    expect(r.adicao).toBe(2)
    expect(r.armacao).toBe('RAY-BAN RB5154')
    expect(r.formato_anterior).toBe(1)
  })

  it('prisma começa em 0 / "Nenhum" e a armação antiga vira o modelo', () => {
    const db = bancoAntes()
    const id = inserir(db, BASE, 'RAY-BAN RB5154')
    db.exec(migracao())
    const r = db.prepare('SELECT * FROM receita_optica WHERE id = ?').get(id) as Record<string, unknown>
    expect(r).toMatchObject({
      longe_od_prisma: 0, longe_oe_prisma: 0, longe_od_base_prisma: 'NENHUM', longe_oe_base_prisma: 'NENHUM',
      armacao_modelo: 'RAY-BAN RB5154', armacao_tipo: null, excluido_em: null
    })
  })

  it('prescrição nova (inserida depois) nasce no formato novo', () => {
    const db = new DatabaseSync(':memory:')
    for (const m of MIGRATIONS) db.exec(m.sql)
    db.exec("INSERT INTO cliente (nome) VALUES ('MARIA')")
    db.exec("INSERT INTO receita_optica (cliente_id, data_exame) VALUES (1, '2026-02-01')")
    const r = db.prepare('SELECT formato_anterior, longe_od_base_prisma FROM receita_optica').get() as Record<string, unknown>
    expect(r).toEqual({ formato_anterior: 0, longe_od_base_prisma: 'NENHUM' })
  })

  it('listas: Ocupacional, índices, armações e tratamentos na ordem pedida', () => {
    const db = new DatabaseSync(':memory:')
    for (const m of MIGRATIONS) db.exec(m.sql)
    const lista = (tipo: string): string[] =>
      (db.prepare('SELECT valor FROM lista_valor WHERE tipo = ? AND ativo = 1 ORDER BY ordem, valor').all(tipo) as { valor: string }[]).map((x) => x.valor)

    expect(lista('tipo_lente')).toEqual(['VISÃO SIMPLES', 'BIFOCAL', 'MULTIFOCAL', 'OCUPACIONAL'])
    expect(lista('indice_refracao')).toEqual(['1,49', '1,56', '1,59', '1,60', '1,61', '1,67', '1,74'])
    expect(lista('tratamento_lente')).toEqual(['ANTIRRISCO', 'ANTIRREFLEXO', 'ANTIRREFLEXO BLUE', 'FOTOSSENSÍVEL', 'COLORAÇÃO', 'COLORAÇÃO DEGRADÊ'])
    expect(lista('tipo_armacao')).toEqual([
      'ACETATO', 'ACETATO COM NYLON', 'ESPECIAL SPORT', 'FIO DE AÇO', 'FURADA', 'METAL', 'METAL COM NYLON',
      'NATAÇÃO', 'ÓCULOS DE SEGURANÇA', 'SOLAR ACETATO', 'SOLAR METAL', 'SOLAR NYLON'
    ])
  })

  it('FILTRO AZUL vira ANTIRREFLEXO BLUE na lista, sem mexer nas prescrições já gravadas', () => {
    const db = bancoAntes()
    db.exec("INSERT INTO receita_optica (cliente_id, data_exame, tratamentos) VALUES (1, '2026-01-10', 'FILTRO AZUL + ANTIRRISCO')")
    db.exec(migracao())
    const valores = (db.prepare("SELECT valor FROM lista_valor WHERE tipo = 'tratamento_lente'").all() as { valor: string }[]).map((x) => x.valor)
    expect(valores).toContain('ANTIRREFLEXO BLUE')
    expect(valores).not.toContain('FILTRO AZUL')
    const r = db.prepare('SELECT tratamentos FROM receita_optica').get() as { tratamentos: string }
    expect(r.tratamentos).toBe('FILTRO AZUL + ANTIRRISCO')
  })

  it('se a ótica já tinha ANTIRREFLEXO BLUE, só retira o FILTRO AZUL (sem repetir nem falhar)', () => {
    const db = bancoAntes()
    db.exec("INSERT INTO lista_valor (tipo, valor, ordem) VALUES ('tratamento_lente', 'ANTIRREFLEXO BLUE', 9)")
    db.exec(migracao())
    const valores = (db.prepare("SELECT valor FROM lista_valor WHERE tipo = 'tratamento_lente'").all() as { valor: string }[]).map((x) => x.valor)
    expect(valores.filter((v) => v === 'ANTIRREFLEXO BLUE')).toHaveLength(1)
    expect(valores).not.toContain('FILTRO AZUL')
  })

  it('migração com várias prescrições: cada uma é convertida pelo seu próprio valor', () => {
    const db = bancoAntes()
    const a = inserir(db, BASE)
    const b = inserir(db, { ...BASE, pertoOdCil: -1 })
    db.exec(migracao())
    expect(linha(db, a).formato_anterior).toBe(0)
    expect(linha(db, b).formato_anterior).toBe(1)
  })
})
