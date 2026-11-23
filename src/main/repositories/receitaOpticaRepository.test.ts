import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'
import { receitaOpticaInputSchema } from '@shared/ipc'

// SQLite em memoria com as migracoes REAIS.
const { banco } = vi.hoisted(() => ({ banco: { db: null as DatabaseSync | null } }))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))

import { receitaOpticaRepository } from './receitaOpticaRepository'

function payload(extra: Record<string, unknown> = {}): ReturnType<typeof receitaOpticaInputSchema.parse> {
  return receitaOpticaInputSchema.parse({
    clienteId: 1,
    dataExame: '2026-11-07',
    longeOdEsf: -1, longeOdCil: -0.5, longeOdEixo: 90, longeOdDnp: 31.5, longeOdAlt: '', longeOdPrisma: 0, longeOdBasePrisma: 'NENHUM', adicaoOd: 2, pertoOdDnp: '30',
    longeOeEsf: -1.25, longeOeCil: '', longeOeEixo: '', longeOeDnp: 32, longeOeAlt: '', longeOePrisma: 0, longeOeBasePrisma: 'NENHUM', adicaoOe: 1.5, pertoOeDnp: '30,5',
    ponte: '', horizontal: '', vertical: '', diagonalMaior: '',
    ...extra
  })
}

function bancoNovo(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS) db.exec(m.sql)
  db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Ana', 'ana', 'x', 'admin')").run()
  db.prepare("INSERT INTO cliente (nome) VALUES ('Cliente')").run()
  return db
}

describe('receitaOpticaRepository: prescrição no formato atual', () => {
  beforeEach(() => {
    banco.db = bancoNovo()
  })

  it('grava e lê: o Perto sai de Longe + Adição e não é gravado', () => {
    const id = receitaOpticaRepository.criar(payload(), null, 1, 1)
    const r = receitaOpticaRepository.buscarPorId(id)!

    expect(r.formatoAnterior).toBe(false)
    expect([r.adicaoOd, r.adicaoOe]).toEqual([2, 1.5])
    // Olho direito: -1,00 + 2,00 = +1,00; cilindro e eixo de longe. Esquerdo: -1,25 + 1,50 = +0,25.
    expect([r.pertoOdEsf, r.pertoOdCil, r.pertoOdEixo]).toEqual([1, -0.5, 90])
    expect([r.pertoOeEsf, r.pertoOeCil, r.pertoOeEixo]).toEqual([0.25, null, null])
    expect([r.pertoOdDnp, r.pertoOeDnp]).toEqual([30, 30.5])

    const bruto = banco.db!.prepare('SELECT perto_od_esf, perto_od_cil, perto_od_eixo, perto_oe_esf FROM receita_optica').get() as Record<string, unknown>
    expect(bruto).toEqual({ perto_od_esf: null, perto_od_cil: null, perto_od_eixo: null, perto_oe_esf: null })
  })

  it('a DP é gravada sempre (soma das DNPs), de longe e de perto', () => {
    const id = receitaOpticaRepository.criar(payload(), null, 1, 1)
    const r = receitaOpticaRepository.buscarPorId(id)!
    expect([r.dpLonge, r.dpPerto]).toEqual([63.5, 60.5])
  })

  it('sem DNP de perto nos dois lados, não há DP de perto', () => {
    const id = receitaOpticaRepository.criar(payload({ pertoOdDnp: '', pertoOeDnp: '' }), null, 1, 1)
    expect(receitaOpticaRepository.buscarPorId(id)!.dpPerto).toBeNull()
  })

  it('grava armação (em maiúsculas), medidas com uma casa, prisma, altura, índice e tratamentos', () => {
    const id = receitaOpticaRepository.criar(
      payload({
        longeOdPrisma: 1.5, longeOdBasePrisma: 'NASAL', longeOdAlt: '18,5',
        indiceRefracao: '1,56', tipoLente: 'MULTIFOCAL', tratamentos: 'ANTIRRISCO + COLORAÇÃO',
        armacaoTipo: 'ACETATO', armacaoModelo: 'rb5154', armacaoMarca: 'Ray-Ban', armacaoCor: 'preta',
        ponte: '18,04', horizontal: 52, vertical: '40', diagonalMaior: 55.5
      }),
      null, 1, 1
    )
    const r = receitaOpticaRepository.buscarPorId(id)!
    expect(r).toMatchObject({
      longeOdPrisma: 1.5, longeOdBasePrisma: 'NASAL', longeOdAlt: 18.5, longeOePrisma: 0, longeOeBasePrisma: 'NENHUM',
      indiceRefracao: '1,56', tipoLente: 'MULTIFOCAL', tratamentos: 'ANTIRRISCO + COLORAÇÃO',
      armacaoTipo: 'ACETATO', armacaoModelo: 'RB5154', armacaoMarca: 'RAY-BAN', armacaoCor: 'PRETA',
      ponte: 18, horizontal: 52, vertical: 40, diagonalMaior: 55.5
    })
  })

  it('exclusão lógica: some da lista e da busca, mas o registro continua no banco', () => {
    const id = receitaOpticaRepository.criar(payload(), null, 1, 1)
    expect(receitaOpticaRepository.excluir(id, 'digitada por engano')).toBe(true)

    expect(receitaOpticaRepository.buscarPorId(id)).toBeNull()
    expect(receitaOpticaRepository.listarPorCliente(1)).toEqual([])
    const guardada = banco.db!.prepare('SELECT excluido_em, excluido_motivo FROM receita_optica WHERE id = ?').get(id) as Record<string, unknown>
    expect(guardada.excluido_em).not.toBeNull()
    expect(guardada.excluido_motivo).toBe('digitada por engano')
    // Excluir de novo não faz nada; editar a excluída também não.
    expect(receitaOpticaRepository.excluir(id, null)).toBe(false)
  })

  it('o número da versão nunca se repete, nem depois de excluir a última', () => {
    const a = receitaOpticaRepository.criar(payload(), null, receitaOpticaRepository.proximaVersao(1), 1)
    receitaOpticaRepository.excluir(a, null)
    expect(receitaOpticaRepository.proximaVersao(1)).toBe(2)
  })

  it('vínculos: OS e venda válidas contam; canceladas não', () => {
    const id = receitaOpticaRepository.criar(payload(), null, 1, 1)
    const db = banco.db!
    db.prepare("INSERT INTO ordem_servico (numero, cliente_id, receita_optica_id, situacao) VALUES ('OS-1', 1, ?, 'EM ABERTO')").run(id)
    db.prepare("INSERT INTO ordem_servico (numero, cliente_id, receita_optica_id, situacao) VALUES ('OS-2', 1, ?, 'CANCELADA')").run(id)
    db.prepare("INSERT INTO venda (numero, cliente_id, vendedor_id, receita_optica_id, total_centavos, situacao) VALUES ('V-1', 1, 1, ?, 100, 'CONCLUIDA')").run(id)
    db.prepare("INSERT INTO venda (numero, cliente_id, vendedor_id, receita_optica_id, total_centavos, situacao) VALUES ('V-2', 1, 1, ?, 100, 'CANCELADA')").run(id)

    expect(receitaOpticaRepository.vinculosAtivos(id)).toEqual([
      { tipo: 'OS', numero: 'OS-1', situacao: 'EM ABERTO' },
      { tipo: 'Venda', numero: 'V-1', situacao: 'CONCLUIDA' }
    ])
  })
})

