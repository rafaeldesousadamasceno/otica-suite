import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { MIGRATIONS } from '@main/db/migrations'
import { registrarFuncoesSql } from '@main/db/funcoesSql'
import { padronizarTextos } from '@main/db/padronizarTextos'

const banco = vi.hoisted(() => ({ db: null as unknown as DatabaseSync }))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))

import { clienteRepository } from './clienteRepository'
import { fornecedorRepository } from './fornecedorRepository'

// Banco em memoria com o schema real e a MESMA funcao SQL que o app registra.
beforeEach(() => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  registrarFuncoesSql(db)
  for (const m of MIGRATIONS) db.exec(m.sql)
  banco.db = db
})

function novoCliente(nome: string): number {
  return clienteRepository.criar({ nome } as Parameters<typeof clienteRepository.criar>[0], 1)
}

describe('busca sem acento', () => {
  beforeEach(() => {
    banco.db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('A', 'a', 'x', 'admin')").run()
    novoCliente('Príscila Alves')
    novoCliente('Priscila Souza')
    novoCliente('Álvaro Lima')
    novoCliente('Zélia Costa')
  })

  const nomes = (busca: string) => clienteRepository.listar(busca, false).map((c) => c.nome)

  it('sem acento acha o nome salvo com acento', () => {
    expect(nomes('priscila')).toEqual(['PRÍSCILA ALVES', 'PRISCILA SOUZA'])
  })

  it('com acento tambem acha o nome salvo sem acento', () => {
    expect(nomes('príscila')).toHaveLength(2)
    expect(nomes('PRÍSCILA')).toHaveLength(2)
  })

  it('a letra continua precisando corresponder', () => {
    expect(nomes('prescila')).toEqual([])
    expect(nomes('alvaro')).toEqual(['ÁLVARO LIMA'])
  })

  it('ordena ignorando acento (Á vem junto do A, nao depois do Z)', () => {
    expect(nomes('')).toEqual(['ÁLVARO LIMA', 'PRÍSCILA ALVES', 'PRISCILA SOUZA', 'ZÉLIA COSTA'])
  })

  it('o cadastro grava o nome em maiusculas', () => {
    const [primeiro] = clienteRepository.listar('alvaro', false)
    expect(primeiro.nome).toBe('ÁLVARO LIMA')
  })

  it('fornecedor: grava em maiusculas e busca sem acento', () => {
    fornecedorRepository.criar({ razaoSocial: 'Óptica São José', contato: 'maria' } as Parameters<typeof fornecedorRepository.criar>[0])
    const [f] = fornecedorRepository.listar({ busca: 'sao jose' })
    expect(f.razaoSocial).toBe('ÓPTICA SÃO JOSÉ')
    expect(f.contato).toBe('MARIA')
  })
})

describe('padronizarTextos (dados ja salvos)', () => {
  it('passa para maiusculas com acento, uma unica vez', () => {
    const db = banco.db
    db.prepare("INSERT INTO cliente (nome, cidade, email) VALUES ('Príscila Alves', 'são paulo', 'ana@x.com')").run()
    db.prepare("INSERT INTO produto (descricao, categoria, unidade, custo_centavos, margem, preco_venda_centavos, estoque_minimo) VALUES ('Armação Ray', 'armacao', 'UN', 0, 0, 0, 0)").run()

    padronizarTextos(db)
    const c = db.prepare('SELECT nome, cidade, email FROM cliente').get() as { nome: string; cidade: string; email: string }
    expect(c.nome).toBe('PRÍSCILA ALVES')
    expect(c.cidade).toBe('SÃO PAULO')
    expect(c.email).toBe('ana@x.com') // e-mail nao e maiusculo
    expect((db.prepare('SELECT descricao FROM produto').get() as { descricao: string }).descricao).toBe('ARMAÇÃO RAY')

    // segunda abertura nao mexe de novo: o que for digitado depois fica como esta
    db.prepare("UPDATE cliente SET nome = 'minúsculo'").run()
    padronizarTextos(db)
    expect((db.prepare('SELECT nome FROM cliente').get() as { nome: string }).nome).toBe('minúsculo')
  })
})
