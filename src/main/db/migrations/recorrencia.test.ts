import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS } from './index'
import { sqlSyncTabelaNova } from '@main/sync/gerarSyncSql'
import { TABELAS_SINCRONIZAVEIS } from '@main/sync/tabelasSincronizaveis'

const VERSAO = 17
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** Banco como o de uma otica que ja usa o sistema (todas as versoes antes da 17). */
function bancoAntes(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS.filter((x) => x.version < VERSAO)) db.exec(m.sql)
  return db
}

const migracao = (): string => MIGRATIONS.find((m) => m.version === VERSAO)!.sql

function conta(
  db: DatabaseSync,
  descricao: string,
  categoria: string | null,
  valor: number,
  vencimento: string,
  situacao: 'ABERTA' | 'PAGA' | 'CANCELADA',
  recorrente: 0 | 1 = 1
): number {
  const info = db
    .prepare('INSERT INTO conta_pagar (descricao, categoria, valor_centavos, vencimento, situacao, recorrente) VALUES (?, ?, ?, ?, ?, ?)')
    .run(descricao, categoria, valor, vencimento, situacao, recorrente)
  const id = Number(info.lastInsertRowid)
  if (situacao === 'PAGA') {
    db.prepare("INSERT INTO pagamento (conta_pagar_id, valor_centavos, data, forma_pagamento) VALUES (?, ?, ?, 'PIX')").run(id, valor, vencimento)
  }
  return id
}

interface Linha {
  id: number
  descricao: string
  categoria: string | null
  valor_centavos: number
  vencimento: string
  situacao: string
  recorrente: number
  recorrencia_id: number | null
  competencia: string | null
}

/** Antes da migracao as colunas novas nao existem: viram null. */
const contas = (db: DatabaseSync): Linha[] =>
  (db.prepare('SELECT * FROM conta_pagar ORDER BY id').all() as Record<string, unknown>[]).map((r) => ({
    id: r.id as number,
    descricao: r.descricao as string,
    categoria: r.categoria as string | null,
    valor_centavos: r.valor_centavos as number,
    vencimento: r.vencimento as string,
    situacao: r.situacao as string,
    recorrente: r.recorrente as number,
    recorrencia_id: (r.recorrencia_id as number | null | undefined) ?? null,
    competencia: (r.competencia as string | null | undefined) ?? null
  }))

interface Serie {
  id: number
  descricao: string
  categoria: string | null
  frequencia: string
  dia_vencimento: number
  data_inicio: string
  data_fim: string | null
  status: string
}

const series = (db: DatabaseSync): Serie[] =>
  db
    .prepare('SELECT id, descricao, categoria, frequencia, dia_vencimento, data_inicio, data_fim, status FROM recorrencia ORDER BY id')
    .all() as unknown as Serie[]

const vigencias = (db: DatabaseSync, recorrenciaId: number): { valor_centavos: number; vigente_desde: string }[] =>
  db.prepare('SELECT valor_centavos, vigente_desde FROM recorrencia_valor WHERE recorrencia_id = ? ORDER BY vigente_desde').all(recorrenciaId) as {
    valor_centavos: number
    vigente_desde: string
  }[]

