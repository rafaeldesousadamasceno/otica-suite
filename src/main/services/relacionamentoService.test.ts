import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('relacionamentoService - contatados e desfazer', () => {
  let adminId: number
  let outroId: number
  let meuId: number
  const comoVendedor = (): void => {
    sessao.usuario.id = meuId
    sessao.usuario.perfil = 'vendedor'
  }
  const comoAdmin = (): void => {
    sessao.usuario.id = adminId
    sessao.usuario.perfil = 'admin'
  }

  function contatoEm(clienteId: number, motivo: string, referencia: string, criadoEm: string, usuarioId: number | null): number {
    return Number(
      db
        .prepare(
          `INSERT INTO contato (cliente_id, motivo, referencia, observacao, usuario_id, criado_em)
           VALUES (:clienteId, :motivo, :referencia, 'anotacao', :usuarioId, :criadoEm)`
        )
        .run({ clienteId, motivo, referencia, usuarioId, criadoEm }).lastInsertRowid
    )
  }

  beforeAll(() => {
    meuId = sessao.usuario.id
    const usuario = db.prepare('INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES (:nome, :login, :s, :perfil)')
    adminId = Number(usuario.run({ nome: 'Chefe', login: 'chefe', s: 'x', perfil: 'admin' }).lastInsertRowid)
    outroId = Number(usuario.run({ nome: 'Outro Vendedor', login: 'outro', s: 'x', perfil: 'vendedor' }).lastInsertRowid)
  })

  it('lista so os ultimos 30 dias, do mais recente para o mais antigo, e diz quem pode desfazer', () => {
    comoVendedor()
    const c = Number(db.prepare("INSERT INTO cliente (nome, celular) VALUES ('Contatado Janela', '(11) 98888-7777')").run().lastInsertRowid)
    // "agora" nestes testes e 2026-09-19 15:00Z: o corte e 2026-08-20 15:00
    const fora = contatoEm(c, 'RENOVACAO', 'a', '2026-08-20 14:59:59', meuId)
    const dentroAntigo = contatoEm(c, 'POS_VENDA', 'b', '2026-08-20 15:00:00', outroId)
    const dentroRecente = contatoEm(c, 'ANIVERSARIO', 'c', '2026-09-19 12:00:00', meuId)
    const semUsuario = contatoEm(c, 'COBRANCA', 'd', '2026-09-01 08:00:00', null)

    const lista = relacionamentoService.contatados().filter((x) => x.clienteId === c)
    expect(lista.map((x) => x.id)).toEqual([dentroRecente, semUsuario, dentroAntigo])
    expect(lista.map((x) => x.id)).not.toContain(fora)
    expect(lista.map((x) => x.podeDesfazer)).toEqual([true, false, false]) // so o proprio: de outro usuario e sem usuario, nao
    expect(lista[0]).toMatchObject({ clienteNome: 'Contatado Janela', usuarioNome: 'Atendente', observacao: 'anotacao' })
    expect(lista[0]).not.toHaveProperty('usuarioId')

    comoAdmin()
    expect(relacionamentoService.contatados().filter((x) => x.clienteId === c).every((x) => x.podeDesfazer)).toBe(true)
    comoVendedor()
  })

  it('desfazer devolve a pessoa a lista de pendentes e grava na auditoria com o valor anterior', () => {
    comoVendedor()
    const r = ref('fabio')
    relacionamentoService.marcarContatado({ ...r, observacao: 'engano' })
    expect(relacionamentoService.listar().some((p) => p.clienteId === ids.fabio)).toBe(false)

    const feito = relacionamentoService.contatados().find((x) => x.clienteId === ids.fabio)!
    expect(feito).toMatchObject({ motivo: 'RETIRADA', observacao: 'engano', podeDesfazer: true })

    relacionamentoService.desfazerContato({ id: feito.id })
    expect(relacionamentoService.listar().some((p) => p.clienteId === ids.fabio)).toBe(true)
    expect(relacionamentoService.contatados().some((x) => x.id === feito.id)).toBe(false)

    const auditoria = db.prepare("SELECT usuario_id, entidade, entidade_id, valor_anterior FROM auditoria WHERE acao = 'DESFAZER_CONTATO'").all() as {
      usuario_id: number
      entidade: string
      entidade_id: number
      valor_anterior: string
    }[]
    expect(auditoria).toHaveLength(1)
    expect(auditoria[0]).toMatchObject({ usuario_id: meuId, entidade: 'contato', entidade_id: feito.id })
    expect(JSON.parse(auditoria[0].valor_anterior)).toMatchObject({ clienteId: ids.fabio, motivo: 'RETIRADA', observacao: 'engano', usuarioId: meuId })
  })

  it('vendedor nao desfaz contato de outro usuario nem o antigo sem usuario; o administrador desfaz', () => {
    comoVendedor()
    const c = Number(db.prepare("INSERT INTO cliente (nome) VALUES ('Contatado Alheio')").run().lastInsertRowid)
    const doOutro = contatoEm(c, 'POS_VENDA', 'x', '2026-09-18 10:00:00', outroId)
    const semUsuario = contatoEm(c, 'RENOVACAO', 'y', '2026-09-18 10:00:00', null)
    const existe = (id: number): boolean => db.prepare('SELECT 1 FROM contato WHERE id = :id').get({ id }) !== undefined

    expect(codigoDoErro(() => relacionamentoService.desfazerContato({ id: doOutro }))).toBe('SEM_PERMISSAO')
    expect(codigoDoErro(() => relacionamentoService.desfazerContato({ id: semUsuario }))).toBe('SEM_PERMISSAO')
    expect(existe(doOutro) && existe(semUsuario)).toBe(true)

    comoAdmin()
    relacionamentoService.desfazerContato({ id: doOutro })
    relacionamentoService.desfazerContato({ id: semUsuario })
    expect(existe(doOutro) || existe(semUsuario)).toBe(false)
    comoVendedor()
  })

  it('id inexistente da NAO_ENCONTRADO e nao grava auditoria', () => {
    const contar = (): unknown => db.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE acao = 'DESFAZER_CONTATO'").get()
    const antes = contar()
    expect(codigoDoErro(() => relacionamentoService.desfazerContato({ id: 987654 }))).toBe('NAO_ENCONTRADO')
    expect(contar()).toEqual(antes)
  })
})

