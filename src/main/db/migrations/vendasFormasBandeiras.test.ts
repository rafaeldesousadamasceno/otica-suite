import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { MIGRATIONS } from './index'
import { bancoDeCliente, migracao, popularVendasAntigas } from './vendasAntigasFixture'
import { sqlSyncTabelaNova } from '@main/sync/gerarSyncSql'
import { TABELAS_SINCRONIZAVEIS } from '@main/sync/tabelasSincronizaveis'

const todos = <T>(db: DatabaseSync, sql: string): T[] => db.prepare(sql).all() as T[]
const um = <T>(db: DatabaseSync, sql: string): T => db.prepare(sql).get() as T

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** Tudo o que importa financeiramente, na forma de antes (as colunas que ja existiam). */
function fotografia(db: DatabaseSync): Record<string, unknown[]> {
  return {
    venda: todos(db, 'SELECT id, numero, cliente_id, vendedor_id, data, subtotal_centavos, desconto_centavos, total_centavos, situacao FROM venda ORDER BY id'),
    venda_item: todos(db, 'SELECT * FROM venda_item ORDER BY id'),
    venda_pagamento: todos(db, 'SELECT id, venda_id, forma_pagamento, valor_centavos, parcelas FROM venda_pagamento ORDER BY id'),
    conta_receber: todos(db, 'SELECT id, venda_id, cliente_id, parcela, total_parcelas, valor_centavos, vencimento, situacao FROM conta_receber ORDER BY id'),
    recebimento: todos(db, 'SELECT id, conta_receber_id, valor_centavos, data, forma_pagamento FROM recebimento ORDER BY id'),
    lancamento: todos(db, 'SELECT id, tipo, categoria, descricao, valor_centavos, data, origem_tipo, origem_id FROM lancamento ORDER BY id'),
    comissao: todos(db, 'SELECT id, venda_id, base_centavos, percentual, valor_centavos, situacao FROM comissao ORDER BY id')
  }
}

const formas = (db: DatabaseSync): { nome: string; tipo: string; ativo: number; max_parcelas: number | null }[] =>
  todos(db, 'SELECT nome, tipo, ativo, max_parcelas FROM forma_pagamento ORDER BY ordem, nome')

