import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registrarFuncoesSql } from '@main/db/funcoesSql'
import { bancoDeCliente, migracao, popularVendasAntigas } from '@main/db/migrations/vendasAntigasFixture'

const { banco } = vi.hoisted(() => ({ banco: { db: null as DatabaseSync | null } }))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))

import { vendaRepository } from './vendaRepository'
import { contaReceberRepository } from './contaReceberRepository'

const um = <T>(sql: string, ...params: (string | number)[]): T => banco.db!.prepare(sql).get(...params) as T

/**
 * Banco de uma otica que ja vendia (ENTRADA, A VISTA, CARTAO parcelado, PROMISSORIA, forma fora da lista) e que
 * acabou de receber a migracao 16: o que ja existia continua consultando, cancelando e excluindo normalmente.
 */
describe('vendas antigas depois da migração 16', () => {
  beforeEach(() => {
    const db = bancoDeCliente()
    registrarFuncoesSql(db)
    popularVendasAntigas(db)
    db.exec(migracao())
    banco.db = db
  })

  it('consulta como antes: texto da forma, parcelas do cliente e total; nada de recebível da operadora', () => {
    const v = vendaRepository.buscarPorId(1)!
    expect(v).toMatchObject({ numero: '2026-00001', totalCentavos: 92500, descontoCentavos: 1500, situacao: 'CONCLUIDA' })
    expect(v.pagamentos.map((p) => [p.formaPagamento, p.valorCentavos, p.parcelas, p.comportamento, p.acrescimoCentavos])).toEqual([
      ['ENTRADA', 20000, 1, 'IMEDIATO', 0],
      ['PROMISSÓRIA', 72500, 5, 'PARCELADO_CLIENTE', 0]
    ])
    expect(v.parcelas).toHaveLength(5)
    expect(v.parcelas.every((p) => p.tipo === 'CLIENTE')).toBe(true)
    expect(v.recebiveisOperadora).toEqual([])
    // sem acrescimo nem desconto de cartao: o cliente paga o total da venda
    expect(v).toMatchObject({ acrescimoCentavos: 0, descontoClienteCentavos: 0, totalClienteCentavos: 92500, descontoAdicionalTipo: 'VALOR', descontoAdicionalCentavos: 0 })
    expect(vendaRepository.listar({}).map((x) => x.numero).sort()).toEqual(['2026-00001', '2026-00002', '2026-00003', '2026-00004'])
    expect(vendaRepository.listar({ busca: 'jose' })).toHaveLength(2)
  })

  it('o cartão parcelado de antes continua com as parcelas do cliente que já teve (e vira inadimplência se vencer)', () => {
    const v = vendaRepository.buscarPorId(3)!
    expect(v.pagamentos[0]).toMatchObject({ formaPagamento: 'CARTÃO', parcelas: 3, comportamento: 'PARCELADO_CLIENTE', bandeiraNome: null })
    expect(v.parcelas).toHaveLength(3)
    expect(v.recebiveisOperadora).toEqual([])
    const vencidas = contaReceberRepository.listar({ apenasVencidas: true }).filter((c) => c.vendaId === 3)
    expect(vencidas.length).toBeGreaterThan(0)
    expect(vencidas.every((c) => c.tipo === 'CLIENTE' && c.vencida)).toBe(true)
  })

  it('cancelar uma venda antiga estorna entrada e parcela paga, como antes', () => {
    vendaRepository.cancelar(1, { usuarioId: 1 })
    expect(um<{ situacao: string }>('SELECT situacao FROM venda WHERE id = 1').situacao).toBe('CANCELADA')
    expect(um<{ n: number }>("SELECT COUNT(*) AS n FROM conta_receber WHERE venda_id = 1 AND situacao <> 'CANCELADA'").n).toBe(0)
    expect(um<{ valor_centavos: number }>("SELECT valor_centavos FROM lancamento WHERE categoria = 'ESTORNO_VENDA'").valor_centavos).toBe(20000 + 14500)
    expect(vendaRepository.buscarPorId(1)?.situacao).toBe('CANCELADA') // cancelada nao some: so a EXCLUIDA some
  })

  it('excluir uma venda antiga: bloqueios listados (à vista e parcela paga) e, sem eles, exclui limpo', () => {
    const tipos = (id: number) => vendaRepository.bloqueiosExclusao(id).map((b) => b.tipo).sort()
    expect(tipos(1)).toEqual(['PAGAMENTO_A_VISTA', 'PARCELA_PAGA'])
    expect(tipos(2)).toEqual(['PAGAMENTO_A_VISTA'])
    expect(tipos(4)).toEqual(['PAGAMENTO_A_VISTA']) // "CHEQUE PRE-DATADO" com 1 parcela entrou como recebido na epoca
    expect(tipos(3)).toEqual([]) // so parcelas em aberto

    vendaRepository.excluir(3, { usuarioId: 1, motivo: null })
    expect(vendaRepository.buscarPorId(3)).toBeNull()
    expect(vendaRepository.listar({}).map((x) => x.numero)).not.toContain('2026-00003')
    expect(um<{ n: number }>("SELECT COUNT(*) AS n FROM conta_receber WHERE venda_id = 3 AND situacao <> 'CANCELADA'").n).toBe(0)
    // a linha continua na tabela: o numero nunca e reaproveitado
    expect(um<{ numero: string }>('SELECT numero FROM venda WHERE id = 3').numero).toBe('2026-00003')
  })

  it('excluir com a liberação estorna o que já tinha entrado na venda antiga', () => {
    vendaRepository.excluir(1, { usuarioId: 1, motivo: 'teste' })
    expect(um<{ valor_centavos: number }>("SELECT valor_centavos FROM lancamento WHERE categoria = 'ESTORNO_VENDA'").valor_centavos).toBe(34500)
    expect(um<{ excluido_motivo: string }>('SELECT excluido_motivo FROM venda WHERE id = 1').excluido_motivo).toBe('teste')
    expect(vendaRepository.bloqueiosExclusao(1)).toEqual([]) // ja cancelada: nada a bloquear
  })
})