/** Um banco "de cliente": varias series, contas pagas e abertas, avulsas e casos de borda. */
function bancoDeCliente(): { db: DatabaseSync; ids: Record<string, number> } {
  const db = bancoAntes()
  const ids: Record<string, number> = {}

  // Aluguel (categoria ALUGUEL): valores diferentes entre os meses; so a ultima esta aberta.
  ids.alu1 = conta(db, 'ALUGUEL LOJA', 'ALUGUEL', 140000, '2026-01-05', 'PAGA')
  ids.alu2 = conta(db, 'ALUGUEL LOJA', 'ALUGUEL', 140000, '2026-02-05', 'PAGA')
  ids.alu3 = conta(db, 'ALUGUEL LOJA', 'ALUGUEL', 150000, '2026-03-05', 'PAGA')
  ids.alu4 = conta(db, 'ALUGUEL LOJA', 'ALUGUEL', 150000, '2026-04-05', 'ABERTA')

  // Mesma descricao, outra categoria: outra serie.
  ids.aluB1 = conta(db, 'ALUGUEL LOJA', 'DESPESAS FIXAS', 99900, '2026-03-10', 'PAGA')
  ids.aluB2 = conta(db, 'ALUGUEL LOJA', 'DESPESAS FIXAS', 99900, '2026-04-10', 'ABERTA')

  // Energia, sem categoria (nula e vazia contam como a mesma), dia 31 que escorregou para o dia 3.
  ids.en1 = conta(db, 'ENERGIA', null, 30000, '2026-01-31', 'PAGA')
  ids.en2 = conta(db, 'ENERGIA', '', 32000, '2026-03-03', 'PAGA')
  ids.en3 = conta(db, 'ENERGIA', null, 35000, '2026-04-03', 'ABERTA')

  // Conta recorrente isolada.
  ids.net = conta(db, 'INTERNET', 'SERVICOS', 9990, '2026-10-31', 'ABERTA')

  // Descricao com espacos nas pontas cai na mesma serie; a ultima conta esta cancelada: o valor
  // atual vem da ultima NAO cancelada.
  ids.seg1 = conta(db, 'SEGURO', 'SEGUROS', 20000, '2026-01-15', 'PAGA')
  ids.seg2 = conta(db, ' SEGURO ', 'SEGUROS', 21000, '2026-02-15', 'ABERTA')
  ids.seg3 = conta(db, 'SEGURO', 'SEGUROS', 99999, '2026-03-15', 'CANCELADA')

  // Duas contas da mesma serie na mesma competencia: so uma e vinculada.
  ids.dup1 = conta(db, 'CONTADOR', 'SERVICOS', 50000, '2026-05-10', 'PAGA')
  ids.dup2 = conta(db, 'CONTADOR', 'SERVICOS', 50000, '2026-05-20', 'ABERTA')

  // Maiuscula/minuscula e igualdade exata: serie a parte (limitacao documentada).
  ids.min1 = conta(db, 'Aluguel Loja', 'ALUGUEL', 1000, '2026-05-05', 'ABERTA')

  // Data fora do formato: nao entra em serie nenhuma.
  ids.ruim = conta(db, 'DATA RUIM', null, 1000, 'abc', 'ABERTA')

  // Avulsas (nao recorrentes) e uma conta de compra.
  ids.av1 = conta(db, 'MATERIAL DE LIMPEZA', 'DESPESAS', 5000, '2026-04-12', 'ABERTA', 0)
  ids.av2 = conta(db, 'ALUGUEL LOJA', 'ALUGUEL', 77700, '2026-06-05', 'ABERTA', 0)
  return { db, ids }
}