describe('migração 16: vendas, formas de pagamento e bandeiras', () => {
  it('nada se perde: vendas, itens, pagamentos, parcelas, recebimentos, lançamentos e comissão ficam idênticos', () => {
    const db = bancoDeCliente()
    popularVendasAntigas(db)
    const antes = fotografia(db)
    db.exec(migracao())
    expect(fotografia(db)).toEqual(antes)
  })

  it('o texto da forma continua gravado e cada pagamento antigo passa a apontar para uma forma do cadastro', () => {
    const db = bancoDeCliente()
    popularVendasAntigas(db)
    db.exec(migracao())
    const linhas = todos<{ forma_pagamento: string; nome: string | null; forma_tipo: string | null; comportamento: string }>(
      db,
      `SELECT vp.forma_pagamento, f.nome, vp.forma_tipo, vp.comportamento
       FROM venda_pagamento vp LEFT JOIN forma_pagamento f ON f.id = vp.forma_pagamento_id ORDER BY vp.id`
    )
    expect(linhas).toEqual([
      { forma_pagamento: 'ENTRADA', nome: 'ENTRADA', forma_tipo: 'DINHEIRO', comportamento: 'IMEDIATO' },
      { forma_pagamento: 'PROMISSÓRIA', nome: 'PROMISSÓRIA', forma_tipo: 'PROMISSORIA', comportamento: 'PARCELADO_CLIENTE' },
      { forma_pagamento: 'À VISTA', nome: 'À VISTA', forma_tipo: 'DINHEIRO', comportamento: 'IMEDIATO' },
      // cartao parcelado de antes: o comportamento que ele teve (parcelas do cliente) continua valendo
      { forma_pagamento: 'CARTÃO', nome: 'CARTÃO', forma_tipo: 'CARTAO_CREDITO', comportamento: 'PARCELADO_CLIENTE' },
      { forma_pagamento: 'CHEQUE PRÉ-DATADO', nome: 'CHEQUE PRÉ-DATADO', forma_tipo: 'CHEQUE', comportamento: 'IMEDIATO' }
    ])
  })

  it('mapeia a lista antiga: ENTRADA, À VISTA e CARTÃO ficam inativas; PIX e PROMISSÓRIA seguem ativas; faltantes são criadas', () => {
    const db = bancoDeCliente()
    db.exec("INSERT INTO lista_valor (tipo, valor, ordem, ativo) VALUES ('forma_pagamento', 'CREDIÁRIO', 5, 1), ('forma_pagamento', 'VALE PRESENTE', 6, 0)")
    db.exec(migracao())
    const porNome = Object.fromEntries(formas(db).map((f) => [f.nome, f]))

    expect(porNome['ENTRADA']).toMatchObject({ tipo: 'DINHEIRO', ativo: 0 })
    expect(porNome['À VISTA']).toMatchObject({ tipo: 'DINHEIRO', ativo: 0 })
    expect(porNome['CARTÃO']).toMatchObject({ tipo: 'CARTAO_CREDITO', ativo: 0 })
    expect(porNome['PIX']).toMatchObject({ tipo: 'PIX', ativo: 1 })
    expect(porNome['PROMISSÓRIA']).toMatchObject({ tipo: 'PROMISSORIA', ativo: 1, max_parcelas: 12 })
    expect(porNome['CREDIÁRIO']).toMatchObject({ tipo: 'PROMISSORIA', ativo: 1 })
    expect(porNome['VALE PRESENTE']).toMatchObject({ tipo: 'OUTRO', ativo: 0 })
    // padroes que faltavam
    expect(porNome['DINHEIRO']).toMatchObject({ tipo: 'DINHEIRO', ativo: 1 })
    expect(porNome['TRANSFERÊNCIA']).toMatchObject({ tipo: 'TRANSFERENCIA', ativo: 1 })
    expect(porNome['CARTÃO DE DÉBITO']).toMatchObject({ tipo: 'CARTAO_DEBITO', ativo: 1 })
    expect(porNome['CARTÃO DE CRÉDITO']).toMatchObject({ tipo: 'CARTAO_CREDITO', ativo: 1 })
    expect(porNome['BOLETO']).toMatchObject({ tipo: 'BOLETO', ativo: 1, max_parcelas: 12 })
    expect(porNome['CHEQUE']).toMatchObject({ tipo: 'CHEQUE', ativo: 1, max_parcelas: 12 })
    // a lista antiga nao foi tocada (Contas a Pagar ainda a usa)
    expect(um<{ n: number }>(db, "SELECT COUNT(*) AS n FROM lista_valor WHERE tipo = 'forma_pagamento'").n).toBe(7)
  })

  it('instalação nova: só as formas padrão, ativas e sem duplicar', () => {
    const db = new DatabaseSync(':memory:')
    for (const m of MIGRATIONS) db.exec(m.sql)
    const ativas = formas(db).filter((f) => f.ativo === 1).map((f) => f.nome)
    expect(ativas).toEqual(['DINHEIRO', 'PIX', 'TRANSFERÊNCIA', 'CARTÃO DE DÉBITO', 'CARTÃO DE CRÉDITO', 'PROMISSÓRIA', 'BOLETO', 'CHEQUE'])
    // para cada tipo de comportamento sempre ha exatamente uma ativa (a ótica ajusta depois)
    expect(new Set(ativas).size).toBe(ativas.length)
  })

  it('respeita a escolha da ótica: PIX inativo na lista antiga continua inativo (e não é recriado)', () => {
    const db = bancoDeCliente()
    db.exec("UPDATE lista_valor SET ativo = 0 WHERE tipo = 'forma_pagamento' AND valor = 'PIX'")
    db.exec(migracao())
    expect(formas(db).filter((f) => f.tipo === 'PIX')).toEqual([{ nome: 'PIX', tipo: 'PIX', ativo: 0, max_parcelas: null }])
  })

  it('o desconto das vendas antigas é separado em itens e adicional, sem mudar o total', () => {
    const db = bancoDeCliente()
    popularVendasAntigas(db)
    db.exec("UPDATE venda SET desconto_centavos = 3000, total_centavos = 7000 WHERE id = 2") // venda sem item: o desconto todo e adicional
    db.exec(migracao())
    const v = todos<{ id: number; desconto_adicional_tipo: string; desconto_adicional_valor: number; desconto_adicional_centavos: number; desconto_centavos: number }>(
      db,
      'SELECT id, desconto_adicional_tipo, desconto_adicional_valor, desconto_adicional_centavos, desconto_centavos FROM venda ORDER BY id'
    )
    expect(v[0]).toMatchObject({ desconto_centavos: 1500, desconto_adicional_centavos: 0, desconto_adicional_tipo: 'VALOR' }) // 15,00 era desconto do item
    expect(v[1]).toMatchObject({ desconto_centavos: 3000, desconto_adicional_centavos: 3000, desconto_adicional_valor: 3000 })
  })

  it('as parcelas e os recebimentos de antes continuam sendo parcelas DO CLIENTE; venda não vem excluída', () => {
    const db = bancoDeCliente()
    popularVendasAntigas(db)
    db.exec(migracao())
    expect(um<{ n: number }>(db, "SELECT COUNT(*) AS n FROM conta_receber WHERE tipo = 'CLIENTE'").n).toBe(8)
    expect(um<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM venda WHERE excluido_em IS NOT NULL').n).toBe(0)
  })

  it('nome da forma é único sem diferença de maiúscula (letra sem acento) e o excluído libera o nome', () => {
    const db = bancoDeCliente()
    db.exec(migracao())
    db.exec("INSERT INTO forma_pagamento (nome, tipo) VALUES ('Vale Troca', 'OUTRO')")
    expect(() => db.exec("INSERT INTO forma_pagamento (nome, tipo) VALUES ('VALE TROCA', 'OUTRO')")).toThrow()
    db.exec("UPDATE forma_pagamento SET excluido_em = datetime('now') WHERE nome = 'Vale Troca'")
    db.exec("INSERT INTO forma_pagamento (nome, tipo) VALUES ('VALE TROCA', 'OUTRO')")
  })

  it('o tipo é restrito à lista do documento', () => {
    const db = bancoDeCliente()
    db.exec(migracao())
    expect(() => db.exec("INSERT INTO forma_pagamento (nome, tipo) VALUES ('X', 'CREDIARIO')")).toThrow()
  })

  it('bandeira: mesma bandeira em maquininhas diferentes convive; faixa é única por quantidade de parcelas', () => {
    const db = bancoDeCliente()
    db.exec(migracao())
    db.exec("INSERT INTO bandeira (nome, adquirente, aceita_credito) VALUES ('VISA', 'STONE', 1), ('VISA', 'CIELO', 1)")
    expect(() => db.exec("INSERT INTO bandeira (nome, adquirente, aceita_credito) VALUES ('Visa', 'stone', 1)")).toThrow()
    db.exec("INSERT INTO bandeira_faixa (bandeira_id, parcelas, taxa_bp, prazo_dias) VALUES (1, 6, 899, 180)")
    expect(() => db.exec("INSERT INTO bandeira_faixa (bandeira_id, parcelas, taxa_bp, prazo_dias) VALUES (1, 6, 100, 30)")).toThrow()
  })
})

describe('migração 16: sincronização das tabelas novas', () => {
  it('as formas já existentes nascem com uuid e entram na revisão 1', () => {
    const db = bancoDeCliente()
    db.exec(migracao())
    const linhas = todos<{ uuid: string; sync_rev: number }>(db, 'SELECT uuid, sync_rev FROM forma_pagamento')
    expect(linhas.length).toBeGreaterThan(5)
    for (const l of linhas) {
      expect(l.uuid).toMatch(UUID_V4)
      expect(l.sync_rev).toBe(1)
    }
    expect(new Set(linhas.map((l) => l.uuid)).size).toBe(linhas.length)
  })

  it('insert, update e delete de bandeira e faixa passam pelos gatilhos', () => {
    const db = bancoDeCliente()
    db.exec(migracao())
    db.exec("INSERT INTO bandeira (nome, aceita_credito) VALUES ('ELO', 1)")
    db.exec("INSERT INTO bandeira_faixa (bandeira_id, parcelas, taxa_bp, prazo_dias) VALUES (1, 1, 349, 30)")
    const b = um<{ uuid: string; sync_rev: number }>(db, 'SELECT uuid, sync_rev FROM bandeira')
    const f = um<{ uuid: string; sync_rev: number }>(db, 'SELECT uuid, sync_rev FROM bandeira_faixa')
    expect(b.uuid).toMatch(UUID_V4)
    expect(f.uuid).toMatch(UUID_V4)
    db.exec('UPDATE bandeira_faixa SET taxa_bp = 399 WHERE id = 1')
    expect(um<{ sync_rev: number }>(db, 'SELECT sync_rev FROM bandeira_faixa').sync_rev).toBeGreaterThan(f.sync_rev)
    db.exec('DELETE FROM bandeira_faixa WHERE id = 1')
    expect(um<{ uuid: string }>(db, "SELECT uuid FROM sync_exclusao WHERE tabela = 'bandeira_faixa'").uuid).toBe(f.uuid)
  })

  it('o trecho de sincronização da migração é exatamente a saída do gerador', () => {
    const base = new DatabaseSync(':memory:')
    for (const m of MIGRATIONS) base.exec(m.sql)
    for (const nome of ['forma_pagamento', 'bandeira', 'bandeira_faixa']) {
      const colunas = (base.prepare(`PRAGMA table_info(${nome})`).all() as { name: string }[]).map((c) => c.name).filter((c) => !['uuid', 'sync_rev', 'atualizado_em'].includes(c))
      const gerado = sqlSyncTabelaNova(TABELAS_SINCRONIZAVEIS.find((t) => t.nome === nome)!, colunas)
      expect(migracao().replace(/\r\n/g, '\n')).toContain(gerado.replace(/\r\n/g, '\n'))
    }
  })

  it('as tabelas estão registradas como criadas na migração 16 (fora da 010)', () => {
    for (const nome of ['forma_pagamento', 'bandeira', 'bandeira_faixa']) {
      expect(TABELAS_SINCRONIZAVEIS.find((t) => t.nome === nome)?.desdeMigracao).toBe(16)
    }
  })
})
