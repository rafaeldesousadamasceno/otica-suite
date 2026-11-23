import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'
import { registrarFuncoesSql } from '@main/db/funcoesSql'
import { AppError } from '@main/errors'
import {
  contaPagarCriarSchema,
  contaPagarEditarSchema,
  contaPagarExcluirSchema,
  contaPagarPagarSchema,
  contasPagarListQuerySchema,
  recorrenciaEncerrarSchema,
  recorrenciaReajustarSchema
} from '@shared/ipc'

const { banco, permissao } = vi.hoisted(() => ({ banco: { db: null as DatabaseSync | null }, permissao: { negar: new Set<string>() } }))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))
vi.mock('@main/auth/session', async () => {
  const { Errors } = await import('@main/errors')
  return {
    requirePermissao: (recurso: string, acao: string) => {
      if (permissao.negar.has(`${recurso}:${acao}`)) throw Errors.semPermissao()
      return { usuario: { id: 1, perfil: 'admin' } }
    }
  }
})

import { contaPagarService } from './contaPagarService'
import { recorrenciaService } from './recorrenciaService'
import { recorrenciaRepository } from '@main/repositories/recorrenciaRepository'
import { financeiroRepository } from '@main/repositories/financeiroRepository'
import { dashboardRepository } from '@main/repositories/dashboardRepository'

/** Define "hoje" (meio-dia, no fuso do computador). */
function hoje(ano: number, mes: number, dia: number): void {
  vi.setSystemTime(new Date(ano, mes - 1, dia, 12, 0, 0))
}

const criar = (extra: Record<string, unknown> = {}) =>
  contaPagarService.criar(
    contaPagarCriarSchema.parse({
      descricao: 'Aluguel',
      categoria: 'ALUGUEL',
      valorCentavos: '1.500,00',
      vencimento: '2026-01-05',
      recorrente: true,
      ...extra
    })
  )

const reajustar = (id: number, valor: string, aPartirDe: string) =>
  recorrenciaService.reajustar(recorrenciaReajustarSchema.parse({ id, valorCentavos: valor, aPartirDe }))

const encerrar = (id: number, dataFim: string) => recorrenciaService.encerrar(recorrenciaEncerrarSchema.parse({ id, dataFim }))

const excluir = (id: number, escopo?: 'SOMENTE_ESTA' | 'ESTA_E_PROXIMAS', motivo?: string) =>
  contaPagarService.excluir(contaPagarExcluirSchema.parse({ id, escopo, motivo }))

const listar = (extra: Record<string, unknown> = {}) => contaPagarService.listar(contasPagarListQuerySchema.parse(extra))

function pagarTudo(id: number, valorCentavos: number): void {
  contaPagarService.pagar(contaPagarPagarSchema.parse({ id, valorCentavos, data: '2026-01-20', formaPagamento: 'PIX' }))
}

interface Linha {
  id: number
  competencia: string | null
  vencimento: string
  valor_centavos: number
  situacao: string
  excluido_em: string | null
  recorrencia_id: number | null
}

/** Todas as contas de uma serie (inclusive as excluidas), por competencia. */
function contasDaSerie(recorrenciaId: number): Linha[] {
  return banco.db!
    .prepare('SELECT id, competencia, vencimento, valor_centavos, situacao, excluido_em, recorrencia_id FROM conta_pagar WHERE recorrencia_id = ? ORDER BY competencia')
    .all(recorrenciaId) as unknown as Linha[]
}

const ativas = (linhas: Linha[]): Linha[] => linhas.filter((l) => l.excluido_em === null)
const valores = (linhas: Linha[]): Record<string, number> => Object.fromEntries(linhas.map((l) => [l.competencia, l.valor_centavos]))

function codigo(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (e) {
    return e instanceof AppError ? e.code : 'OUTRO'
  }
  return undefined
}

function mensagem(fn: () => unknown): string {
  try {
    fn()
  } catch (e) {
    return e instanceof AppError ? e.message : 'OUTRO'
  }
  return ''
}

