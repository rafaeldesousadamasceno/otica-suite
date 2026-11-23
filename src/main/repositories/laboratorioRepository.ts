import { getDb } from '@main/db/connection'
import { maiusculo, maiusculoOuNulo, termoBusca } from '@shared/texto'
import type { Laboratorio } from '@shared/types'
import type { LaboratorioInput, LaboratoriosListQuery } from '@shared/ipc'

interface LaboratorioRow {
  id: number
  nome: string
  razao_social: string | null
  cnpj: string | null
  telefone: string | null
  whatsapp: string | null
  email: string | null
  endereco: string | null
  contato_responsavel: string | null
  prazo_medio_dias: number | null
  observacoes: string | null
  ativo: number
  os_vinculadas: number
}

function toDomain(r: LaboratorioRow): Laboratorio {
  return {
    id: r.id,
    nome: r.nome,
    razaoSocial: r.razao_social,
    cnpj: r.cnpj,
    telefone: r.telefone,
    whatsapp: r.whatsapp,
    email: r.email,
    endereco: r.endereco,
    contatoResponsavel: r.contato_responsavel,
    prazoMedioDias: r.prazo_medio_dias,
    observacoes: r.observacoes,
    ativo: r.ativo === 1,
    osVinculadas: r.os_vinculadas
  }
}

const SELECT = `
  SELECT l.id, l.nome, l.razao_social, l.cnpj, l.telefone, l.whatsapp, l.email, l.endereco,
         l.contato_responsavel, l.prazo_medio_dias, l.observacoes, l.ativo,
         (SELECT COUNT(*) FROM ordem_servico os WHERE os.laboratorio_id = l.id) AS os_vinculadas
  FROM laboratorio l
`

/** Os textos livres sao gravados em maiusculas (padrao do sistema); e-mail e observacoes, como foram digitados. */
function parametros(d: LaboratorioInput): Record<string, string | number | null> {
  return {
    nome: maiusculo(d.nome),
    razaoSocial: maiusculoOuNulo(d.razaoSocial),
    cnpj: d.cnpj,
    telefone: d.telefone,
    whatsapp: d.whatsapp,
    email: d.email,
    endereco: maiusculoOuNulo(d.endereco),
    contatoResponsavel: maiusculoOuNulo(d.contatoResponsavel),
    prazoMedioDias: d.prazoMedioDias,
    observacoes: d.observacoes?.trim() || null
  }
}

export const laboratorioRepository = {
  /** Exclusao logica: o excluido nunca aparece. `apenasAtivos` (padrao) e o que a OS oferece. */
  listar(query: LaboratoriosListQuery): Laboratorio[] {
    const rows = getDb()
      .prepare(
        `${SELECT}
         WHERE l.excluido_em IS NULL
           AND (:apenasAtivos = 0 OR l.ativo = 1)
           AND (sem_acento(l.nome) LIKE :termo OR sem_acento(l.razao_social) LIKE :termo OR sem_acento(l.cnpj) LIKE :termo)
         ORDER BY sem_acento(l.nome)
         LIMIT 500`
      )
      .all({ termo: termoBusca(query.busca), apenasAtivos: query.apenasAtivos === false ? 0 : 1 }) as unknown as LaboratorioRow[]
    return rows.map(toDomain)
  },

  buscarPorId(id: number): Laboratorio | null {
    const row = getDb().prepare(`${SELECT} WHERE l.id = :id AND l.excluido_em IS NULL`).get({ id }) as unknown as LaboratorioRow | undefined
    return row ? toDomain(row) : null
  },

  /** Outro laboratorio (nao excluido) com este nome? So ignora maiuscula de letras sem acento (limite do SQLite). */
  nomeEmUso(nome: string, ignorarId = 0): boolean {
    const row = getDb()
      .prepare('SELECT 1 FROM laboratorio WHERE nome = :nome COLLATE NOCASE AND excluido_em IS NULL AND id != :id')
      .get({ nome: maiusculo(nome), id: ignorarId })
    return row !== undefined
  },

  criar(d: LaboratorioInput): number {
    const info = getDb()
      .prepare(
        `INSERT INTO laboratorio (nome, razao_social, cnpj, telefone, whatsapp, email, endereco, contato_responsavel, prazo_medio_dias, observacoes)
         VALUES (:nome, :razaoSocial, :cnpj, :telefone, :whatsapp, :email, :endereco, :contatoResponsavel, :prazoMedioDias, :observacoes)`
      )
      .run(parametros(d))
    return Number(info.lastInsertRowid)
  },

  atualizar(id: number, d: LaboratorioInput): void {
    getDb()
      .prepare(
        `UPDATE laboratorio SET nome = :nome, razao_social = :razaoSocial, cnpj = :cnpj, telefone = :telefone, whatsapp = :whatsapp,
           email = :email, endereco = :endereco, contato_responsavel = :contatoResponsavel,
           prazo_medio_dias = :prazoMedioDias, observacoes = :observacoes
         WHERE id = :id AND excluido_em IS NULL`
      )
      .run({ id, ...parametros(d) })
  },

  setAtivo(id: number, ativo: boolean): void {
    getDb().prepare('UPDATE laboratorio SET ativo = :ativo WHERE id = :id').run({ id, ativo: ativo ? 1 : 0 })
  },

  excluir(id: number, motivo: string | null): void {
    getDb().prepare("UPDATE laboratorio SET excluido_em = datetime('now'), excluido_motivo = :motivo WHERE id = :id AND excluido_em IS NULL").run({ id, motivo })
  },

  /** Importacao do sistema antigo: acha pelo nome ou cria, sem duplicar. Devolve o id e o nome do cadastro. */
  garantirPorNome(nome: string | null): { id: number; nome: string } | null {
    const limpo = nome?.trim()
    if (!limpo) return null
    const db = getDb()
    const existente = db
      .prepare('SELECT id, nome FROM laboratorio WHERE nome = :nome COLLATE NOCASE AND excluido_em IS NULL')
      .get({ nome: limpo }) as { id: number; nome: string } | undefined
    if (existente) return existente
    const info = db.prepare('INSERT INTO laboratorio (nome) VALUES (:nome)').run({ nome: maiusculo(limpo) })
    return { id: Number(info.lastInsertRowid), nome: maiusculo(limpo) }
  }
}
