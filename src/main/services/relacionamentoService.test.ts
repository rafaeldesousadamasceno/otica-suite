import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'
import { AppError } from '@main/errors'

const { banco, sessao } = vi.hoisted(() => ({
  banco: { db: null as DatabaseSync | null },
  sessao: { usuario: { id: 0, perfil: 'vendedor' } }
}))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))
// A checagem de permissao em si e coberta em permissions.test.ts - aqui interessa o que o servico FAZ com ela.
vi.mock('@main/auth/session', () => ({ requirePermissao: () => sessao }))

import { relacionamentoService } from './relacionamentoService'

let db: DatabaseSync
const ids: Record<string, number> = {}

function textoDoLink(link: string): string {
  return decodeURIComponent(link.split('?text=')[1])
}

function codigoDoErro(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (err) {
    return err instanceof AppError ? err.code : 'OUTRO'
  }
  return undefined
}

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-19T15:00:00Z'))

  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS) db.exec(m.sql)
  banco.db = db

  sessao.usuario.id = Number(
    db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Atendente', 'at', 'x', 'vendedor')").run().lastInsertRowid
  )
  db.prepare("INSERT INTO empresa (id, nome_fantasia) VALUES (1, 'Ótica Sol')").run()

  const cliente = db.prepare('INSERT INTO cliente (nome, data_nasc, celular) VALUES (:nome, :nasc, :celular)')
  ids.ana = Number(cliente.run({ nome: 'ANA MARIA SILVA', nasc: '1990-09-19', celular: '(11) 98765-4321' }).lastInsertRowid)
  ids.fabio = Number(cliente.run({ nome: 'Fabio Costa', nasc: null, celular: '(11) 3456-7890' }).lastInsertRowid)
  ids.gil = Number(cliente.run({ nome: 'Gil Prado', nasc: null, celular: '(11) 99876-5432' }).lastInsertRowid)

  db.prepare("INSERT INTO ordem_servico (numero, cliente_id, situacao, data_chegada) VALUES ('2026-00001', :c, 'CHEGOU', '2026-09-16')").run({ c: ids.fabio })
  db.prepare("INSERT INTO conta_receber (cliente_id, valor_centavos, vencimento) VALUES (:c, 11000, '2026-08-10')").run({ c: ids.gil })
})

afterAll(() => {
  vi.useRealTimers()
  banco.db?.close()
})

function ref(clienteKey: string) {
  const p = relacionamentoService.listar().find((x) => x.clienteId === ids[clienteKey])!
  return { clienteId: p.clienteId, motivo: p.motivo, referencia: p.referencia }
}

describe('relacionamentoService.linkWhatsapp', () => {
  it('monta o link com o numero normalizado e a mensagem do motivo preenchida (primeiro nome + nome da otica)', () => {
    const link = relacionamentoService.linkWhatsapp(ref('ana'))
    expect(link.startsWith('https://wa.me/5511987654321?text=')).toBe(true)
    const texto = textoDoLink(link)
    expect(texto).toContain('Olá, Ana! Aqui é da Ótica Sol.')
    expect(texto).not.toMatch(/\{\w+\}/) // nenhum placeholder ficou sem preencher
  })

  it('cobranca leva o valor e o vencimento na mensagem', () => {
    const texto = textoDoLink(relacionamentoService.linkWhatsapp(ref('gil')))
    expect(texto).toContain('R$ 110,00')
    expect(texto).toContain('10/08/2026')
  })

  it('cliente com celular invalido nao abre WhatsApp: erro de validacao, nunca um link errado', () => {
    expect(codigoDoErro(() => relacionamentoService.linkWhatsapp(ref('fabio')))).toBe('VALIDACAO')
  })

  it('ocorrencia que nao esta mais pendente da erro de conflito', () => {
    expect(codigoDoErro(() => relacionamentoService.linkWhatsapp({ clienteId: ids.ana, motivo: 'RETIRADA', referencia: '999' }))).toBe('CONFLITO')
  })

  it('usa a mensagem editada pelo administrador', () => {
    relacionamentoService.modelosSalvar({
      RETIRADA: 'r', COBRANCA: 'c', POS_VENDA: 'p', RENOVACAO: 'n',
      ANIVERSARIO: 'Parabéns, {nome}! — {otica}'
    })
    expect(textoDoLink(relacionamentoService.linkWhatsapp(ref('ana')))).toBe('Parabéns, Ana! — Ótica Sol')
  })
})

describe('relacionamentoService - lista, contato e auditoria', () => {
  it('a lista que vai para a tela nao carrega os dados crus da mensagem', () => {
    const lista = relacionamentoService.listar()
    expect(lista.length).toBeGreaterThan(0)
    for (const item of lista) expect(item).not.toHaveProperty('variaveis')
  })

  it('marcar como contatado tira da lista e audita uma vez so', () => {
    const r = ref('gil')
    relacionamentoService.marcarContatado({ ...r, observacao: 'Vai pagar sexta' })
    expect(relacionamentoService.listar().some((p) => p.clienteId === ids.gil)).toBe(false)

    relacionamentoService.marcarContatado(r) // repetir e inofensivo
    const auditorias = db.prepare("SELECT valor_novo FROM auditoria WHERE acao = 'REGISTRAR_CONTATO' AND entidade_id = :id").all({ id: ids.gil })
    expect(auditorias).toHaveLength(1)
    expect(JSON.parse((auditorias[0] as { valor_novo: string }).valor_novo)).toMatchObject({ motivo: 'COBRANCA', observacao: 'Vai pagar sexta' })
  })

  it('opt-out e auditado, e cliente inexistente da erro', () => {
    relacionamentoService.definirAceitaContato({ clienteId: ids.ana, aceita: false })
    expect(relacionamentoService.listar().some((p) => p.clienteId === ids.ana)).toBe(false)
    expect(relacionamentoService.semContato().map((c) => c.id)).toContain(ids.ana)
    expect(db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE acao = 'ALTERAR_CONTATO_CLIENTE'").get()).toEqual({ n: 1 })

    expect(codigoDoErro(() => relacionamentoService.definirAceitaContato({ clienteId: 424242, aceita: false }))).toBe('NAO_ENCONTRADO')
  })

  it('salvar as mensagens registra o antes e o depois na auditoria', () => {
    const linha = db.prepare("SELECT valor_anterior, valor_novo FROM auditoria WHERE acao = 'ALTERAR_MODELOS_MENSAGEM'").get() as {
      valor_anterior: string
      valor_novo: string
    }
    expect(JSON.parse(linha.valor_anterior).ANIVERSARIO).toContain('Feliz aniversário') // o texto padrao da migration
    expect(JSON.parse(linha.valor_novo).ANIVERSARIO).toBe('Parabéns, {nome}! — {otica}')
    expect(relacionamentoService.modelosObter().ANIVERSARIO).toBe('Parabéns, {nome}! — {otica}')
  })
})
