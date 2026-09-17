import { getDb } from '@main/db/connection'
import type { Cliente, ClienteResumo } from '@shared/types'
import type { ClienteInput } from '@shared/ipc'

interface ClienteRow {
  id: number
  nome: string
  data_nasc: string | null
  cpf: string | null
  rg: string | null
  celular: string | null
  telefone: string | null
  email: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
  profissao: string | null
  indicado_por: string | null
  observacao: string | null
  ativo: number
  criado_em: string
}

function toDomain(row: ClienteRow): Cliente {
  return {
    id: row.id,
    nome: row.nome,
    dataNasc: row.data_nasc,
    cpf: row.cpf,
    rg: row.rg,
    celular: row.celular,
    telefone: row.telefone,
    email: row.email,
    logradouro: row.logradouro,
    numero: row.numero,
    complemento: row.complemento,
    bairro: row.bairro,
    cidade: row.cidade,
    uf: row.uf,
    cep: row.cep,
    profissao: row.profissao,
    indicadoPor: row.indicado_por,
    observacao: row.observacao,
    ativo: row.ativo === 1,
    criadoEm: row.criado_em
  }
}

function normalizar(campo: string | null | undefined): string | null {
  const v = campo?.trim()
  return v ? v : null
}

export const clienteRepository = {
  listar(busca: string, apenasAtivos: boolean): ClienteResumo[] {
    const termo = `%${busca}%`
    const rows = getDb()
      .prepare(
        `SELECT id, nome, celular, cpf, data_nasc
         FROM cliente
         WHERE (:apenasAtivos = 0 OR ativo = 1)
           AND (nome LIKE :termo OR cpf LIKE :termo OR celular LIKE :termo)
         ORDER BY nome
         LIMIT 200`
      )
      .all({ termo, apenasAtivos: apenasAtivos ? 1 : 0 }) as {
      id: number
      nome: string
      celular: string | null
      cpf: string | null
      data_nasc: string | null
    }[]

    return rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      celular: r.celular,
      cpf: r.cpf,
      dataNasc: r.data_nasc
    }))
  },

  buscarPorId(id: number): Cliente | null {
    const row = getDb().prepare('SELECT * FROM cliente WHERE id = :id').get({ id }) as
      | ClienteRow
      | undefined
    return row ? toDomain(row) : null
  },

  cpfEmUsoPorOutro(cpf: string, ignorarId?: number): boolean {
    const row = getDb()
      .prepare('SELECT id FROM cliente WHERE cpf = :cpf AND id != :ignorarId')
      .get({ cpf, ignorarId: ignorarId ?? -1 })
    return row !== undefined
  },

  criar(data: ClienteInput, criadoPor: number): number {
    const info = getDb()
      .prepare(
        `INSERT INTO cliente (
           nome, data_nasc, cpf, rg, celular, telefone, email,
           logradouro, numero, complemento, bairro, cidade, uf, cep,
           profissao, indicado_por, observacao, criado_por
         ) VALUES (
           :nome, :dataNasc, :cpf, :rg, :celular, :telefone, :email,
           :logradouro, :numero, :complemento, :bairro, :cidade, :uf, :cep,
           :profissao, :indicadoPor, :observacao, :criadoPor
         )`
      )
      .run({
        nome: data.nome.trim().toUpperCase(),
        dataNasc: normalizar(data.dataNasc),
        cpf: normalizar(data.cpf),
        rg: normalizar(data.rg),
        celular: normalizar(data.celular),
        telefone: normalizar(data.telefone),
        email: normalizar(data.email),
        logradouro: normalizar(data.logradouro)?.toUpperCase() ?? null,
        numero: normalizar(data.numero),
        complemento: normalizar(data.complemento)?.toUpperCase() ?? null,
        bairro: normalizar(data.bairro)?.toUpperCase() ?? null,
        cidade: normalizar(data.cidade)?.toUpperCase() ?? null,
        uf: normalizar(data.uf)?.toUpperCase() ?? null,
        cep: normalizar(data.cep),
        profissao: normalizar(data.profissao)?.toUpperCase() ?? null,
        indicadoPor: normalizar(data.indicadoPor)?.toUpperCase() ?? null,
        observacao: normalizar(data.observacao),
        criadoPor
      })
    return Number(info.lastInsertRowid)
  },

  atualizar(id: number, data: ClienteInput, atualizadoPor: number): void {
    getDb()
      .prepare(
        `UPDATE cliente SET
           nome = :nome, data_nasc = :dataNasc, cpf = :cpf, rg = :rg,
           celular = :celular, telefone = :telefone, email = :email,
           logradouro = :logradouro, numero = :numero, complemento = :complemento,
           bairro = :bairro, cidade = :cidade, uf = :uf, cep = :cep,
           profissao = :profissao, indicado_por = :indicadoPor, observacao = :observacao,
           atualizado_em = datetime('now'), atualizado_por = :atualizadoPor
         WHERE id = :id`
      )
      .run({
        id,
        nome: data.nome.trim().toUpperCase(),
        dataNasc: normalizar(data.dataNasc),
        cpf: normalizar(data.cpf),
        rg: normalizar(data.rg),
        celular: normalizar(data.celular),
        telefone: normalizar(data.telefone),
        email: normalizar(data.email),
        logradouro: normalizar(data.logradouro)?.toUpperCase() ?? null,
        numero: normalizar(data.numero),
        complemento: normalizar(data.complemento)?.toUpperCase() ?? null,
        bairro: normalizar(data.bairro)?.toUpperCase() ?? null,
        cidade: normalizar(data.cidade)?.toUpperCase() ?? null,
        uf: normalizar(data.uf)?.toUpperCase() ?? null,
        cep: normalizar(data.cep),
        profissao: normalizar(data.profissao)?.toUpperCase() ?? null,
        indicadoPor: normalizar(data.indicadoPor)?.toUpperCase() ?? null,
        observacao: normalizar(data.observacao),
        atualizadoPor
      })
  },

  possuiVinculos(id: number): boolean {
    const db = getDb()
    const emReceita = db.prepare('SELECT 1 FROM receita_optica WHERE cliente_id = :id').get({ id })
    const emVenda = db.prepare('SELECT 1 FROM venda WHERE cliente_id = :id').get({ id })
    return emReceita !== undefined || emVenda !== undefined
  },

  inativar(id: number): void {
    getDb()
      .prepare("UPDATE cliente SET ativo = 0, atualizado_em = datetime('now') WHERE id = :id")
      .run({ id })
  },

  excluir(id: number): void {
    getDb().prepare('DELETE FROM cliente WHERE id = :id').run({ id })
  },

  aniversariantes(mes: number | null): ClienteResumo[] {
    const db = getDb()
    const sql = mes
      ? `SELECT id, nome, celular, cpf, data_nasc FROM cliente
         WHERE ativo = 1 AND data_nasc IS NOT NULL AND CAST(strftime('%m', data_nasc) AS INTEGER) = :mes
         ORDER BY CAST(strftime('%d', data_nasc) AS INTEGER), nome`
      : `SELECT id, nome, celular, cpf, data_nasc FROM cliente
         WHERE ativo = 1 AND data_nasc IS NOT NULL
         ORDER BY strftime('%m', data_nasc), strftime('%d', data_nasc), nome`

    const rows = db.prepare(sql).all(mes ? { mes } : {}) as {
      id: number
      nome: string
      celular: string | null
      cpf: string | null
      data_nasc: string | null
    }[]

    return rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      celular: r.celular,
      cpf: r.cpf,
      dataNasc: r.data_nasc
    }))
  }
}