describe('relacionamentoService.linkWhatsappAniversario (tela Aniversariantes)', () => {
  // Os testes de antes deixam clientes marcados como "nao contatar": este bloco parte sempre do estado limpo.
  beforeEach(() => {
    db.prepare('UPDATE cliente SET aceita_contato = 1, ativo = 1').run()
  })

  it('monta o link com a mensagem de aniversário (primeiro nome e ótica), mesmo para quem NÃO está na lista de hoje', () => {
    // Fábio e Gil não fazem aniversário hoje (sem data): o link não depende de estar pendente em Relacionamento.
    const link = relacionamentoService.linkWhatsappAniversario(ids.gil)
    expect(link.startsWith('https://wa.me/5511998765432?text=')).toBe(true)
    const texto = textoDoLink(link)
    expect(texto).toContain('Gil')
    expect(texto).toContain('Ótica Sol')
    expect(texto).not.toMatch(/\{\w+\}/)
  })

  it('usa a mensagem de aniversário editada pelo administrador', () => {
    db.prepare("INSERT INTO configuracao (chave, valor) VALUES ('relacionamento_msg_aniversario', 'Parabéns, {nome}! Da {otica}.') ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").run()
    expect(textoDoLink(relacionamentoService.linkWhatsappAniversario(ids.ana))).toBe('Parabéns, Ana! Da Ótica Sol.')
  })

  it('celular fixo ou inválido: erro de validação, nunca um link errado', () => {
    expect(codigoDoErro(() => relacionamentoService.linkWhatsappAniversario(ids.fabio))).toBe('VALIDACAO')
  })

  it('quem pediu para não ser contatado não recebe link; cliente inexistente ou inativo dá NAO_ENCONTRADO', () => {
    db.prepare('UPDATE cliente SET aceita_contato = 0 WHERE id = ?').run(ids.gil)
    expect(codigoDoErro(() => relacionamentoService.linkWhatsappAniversario(ids.gil))).toBe('VALIDACAO')
    db.prepare('UPDATE cliente SET aceita_contato = 1 WHERE id = ?').run(ids.gil)

    expect(codigoDoErro(() => relacionamentoService.linkWhatsappAniversario(9999))).toBe('NAO_ENCONTRADO')
    db.prepare('UPDATE cliente SET ativo = 0 WHERE id = ?').run(ids.gil)
    expect(codigoDoErro(() => relacionamentoService.linkWhatsappAniversario(ids.gil))).toBe('NAO_ENCONTRADO')
    db.prepare('UPDATE cliente SET ativo = 1 WHERE id = ?').run(ids.gil)
  })

  it('não registra contato nem mexe na lista de Relacionamento', () => {
    const antes = (db.prepare('SELECT COUNT(*) AS n FROM contato').get() as { n: number }).n
    relacionamentoService.linkWhatsappAniversario(ids.ana)
    expect((db.prepare('SELECT COUNT(*) AS n FROM contato').get() as { n: number }).n).toBe(antes)
  })
})