describe('receitaOpticaRepository: prescrições de antes do formato atual', () => {
  /** Banco como o de uma ótica que já usa o sistema: prescrições gravadas até a migração 13, depois a 14. */
  function bancoComLegado(): void {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    for (const m of MIGRATIONS.filter((x) => x.version < 14)) db.exec(m.sql)
    db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Ana', 'ana', 'x', 'admin')").run()
    db.prepare("INSERT INTO cliente (nome) VALUES ('Cliente')").run()
    // 1: perto = longe + adição. 2: perto com cilindro diferente do de longe (nao segue a regra).
    db.prepare(
      `INSERT INTO receita_optica (cliente_id, data_exame, longe_od_esf, longe_od_cil, longe_od_eixo, longe_od_dnp, longe_oe_esf, longe_oe_dnp,
         perto_od_esf, perto_od_cil, perto_od_eixo, perto_oe_esf, adicao, armacao, versao)
       VALUES (1, '2025-01-10', -1, -0.5, 90, 31.5, -1, 32, 1, -0.5, 90, 1, 2, 'RAY-BAN', 1)`
    ).run()
    db.prepare(
      `INSERT INTO receita_optica (cliente_id, data_exame, longe_od_esf, longe_od_cil, longe_od_eixo, longe_od_dnp, longe_oe_esf, longe_oe_dnp,
         perto_od_esf, perto_od_cil, perto_od_eixo, perto_oe_esf, adicao, versao)
       VALUES (1, '2025-02-10', -1, -0.5, 90, 31.5, -1, 32, 1.25, -1, 80, 1, 2, 2)`
    ).run()
    db.exec(MIGRATIONS.find((m) => m.version === 14)!.sql)
    banco.db = db
  }

  beforeEach(bancoComLegado)

  it('a que segue a regra entra no formato atual e o Perto é calculado', () => {
    const r = receitaOpticaRepository.listarPorCliente(1).find((x) => x.versao === 1)!
    expect(r.formatoAnterior).toBe(false)
    expect([r.adicaoOd, r.adicaoOe]).toEqual([2, 2])
    expect([r.pertoOdEsf, r.pertoOeEsf]).toEqual([1, 1])
    expect([r.dpLonge, r.armacaoModelo]).toEqual([63.5, 'RAY-BAN'])
  })

  it('a que não segue a regra mostra o Perto ORIGINAL, sem recalcular', () => {
    const r = receitaOpticaRepository.listarPorCliente(1).find((x) => x.versao === 2)!
    expect(r.formatoAnterior).toBe(true)
    expect([r.pertoOdEsf, r.pertoOdCil, r.pertoOdEixo]).toEqual([1.25, -1, 80])
    expect([r.adicaoOd, r.adicaoOe]).toEqual([null, null])
    expect(r.adicao).toBe(2)
  })

  it('salvar uma do formato anterior passa para o formato atual, sem apagar os valores antigos', () => {
    const antes = receitaOpticaRepository.listarPorCliente(1).find((x) => x.versao === 2)!
    const dados = payload({ id: antes.id, longeOdEsf: -1, longeOdCil: -0.5, longeOdEixo: 90, longeOdDnp: 31.5, longeOeEsf: -1, longeOeCil: 0, longeOeEixo: '', longeOeDnp: 32, adicaoOd: 2, adicaoOe: 2 })
    receitaOpticaRepository.atualizar({ ...dados, id: antes.id }, null)

    const depois = receitaOpticaRepository.buscarPorId(antes.id)!
    expect(depois.formatoAnterior).toBe(false)
    expect(depois.pertoOdEsf).toBe(1) // agora calculado: -1,00 + 2,00
    const guardado = banco.db!.prepare('SELECT perto_od_esf, perto_od_cil, perto_od_eixo, adicao FROM receita_optica WHERE id = ?').get(antes.id) as Record<string, unknown>
    expect(guardado).toEqual({ perto_od_esf: 1.25, perto_od_cil: -1, perto_od_eixo: 80, adicao: 2 })
  })
})