describe('migração 17: séries que a ótica já tinha', () => {
  it('cada série (descrição + categoria) vira uma recorrência mensal ativa, com dia, início e valor atuais', () => {
    const { db } = bancoDeCliente()
    db.exec(migracao())

    const porNome = (descricao: string, categoria: string | null): Serie => {
      const s = series(db).find((x) => x.descricao === descricao && x.categoria === categoria)
      if (!s) throw new Error(`série não encontrada: ${descricao}/${categoria}`)
      return s
    }

    expect(series(db)).toHaveLength(7)
    for (const s of series(db)) {
      expect(s.frequencia).toBe('MENSAL')
      expect(s.status).toBe('ATIVA')
      expect(s.data_fim).toBeNull()
    }

    const aluguel = porNome('ALUGUEL LOJA', 'ALUGUEL')
    expect(aluguel.data_inicio).toBe('2026-01-05') // o menor vencimento da série
    expect(aluguel.dia_vencimento).toBe(5)
    expect(vigencias(db, aluguel.id)).toEqual([{ valor_centavos: 150000, vigente_desde: '2026-01' }]) // o valor mais recente

    const outra = porNome('ALUGUEL LOJA', 'DESPESAS FIXAS')
    expect(outra.id).not.toBe(aluguel.id)
    expect(outra.data_inicio).toBe('2026-03-10')
    expect(vigencias(db, outra.id)).toEqual([{ valor_centavos: 99900, vigente_desde: '2026-03' }])

    const energia = porNome('ENERGIA', null)
    expect(energia.data_inicio).toBe('2026-01-31')
    expect(energia.dia_vencimento).toBe(3) // o dia do vencimento mais recente
    expect(vigencias(db, energia.id)).toEqual([{ valor_centavos: 35000, vigente_desde: '2026-01' }])

    const internet = porNome('INTERNET', 'SERVICOS')
    expect(internet.dia_vencimento).toBe(31)
    expect(internet.data_inicio).toBe('2026-10-31')
    expect(vigencias(db, internet.id)).toEqual([{ valor_centavos: 9990, vigente_desde: '2026-10' }])

    // A ultima conta do seguro estava cancelada: vale a anterior.
    const seguro = porNome('SEGURO', 'SEGUROS')
    expect(seguro.dia_vencimento).toBe(15)
    expect(vigencias(db, seguro.id)).toEqual([{ valor_centavos: 21000, vigente_desde: '2026-01' }])
  })

  it('as contas existentes mantêm valor, vencimento e situação; ganham só o vínculo e a competência', () => {
    const { db, ids } = bancoDeCliente()
    const antes = contas(db)
    db.exec(migracao())
    const depois = contas(db)

    expect(depois).toHaveLength(antes.length)
    for (let i = 0; i < antes.length; i++) {
      const { recorrencia_id: _r, competencia: _c, ...resto } = depois[i]
      const { recorrencia_id: _r0, competencia: _c0, ...restoAntes } = antes[i]
      expect(resto).toEqual(restoAntes)
    }

    const serieDe = (id: number): number | null => depois.find((c) => c.id === id)!.recorrencia_id
    const comp = (id: number): string | null => depois.find((c) => c.id === id)!.competencia
    expect(serieDe(ids.alu1)).not.toBeNull()
    expect(new Set([ids.alu1, ids.alu2, ids.alu3, ids.alu4].map(serieDe)).size).toBe(1)
    expect([ids.alu1, ids.alu2, ids.alu3, ids.alu4].map(comp)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04'])
    expect(serieDe(ids.aluB1)).not.toBe(serieDe(ids.alu1))
    expect(serieDe(ids.aluB1)).toBe(serieDe(ids.aluB2))
    expect(serieDe(ids.en1)).toBe(serieDe(ids.en3)) // nula e vazia: mesma série
    expect(serieDe(ids.en3)).toBe(serieDe(ids.en2))
    expect(comp(ids.en2)).toBe('2026-03')
    expect(serieDe(ids.seg1)).toBe(serieDe(ids.seg2)) // espaços nas pontas
    expect(serieDe(ids.seg3)).toBe(serieDe(ids.seg1)) // a cancelada também fica na série
    expect(serieDe(ids.net)).not.toBeNull()
  })

  it('os valores das contas pagas e os pagamentos ficam intactos', () => {
    const { db } = bancoDeCliente()
    const pagamentos = db.prepare('SELECT * FROM pagamento ORDER BY id').all()
    const pagas = contas(db).filter((c) => c.situacao === 'PAGA')
    db.exec(migracao())
    expect(db.prepare('SELECT * FROM pagamento ORDER BY id').all()).toEqual(pagamentos)
    for (const p of pagas) {
      const depois = contas(db).find((c) => c.id === p.id)!
      expect(depois.valor_centavos).toBe(p.valor_centavos)
      expect(depois.vencimento).toBe(p.vencimento)
      expect(depois.situacao).toBe('PAGA')
    }
  })

  it('duas contas da mesma série na mesma competência: só uma é vinculada (a outra segue como estava)', () => {
    const { db, ids } = bancoDeCliente()
    db.exec(migracao())
    const c1 = contas(db).find((c) => c.id === ids.dup1)!
    const c2 = contas(db).find((c) => c.id === ids.dup2)!
    expect(c1.recorrencia_id).not.toBeNull()
    expect(c2.recorrencia_id).toBeNull()
    expect(c2.situacao).toBe('ABERTA')
  })

  it('o que não é série não é tocado: avulsas, maiúscula diferente (igualdade exata) e data fora do formato', () => {
    const { db, ids } = bancoDeCliente()
    db.exec(migracao())
    const d = contas(db)
    expect(d.find((c) => c.id === ids.av1)!.recorrencia_id).toBeNull()
    expect(d.find((c) => c.id === ids.av2)!.recorrencia_id).toBeNull() // mesma descrição e categoria da série, mas avulsa
    expect(d.find((c) => c.id === ids.ruim)!.recorrencia_id).toBeNull()
    // "Aluguel Loja" (minúsculas) não é "ALUGUEL LOJA": vira uma série própria.
    const minuscula = series(db).find((s) => s.descricao === 'Aluguel Loja')!
    expect(d.find((c) => c.id === ids.min1)!.recorrencia_id).toBe(minuscula.id)
  })

  it('banco sem nenhuma conta recorrente: nada é criado', () => {
    const db = bancoAntes()
    conta(db, 'MATERIAL', null, 1000, '2026-04-12', 'ABERTA', 0)
    db.exec(migracao())
    expect(series(db)).toEqual([])
    expect(contas(db)[0].recorrencia_id).toBeNull()
  })

  it('rodar numa instalação nova não cria nada', () => {
    const db = new DatabaseSync(':memory:')
    for (const m of MIGRATIONS) db.exec(m.sql)
    expect(series(db)).toEqual([])
  })

  it('a chave (recorrência, competência) é única e conta também a ocorrência excluída', () => {
    const { db, ids } = bancoDeCliente()
    db.exec(migracao())
    const alu = contas(db).find((c) => c.id === ids.alu4)!
    db.prepare("UPDATE conta_pagar SET excluido_em = datetime('now') WHERE id = ?").run(ids.alu4)
    expect(() =>
      db
        .prepare("INSERT INTO conta_pagar (descricao, valor_centavos, vencimento, recorrencia_id, competencia) VALUES ('X', 1, '2026-04-05', ?, ?)")
        .run(alu.recorrencia_id, alu.competencia)
    ).toThrow()
    // Contas sem série (recorrencia_id nulo) podem repetir a competência à vontade.
    db.exec("INSERT INTO conta_pagar (descricao, valor_centavos, vencimento) VALUES ('A', 1, '2026-04-05'), ('B', 1, '2026-04-05')")
  })

  it('a vigência é única por série e competência', () => {
    const { db } = bancoDeCliente()
    db.exec(migracao())
    const s = series(db)[0]
    expect(() => db.prepare('INSERT INTO recorrencia_valor (recorrencia_id, valor_centavos, vigente_desde) VALUES (?, 1, ?)').run(s.id, vigencias(db, s.id)[0].vigente_desde)).toThrow()
  })
})

describe('migração 17: sincronização das tabelas novas e da coluna nova', () => {
  it('as séries e vigências já existentes nascem com uuid e entram na revisão 1', () => {
    const { db } = bancoDeCliente()
    db.exec(migracao())
    for (const tabela of ['recorrencia', 'recorrencia_valor']) {
      const linhas = db.prepare(`SELECT uuid, sync_rev FROM ${tabela}`).all() as { uuid: string; sync_rev: number }[]
      expect(linhas.length).toBeGreaterThan(0)
      for (const l of linhas) {
        expect(l.uuid).toMatch(UUID_V4)
        expect(l.sync_rev).toBe(1)
      }
      expect(new Set(linhas.map((l) => l.uuid)).size).toBe(linhas.length)
    }
  })

  it('insert, update e delete passam pelos gatilhos', () => {
    const { db } = bancoDeCliente()
    db.exec(migracao())
    db.exec("INSERT INTO recorrencia (descricao, dia_vencimento, data_inicio) VALUES ('NOVA', 10, '2026-05-10')")
    const antes = db.prepare("SELECT uuid, sync_rev FROM recorrencia WHERE descricao = 'NOVA'").get() as { uuid: string; sync_rev: number }
    expect(antes.uuid).toMatch(UUID_V4)
    db.exec("UPDATE recorrencia SET status = 'ENCERRADA' WHERE descricao = 'NOVA'")
    const depois = db.prepare("SELECT uuid, sync_rev FROM recorrencia WHERE descricao = 'NOVA'").get() as { uuid: string; sync_rev: number }
    expect(depois.uuid).toBe(antes.uuid)
    expect(depois.sync_rev).toBeGreaterThan(antes.sync_rev)
    db.exec("DELETE FROM recorrencia WHERE descricao = 'NOVA'")
    expect(db.prepare("SELECT tabela, uuid FROM sync_exclusao WHERE tabela = 'recorrencia'").get()).toEqual({ tabela: 'recorrencia', uuid: antes.uuid })
  })

  it('o trecho de sincronização da migração é exatamente a saída do gerador', () => {
    const colunas: Record<string, string[]> = {
      recorrencia: ['id', 'descricao', 'categoria', 'fornecedor_id', 'frequencia', 'dia_vencimento', 'data_inicio', 'data_fim', 'status', 'criado_em'],
      recorrencia_valor: ['id', 'recorrencia_id', 'valor_centavos', 'vigente_desde', 'criado_em']
    }
    for (const nome of Object.keys(colunas)) {
      const gerado = sqlSyncTabelaNova(TABELAS_SINCRONIZAVEIS.find((t) => t.nome === nome)!, colunas[nome])
      expect(migracao().replace(/\r\n/g, '\n')).toContain(gerado.replace(/\r\n/g, '\n'))
    }
  })

  it('as tabelas estão registradas como criadas na migração 17 (fora da 010)', () => {
    expect(TABELAS_SINCRONIZAVEIS.find((t) => t.nome === 'recorrencia')?.desdeMigracao).toBe(17)
    expect(TABELAS_SINCRONIZAVEIS.find((t) => t.nome === 'recorrencia_valor')?.desdeMigracao).toBe(17)
  })

  it('a conta a pagar vinculada passa pelo gatilho de atualização (sync_rev sobe)', () => {
    const { db, ids } = bancoDeCliente()
    const antes = db.prepare('SELECT sync_rev FROM conta_pagar WHERE id = ?').get(ids.alu4) as { sync_rev: number }
    db.exec(migracao())
    const depois = db.prepare('SELECT sync_rev FROM conta_pagar WHERE id = ?').get(ids.alu4) as { sync_rev: number }
    expect(depois.sync_rev).toBeGreaterThan(antes.sync_rev)
  })
})