describe('recorrência de contas a pagar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    hoje(2026, 1, 10)
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    registrarFuncoesSql(db)
    for (const m of MIGRATIONS) db.exec(m.sql)
    db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Ana', 'ana', 'x', 'admin')").run()
    banco.db = db
    permissao.negar.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('criar a recorrência', () => {
    it('cria a série e materializa 12 meses, cada um com o valor da série, em maiúsculas', () => {
      const primeira = criar()
      expect(primeira.competencia).toBe('2026-01')
      expect(primeira.recorrente).toBe(true)
      expect(primeira.descricao).toBe('ALUGUEL')

      const contas = contasDaSerie(primeira.recorrenciaId!)
      expect(contas).toHaveLength(12)
      expect(contas.map((c) => c.competencia)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'])
      expect(contas.every((c) => c.valor_centavos === 150000 && c.situacao === 'ABERTA')).toBe(true)
      expect(contas[0].vencimento).toBe('2026-01-05')
      expect(contas[11].vencimento).toBe('2026-12-05')

      const serie = recorrenciaService.listar()[0]
      expect(serie).toMatchObject({ descricao: 'ALUGUEL', frequencia: 'MENSAL', diaVencimento: 5, status: 'ATIVA', valorAtualCentavos: 150000, abertas: 12 })
      expect(serie.vigencias).toEqual([{ vigenteDesde: '2026-01', valorCentavos: 150000 }])
    })

    it('a despesa avulsa continua sendo uma conta só, sem série', () => {
      const conta = criar({ recorrente: false, descricao: 'Conserto', vencimento: '2026-03-02' })
      expect(conta.recorrente).toBe(false)
      expect(conta.recorrenciaId).toBeNull()
      expect(recorrenciaService.listar()).toEqual([])
      expect((banco.db!.prepare('SELECT COUNT(*) AS n FROM conta_pagar').get() as { n: number }).n).toBe(1)
    })

    it('com início no passado, materializa também os meses entre o início e hoje', () => {
      hoje(2026, 4, 10)
      const primeira = criar({ vencimento: '2026-01-05' })
      const contas = contasDaSerie(primeira.recorrenciaId!)
      expect(contas[0].competencia).toBe('2026-01')
      expect(contas).toHaveLength(15) // jan a dez + jan a mar do ano seguinte (12 a partir de abril, mais 3 passados)
      expect(contas[contas.length - 1].competencia).toBe('2027-03')
    })

    it('valida: valor maior que zero, fim depois do primeiro vencimento, data que existe, fornecedor existente', () => {
      expect(contaPagarCriarSchema.safeParse({ descricao: 'X', valorCentavos: '0', vencimento: '2026-01-05', recorrente: true }).success).toBe(false)
      expect(contaPagarCriarSchema.safeParse({ descricao: 'X', valorCentavos: '10', vencimento: '2026-01-05', recorrente: true, dataFim: '2025-12-31' }).success).toBe(false)
      expect(contaPagarCriarSchema.safeParse({ descricao: 'X', valorCentavos: '10', vencimento: '2026-02-30', recorrente: true }).success).toBe(false)
      expect(contaPagarCriarSchema.safeParse({ descricao: 'X', valorCentavos: '10', vencimento: '2026-02-28', recorrente: true, dataFim: '' }).success).toBe(true)
      expect(codigo(() => criar({ fornecedorId: 999 }))).toBe('NAO_ENCONTRADO')
    })

    it('guarda o fornecedor na série e nas contas', () => {
      banco.db!.prepare("INSERT INTO fornecedor (razao_social) VALUES ('IMOBILIARIA')").run()
      const primeira = criar({ fornecedorId: 1 })
      expect(primeira.fornecedorNome).toBe('IMOBILIARIA')
      expect(recorrenciaService.listar()[0].fornecedorNome).toBe('IMOBILIARIA')
    })

    it('com data de fim, só materializa até ela', () => {
      const primeira = criar({ dataFim: '2026-03-31' })
      expect(contasDaSerie(primeira.recorrenciaId!).map((c) => c.competencia)).toEqual(['2026-01', '2026-02', '2026-03'])
    })
  })

  describe('o job que completa o horizonte', () => {
    it('é idempotente: abrir a lista de novo não duplica nada', () => {
      const primeira = criar()
      listar()
      listar()
      expect(recorrenciaRepository.completarHorizonte()).toBe(0)
      expect(contasDaSerie(primeira.recorrenciaId!)).toHaveLength(12)
    })

    it('com o passar dos meses, acrescenta só os novos', () => {
      const primeira = criar()
      hoje(2026, 3, 1)
      listar()
      const contas = contasDaSerie(primeira.recorrenciaId!)
      expect(contas).toHaveLength(14)
      expect(contas[contas.length - 1].competencia).toBe('2027-02')
    })

    it('não cria meses passados para quem ficou muito tempo sem abrir o sistema', () => {
      const primeira = criar()
      hoje(2027, 6, 1)
      listar()
      const contas = contasDaSerie(primeira.recorrenciaId!)
      const novas = contas.filter((c) => c.competencia! > '2026-12')
      expect(novas.map((c) => c.competencia)).toEqual(['2027-06', '2027-07', '2027-08', '2027-09', '2027-10', '2027-11', '2027-12', '2028-01', '2028-02', '2028-03', '2028-04', '2028-05'])
    })

    it('dia 31: fevereiro vence no último dia (28 ou 29)', () => {
      hoje(2027, 1, 2)
      const primeira = criar({ vencimento: '2027-01-31' })
      const v = Object.fromEntries(contasDaSerie(primeira.recorrenciaId!).map((c) => [c.competencia, c.vencimento]))
      expect(v['2027-01']).toBe('2027-01-31')
      expect(v['2027-02']).toBe('2027-02-28')
      expect(v['2027-04']).toBe('2027-04-30')
      expect(v['2027-12']).toBe('2027-12-31')
    })

    it('anual: uma conta por ano, no mesmo mês', () => {
      hoje(2026, 11, 23)
      const primeira = criar({ descricao: 'Seguro', vencimento: '2026-03-15', frequencia: 'ANUAL' })
      const contas = contasDaSerie(primeira.recorrenciaId!)
      expect(contas.map((c) => c.competencia)).toEqual(['2026-03', '2027-03'])
      expect(contas.map((c) => c.vencimento)).toEqual(['2026-03-15', '2027-03-15'])
      hoje(2027, 4, 1)
      listar()
      expect(contasDaSerie(primeira.recorrenciaId!).map((c) => c.competencia)).toEqual(['2026-03', '2027-03', '2028-03'])
    })

    it('série encerrada não gera mais nada', () => {
      const primeira = criar()
      encerrar(primeira.recorrenciaId!, '2026-03-31')
      hoje(2027, 1, 5)
      listar()
      expect(ativas(contasDaSerie(primeira.recorrenciaId!)).map((c) => c.competencia)).toEqual(['2026-01', '2026-02', '2026-03'])
    })

    it('uma falha do job não derruba a lista', () => {
      criar()
      const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
      const espia = vi.spyOn(recorrenciaRepository, 'completarHorizonte').mockImplementation(() => {
        throw new Error('boom')
      })
      expect(listar().length).toBeGreaterThan(0)
      espia.mockRestore()
      erro.mockRestore()
    })
  })

  describe('reajustar o valor', () => {
    it('aluguel de R$ 1.500,00 reajustado para R$ 1.650,00 a partir de julho: o passado fica, os abertos de julho em diante mudam', () => {
      const primeira = criar()
      const rid = primeira.recorrenciaId!
      const r = reajustar(rid, '1.650,00', '2026-07')
      expect(r.afetadas).toBe(6)

      const v = valores(contasDaSerie(rid))
      for (const m of ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']) expect(v[m]).toBe(150000)
      for (const m of ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12']) expect(v[m]).toBe(165000)

      const serie = recorrenciaService.listar()[0]
      expect(serie.vigencias).toEqual([
        { vigenteDesde: '2026-01', valorCentavos: 150000 },
        { vigenteDesde: '2026-07', valorCentavos: 165000 }
      ])
    })

    it('as contas geradas depois também usam o valor vigente', () => {
      const primeira = criar()
      reajustar(primeira.recorrenciaId!, '1.650,00', '2026-07')
      hoje(2027, 1, 3)
      listar()
      const v = valores(contasDaSerie(primeira.recorrenciaId!))
      expect(v['2027-01']).toBe(165000)
      expect(v['2027-12']).toBe(165000)
    })

    it('conta paga (inteira ou em parte) nunca é alterada', () => {
      const primeira = criar()
      const rid = primeira.recorrenciaId!
      const contas = contasDaSerie(rid)
      const julho = contas.find((c) => c.competencia === '2026-07')!
      const agosto = contas.find((c) => c.competencia === '2026-08')!
      pagarTudo(julho.id, 150000)
      contaPagarService.pagar(contaPagarPagarSchema.parse({ id: agosto.id, valorCentavos: 50000, data: '2026-01-20', formaPagamento: 'PIX' }))

      reajustar(rid, '1.650,00', '2026-07')
      const v = valores(contasDaSerie(rid))
      expect(v['2026-07']).toBe(150000) // paga
      expect(v['2026-08']).toBe(150000) // com pagamento parcial
      expect(v['2026-09']).toBe(165000)
      expect(contasDaSerie(rid).find((c) => c.competencia === '2026-07')!.situacao).toBe('PAGA')
    })

    it('um reajuste mais antigo substitui as vigências marcadas para depois', () => {
      const primeira = criar()
      const rid = primeira.recorrenciaId!
      reajustar(rid, '1.650,00', '2026-07')
      reajustar(rid, '1.600,00', '2026-04')
      const v = valores(contasDaSerie(rid))
      expect(v['2026-03']).toBe(150000)
      expect(v['2026-04']).toBe(160000)
      expect(v['2026-09']).toBe(160000)
      expect(recorrenciaService.listar()[0].vigencias).toEqual([
        { vigenteDesde: '2026-01', valorCentavos: 150000 },
        { vigenteDesde: '2026-04', valorCentavos: 160000 }
      ])
    })

    it('a mesma competência reajustada duas vezes troca o valor, sem duplicar a vigência', () => {
      const primeira = criar()
      reajustar(primeira.recorrenciaId!, '1.650,00', '2026-07')
      reajustar(primeira.recorrenciaId!, '1.700,00', '2026-07')
      expect(recorrenciaService.listar()[0].vigencias).toHaveLength(2)
      expect(valores(contasDaSerie(primeira.recorrenciaId!))['2026-12']).toBe(170000)
    })

    it('aceita uma data no lugar da competência e recusa mês antes do início, série encerrada e valor zero', () => {
      const primeira = criar()
      const rid = primeira.recorrenciaId!
      reajustar(rid, '1.650,00', '2026-07-15')
      expect(valores(contasDaSerie(rid))['2026-07']).toBe(165000)
      expect(recorrenciaReajustarSchema.safeParse({ id: rid, valorCentavos: '10', aPartirDe: 'julho' }).success).toBe(false)
      expect(recorrenciaReajustarSchema.safeParse({ id: rid, valorCentavos: '0', aPartirDe: '2026-07' }).success).toBe(false)
      expect(codigo(() => reajustar(rid, '10,00', '2025-12'))).toBe('VALIDACAO')
      encerrar(rid, '2026-12-31')
      expect(codigo(() => reajustar(rid, '10,00', '2026-08'))).toBe('CONFLITO')
    })
  })

  describe('encerrar a recorrência', () => {
    it('encerramento em setembro: os abertos de outubro em diante saem (exclusão lógica); o resto fica', () => {
      const primeira = criar()
      const rid = primeira.recorrenciaId!
      const contas = contasDaSerie(rid)
      pagarTudo(contas[0].id, 150000) // janeiro paga

      const r = encerrar(rid, '2026-09-30')
      expect(r.afetadas).toBe(3)

      const depois = contasDaSerie(rid)
      expect(ativas(depois).map((c) => c.competencia)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
      expect(depois.filter((c) => c.excluido_em !== null).map((c) => c.competencia)).toEqual(['2026-10', '2026-11', '2026-12'])
      expect(depois).toHaveLength(12) // nada foi apagado de verdade

      const serie = recorrenciaService.listar()[0]
      expect(serie).toMatchObject({ status: 'ENCERRADA', dataFim: '2026-09-30', abertas: 8 })
      expect(listar({ incluirFuturas: true }).filter((c) => c.competencia! >= '2026-10')).toEqual([])
    })

    it('conta em aberto com pagamento parcial depois da data de fim não é removida', () => {
      const primeira = criar()
      const rid = primeira.recorrenciaId!
      const out = contasDaSerie(rid).find((c) => c.competencia === '2026-10')!
      contaPagarService.pagar(contaPagarPagarSchema.parse({ id: out.id, valorCentavos: 1000, data: '2026-01-20', formaPagamento: 'PIX' }))
      expect(encerrar(rid, '2026-09-30').afetadas).toBe(2)
      expect(ativas(contasDaSerie(rid)).map((c) => c.competencia)).toContain('2026-10')
    })

    it('recusa encerrar duas vezes e data antes do início', () => {
      const primeira = criar()
      expect(codigo(() => encerrar(primeira.recorrenciaId!, '2025-12-31'))).toBe('VALIDACAO')
      encerrar(primeira.recorrenciaId!, '2026-09-30')
      expect(codigo(() => encerrar(primeira.recorrenciaId!, '2026-10-31'))).toBe('CONFLITO')
    })

    it('depois de encerrar, dá para criar uma série nova com a mesma categoria e outra descrição', () => {
      const primeira = criar()
      encerrar(primeira.recorrenciaId!, '2026-06-30')
      const nova = criar({ descricao: 'Aluguel novo endereço', vencimento: '2026-07-10', valorCentavos: '1.800,00' })
      expect(nova.recorrenciaId).not.toBe(primeira.recorrenciaId)
      expect(recorrenciaService.listar().map((s) => [s.descricao, s.status])).toEqual([
        ['ALUGUEL NOVO ENDEREÇO', 'ATIVA'],
        ['ALUGUEL', 'ENCERRADA']
      ])
    })
  })

  describe('excluir uma conta', () => {
    it('"somente esta" em agosto: o job NÃO recria agosto, nem depois de rodar de novo', () => {
      const primeira = criar()
      const rid = primeira.recorrenciaId!
      const agosto = contasDaSerie(rid).find((c) => c.competencia === '2026-08')!

      const r = excluir(agosto.id, 'SOMENTE_ESTA', 'Mês sem aluguel')
      expect(r.afetadas).toBe(1)

      listar()
      listar()
      recorrenciaRepository.completarHorizonte()
      hoje(2026, 8, 20)
      listar()

      const contas = contasDaSerie(rid)
      const agostos = contas.filter((c) => c.competencia === '2026-08')
      expect(agostos).toHaveLength(1)
      expect(agostos[0].excluido_em).not.toBeNull()
      expect(listar({ incluirFuturas: true }).map((c) => c.competencia)).not.toContain('2026-08')
      expect(
        (banco.db!.prepare('SELECT excluido_motivo FROM conta_pagar WHERE id = ?').get(agosto.id) as { excluido_motivo: string }).excluido_motivo
      ).toBe('Mês sem aluguel')
      expect(recorrenciaService.listar()[0].status).toBe('ATIVA')
    })

    it('"esta e as próximas": exclui a conta e as abertas seguintes, encerra a série no fim do mês anterior e preserva o passado e o pago', () => {
      const primeira = criar()
      const rid = primeira.recorrenciaId!
      const contas = contasDaSerie(rid)
      const nov = contas.find((c) => c.competencia === '2026-11')!
      pagarTudo(nov.id, 150000) // paga adiantada, depois do ponto de corte
      const julho = contas.find((c) => c.competencia === '2026-07')!

      const r = excluir(julho.id, 'ESTA_E_PROXIMAS')
      expect(r.afetadas).toBe(5) // julho, agosto, setembro, outubro, dezembro (novembro esta paga)

      const depois = contasDaSerie(rid)
      expect(ativas(depois).map((c) => c.competencia)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-11'])
      expect(depois.find((c) => c.competencia === '2026-11')!.situacao).toBe('PAGA')
      expect(recorrenciaService.listar()[0]).toMatchObject({ status: 'ENCERRADA', dataFim: '2026-06-30' })

      hoje(2027, 2, 1)
      listar()
      expect(ativas(contasDaSerie(rid)).map((c) => c.competencia)).not.toContain('2027-02')
    })

    it('conta PAGA não é excluída: o servidor bloqueia e orienta a estornar o pagamento', () => {
      const primeira = criar()
      pagarTudo(primeira.id, 150000)
      expect(codigo(() => excluir(primeira.id))).toBe('CONFLITO')
      expect(mensagem(() => excluir(primeira.id))).toContain('Estorne o pagamento')
      expect(listar().find((c) => c.id === primeira.id)).toBeDefined()
    })

    it('conta com pagamento parcial também não é excluída', () => {
      const avulsa = criar({ recorrente: false, vencimento: '2026-02-01' })
      contaPagarService.pagar(contaPagarPagarSchema.parse({ id: avulsa.id, valorCentavos: 1000, data: '2026-01-20', formaPagamento: 'PIX' }))
      expect(codigo(() => excluir(avulsa.id))).toBe('CONFLITO')
    })

    it('conta avulsa: exclusão lógica, some da lista e fica registrada', () => {
      const avulsa = criar({ recorrente: false, descricao: 'Conserto', vencimento: '2026-02-01' })
      expect(excluir(avulsa.id, undefined, 'Lançada em duplicidade').afetadas).toBe(1)
      expect(listar().find((c) => c.id === avulsa.id)).toBeUndefined()
      const linha = banco.db!.prepare('SELECT excluido_em, excluido_motivo FROM conta_pagar WHERE id = ?').get(avulsa.id) as { excluido_em: string | null; excluido_motivo: string }
      expect(linha.excluido_em).not.toBeNull()
      expect(linha.excluido_motivo).toBe('Lançada em duplicidade')
      expect(codigo(() => excluir(avulsa.id))).toBe('NAO_ENCONTRADO') // já excluída
    })

    it('avulsa com escopo de série informado: o escopo é ignorado (só ela sai)', () => {
      const avulsa = criar({ recorrente: false, vencimento: '2026-02-01' })
      const outra = criar({ recorrente: false, descricao: 'Outra', vencimento: '2026-02-02' })
      expect(excluir(avulsa.id, 'ESTA_E_PROXIMAS').afetadas).toBe(1)
      expect(listar().find((c) => c.id === outra.id)).toBeDefined()
    })

    it('conta gerada por compra não é excluída', () => {
      banco.db!.prepare("INSERT INTO fornecedor (razao_social) VALUES ('F')").run()
      banco.db!.prepare("INSERT INTO compra (fornecedor_id, data, situacao) VALUES (1, '2026-01-01', 'CONFIRMADA')").run()
      banco.db!.prepare("INSERT INTO conta_pagar (compra_id, descricao, valor_centavos, vencimento) VALUES (1, 'COMPRA', 100, '2026-02-01')").run()
      expect(codigo(() => excluir(1))).toBe('CONFLITO')
    })
  })

  describe('editar uma conta recorrente', () => {
    const editar = (id: number, escopo: 'SOMENTE_ESTE' | 'ESTE_E_PROXIMOS', valor: string, vencimento?: string) =>
      contaPagarService.editar(contaPagarEditarSchema.parse({ id, escopo, valorCentavos: valor, vencimento }))

    it('"somente este": muda só esta conta (valor e vencimento) e o resto fica', () => {
      const primeira = criar()
      const rid = primeira.recorrenciaId!
      const marco = contasDaSerie(rid).find((c) => c.competencia === '2026-03')!
      const nova = editar(marco.id, 'SOMENTE_ESTE', '1.555,55', '2026-03-12')
      expect(nova.valorCentavos).toBe(155555)
      expect(nova.vencimento).toBe('2026-03-12')
      expect(nova.competencia).toBe('2026-03')
      const v = valores(contasDaSerie(rid))
      expect(v['2026-02']).toBe(150000)
      expect(v['2026-04']).toBe(150000)
      expect(recorrenciaService.listar()[0].vigencias).toHaveLength(1)
    })

    it('"este e os próximos": é um reajuste a partir da competência desta conta', () => {
      const primeira = criar()
      const rid = primeira.recorrenciaId!
      const abril = contasDaSerie(rid).find((c) => c.competencia === '2026-04')!
      editar(abril.id, 'ESTE_E_PROXIMOS', '1.700,00')
      const v = valores(contasDaSerie(rid))
      expect(v['2026-03']).toBe(150000)
      expect(v['2026-04']).toBe(170000)
      expect(v['2026-12']).toBe(170000)
      expect(recorrenciaService.listar()[0].vigencias).toEqual([
        { vigenteDesde: '2026-01', valorCentavos: 150000 },
        { vigenteDesde: '2026-04', valorCentavos: 170000 }
      ])
      expect(codigo(() => editar(abril.id, 'ESTE_E_PROXIMOS', '1.700,00', '2026-04-20'))).toBe('VALIDACAO')
    })

    it('não existe "todos": o passado pago não muda em nenhum escopo', () => {
      const primeira = criar()
      const rid = primeira.recorrenciaId!
      pagarTudo(primeira.id, 150000)
      expect(codigo(() => editar(primeira.id, 'SOMENTE_ESTE', '9,00'))).toBe('CONFLITO')
      expect(codigo(() => editar(primeira.id, 'ESTE_E_PROXIMOS', '9,00'))).toBe('CONFLITO')
      expect(contasDaSerie(rid)[0].valor_centavos).toBe(150000)
      expect(contaPagarEditarSchema.safeParse({ id: 1, escopo: 'TODOS', valorCentavos: '1' }).success).toBe(false)
    })

    it('conta avulsa não é editável por aqui', () => {
      const avulsa = criar({ recorrente: false, vencimento: '2026-02-01' })
      expect(codigo(() => editar(avulsa.id, 'SOMENTE_ESTE', '1,00'))).toBe('VALIDACAO')
    })
  })

  describe('a lista e os indicadores', () => {
    it('por padrão a lista mostra as recorrentes só até o mês seguinte; "mostrar futuras" traz tudo', () => {
      criar()
      const padrao = listar()
      expect(padrao.map((c) => c.competencia)).toEqual(['2026-01', '2026-02'])
      expect(listar({ incluirFuturas: true })).toHaveLength(12)
    })

    it('conta avulsa com vencimento distante continua aparecendo por padrão', () => {
      criar({ recorrente: false, descricao: 'Parcelado', vencimento: '2026-11-10' })
      expect(listar().map((c) => c.descricao)).toEqual(['PARCELADO'])
    })

    it('pagar uma conta recorrente NÃO gera mais a próxima (quem gera é o job)', () => {
      const primeira = criar()
      const antes = contasDaSerie(primeira.recorrenciaId!).length
      pagarTudo(primeira.id, 150000)
      expect(contasDaSerie(primeira.recorrenciaId!)).toHaveLength(antes)
      expect((banco.db!.prepare('SELECT COUNT(*) AS n FROM conta_pagar').get() as { n: number }).n).toBe(antes)
    })

    it('contas futuras e excluídas não distorcem o painel nem o resultado do período', () => {
      const primeira = criar() // hoje = 10/01; jan vence dia 05 (vencida)
      const rid = primeira.recorrenciaId!
      const pos = dashboardRepository.posicao(null, true)
      expect(pos.pagar).toMatchObject({ vencidasQtd: 1, vencidasCentavos: 150000, hojeQtd: 0 })

      // Resultado por competencia de janeiro: so a conta de janeiro.
      expect(financeiroRepository.despesaContasPagarPorPeriodo('2026-01-01', '2026-01-31')).toBe(150000)

      // Excluida some dos dois.
      excluir(primeira.id)
      expect(dashboardRepository.posicao(null, true).pagar).toMatchObject({ vencidasQtd: 0, vencidasCentavos: 0 })
      expect(financeiroRepository.despesaContasPagarPorPeriodo('2026-01-01', '2026-01-31')).toBe(0)
      expect(financeiroRepository.despesasContasPagarPorCategoria('2026-01-01', '2026-12-31').reduce((s, c) => s + c.totalCentavos, 0)).toBe(11 * 150000)
      expect(contasDaSerie(rid)).toHaveLength(12)
    })
  })

  describe('permissões e auditoria', () => {
    it('cada ação confere a permissão no servidor', () => {
      const primeira = criar()
      const conta = contasDaSerie(primeira.recorrenciaId!)[3]
      permissao.negar.add('contas_pagar:criar')
      expect(codigo(() => criar())).toBe('SEM_PERMISSAO')
      permissao.negar.add('contas_pagar:editar')
      expect(codigo(() => reajustar(primeira.recorrenciaId!, '10,00', '2026-05'))).toBe('SEM_PERMISSAO')
      expect(codigo(() => encerrar(primeira.recorrenciaId!, '2026-09-30'))).toBe('SEM_PERMISSAO')
      expect(codigo(() => contaPagarService.editar(contaPagarEditarSchema.parse({ id: conta.id, escopo: 'SOMENTE_ESTE', valorCentavos: '1' })))).toBe('SEM_PERMISSAO')
      permissao.negar.add('contas_pagar:excluir')
      expect(codigo(() => excluir(conta.id))).toBe('SEM_PERMISSAO')
      permissao.negar.add('contas_pagar:ver')
      expect(codigo(() => listar())).toBe('SEM_PERMISSAO')
      expect(codigo(() => recorrenciaService.listar())).toBe('SEM_PERMISSAO')
      expect(contasDaSerie(primeira.recorrenciaId!)[3].excluido_em).toBeNull()
    })

    it('reajuste, encerramento, edição e exclusão ficam na auditoria', () => {
      const primeira = criar()
      const rid = primeira.recorrenciaId!
      const contas = contasDaSerie(rid)
      reajustar(rid, '1.650,00', '2026-07')
      contaPagarService.editar(contaPagarEditarSchema.parse({ id: contas[2].id, escopo: 'SOMENTE_ESTE', valorCentavos: '1' }))
      excluir(contas[3].id)
      encerrar(rid, '2026-09-30')
      const linhas = banco.db!.prepare('SELECT acao, entidade FROM auditoria ORDER BY id').all() as { acao: string; entidade: string }[]
      expect(linhas).toEqual([
        { acao: 'CRIAR', entidade: 'recorrencia' },
        { acao: 'REAJUSTAR', entidade: 'recorrencia' },
        { acao: 'ATUALIZAR', entidade: 'conta_pagar' },
        { acao: 'EXCLUIR', entidade: 'conta_pagar' },
        { acao: 'ENCERRAR', entidade: 'recorrencia' }
      ])
    })
  })
})
