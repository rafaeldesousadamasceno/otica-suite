import { getDb } from '@main/db/connection'
import type { Empresa } from '@shared/types'
import type { EmpresaUpdateInput } from '@shared/ipc'

interface EmpresaRow {
  nome_fantasia: string
  razao_social: string | null
  cnpj: string | null
  ie: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
  telefone: string | null
  whatsapp: string | null
  email: string | null
  site: string | null
  logo_path: string | null
  logo_formato: 'circulo' | 'quadrado_arredondado' | 'quadrado'
  cor_destaque: string
  tema: 'claro' | 'escuro' | 'sistema'
}

function toDomain(row: EmpresaRow): Empresa {
  return {
    nomeFantasia: row.nome_fantasia,
    razaoSocial: row.razao_social,
    cnpj: row.cnpj,
    ie: row.ie,
    logradouro: row.logradouro,
    numero: row.numero,
    complemento: row.complemento,
    bairro: row.bairro,
    cidade: row.cidade,
    uf: row.uf,
    cep: row.cep,
    telefone: row.telefone,
    whatsapp: row.whatsapp,
    email: row.email,
    site: row.site,
    logoPath: row.logo_path,
    logoFormato: row.logo_formato,
    corDestaque: row.cor_destaque,
    tema: row.tema
  }
}

export const empresaRepository = {
  get(): Empresa | null {
    const row = getDb().prepare('SELECT * FROM empresa WHERE id = 1').get() as EmpresaRow | undefined
    return row ? toDomain(row) : null
  },

  existe(): boolean {
    const row = getDb().prepare('SELECT 1 FROM empresa WHERE id = 1').get()
    return row !== undefined
  },

  criar(nomeFantasia: string, cnpj: string | null): void {
    getDb()
      .prepare(
        `INSERT INTO empresa (id, nome_fantasia, cnpj) VALUES (1, :nomeFantasia, :cnpj)`
      )
      .run({ nomeFantasia, cnpj })
  },

  atualizar(data: EmpresaUpdateInput): void {
    getDb()
      .prepare(
        `UPDATE empresa SET
           nome_fantasia = :nomeFantasia,
           razao_social  = :razaoSocial,
           cnpj          = :cnpj,
           ie            = :ie,
           logradouro    = :logradouro,
           numero        = :numero,
           complemento   = :complemento,
           bairro        = :bairro,
           cidade        = :cidade,
           uf            = :uf,
           cep           = :cep,
           telefone      = :telefone,
           whatsapp      = :whatsapp,
           email         = :email,
           site          = :site,
           cor_destaque  = :corDestaque,
           tema          = :tema,
           logo_formato  = :logoFormato
         WHERE id = 1`
      )
      .run({
        nomeFantasia: data.nomeFantasia,
        razaoSocial: data.razaoSocial ?? null,
        cnpj: data.cnpj ?? null,
        ie: data.ie ?? null,
        logradouro: data.logradouro ?? null,
        numero: data.numero ?? null,
        complemento: data.complemento ?? null,
        bairro: data.bairro ?? null,
        cidade: data.cidade ?? null,
        uf: data.uf ?? null,
        cep: data.cep ?? null,
        telefone: data.telefone ?? null,
        whatsapp: data.whatsapp ?? null,
        email: data.email || null,
        site: data.site ?? null,
        corDestaque: data.corDestaque,
        tema: data.tema,
        logoFormato: data.logoFormato
      })
  },

  atualizarLogo(logoPath: string): void {
    getDb().prepare('UPDATE empresa SET logo_path = :logoPath WHERE id = 1').run({ logoPath })
  },

  removerLogo(): void {
    getDb().prepare('UPDATE empresa SET logo_path = NULL WHERE id = 1').run()
  }
}
