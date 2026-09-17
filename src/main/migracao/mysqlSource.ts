import mysql from 'mysql2/promise'
import type { MigracaoConexaoInput } from '@shared/ipc'

export interface ClienteOrigemRow {
  id_cliente: number
  nome: string
  data_nasc: string | null
  cpf: string | null
  celular: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
}

export interface ExameOrigemRow {
  id_exame: number
  plonge_od_esf: string | null
  plonge_oe_esf: string | null
  plonge_od_cil: string | null
  plonge_oe_cil: string | null
  plonge_od_eixo: number | null
  plonge_oe_eixo: number | null
  plonge_od_dnp: number | null
  plonge_oe_dnp: number | null
  pperto_od_esf: string | null
  pperto_oe_esf: string | null
  pperto_od_cil: string | null
  pperto_oe_cil: string | null
  pperto_od_eixo: number | null
  pperto_oe_eixo: number | null
  pperto_od_dnp: number | null
  pperto_oe_dnp: number | null
  adicao: string | null
  lentes: string | null
  tratamentos: string | null
  armacao: string | null
  observacao: string | null
  data_exame: string | null
  valor_exame: string | null
  valor_oculos: string | null
  data_venda: string | null
  forma_pgto: string | null
  id_cliente: number | null
  laboratorio: string | null
  med_opto: string | null
  data_saida: string | null
  data_chegada: string | null
  situacao: string | null
}

export interface DespesaOrigemRow {
  id: number
  descricao: string
  valor: string | null
  data: string | null
  tipo: string | null
}

/**
 * RF-02/F7 (CA3): a conexao com o banco antigo e so LEITURA - nenhuma
 * funcao aqui executa INSERT/UPDATE/DELETE contra o MySQL de origem.
 * `dateStrings: true` faz colunas DATE virem string 'YYYY-MM-DD' (inclusive
 * a sentinela '1111-11-11'), em vez de um objeto `Date` com fuso horario -
 * muito mais simples de detectar a sentinela e converter.
 */
async function conectar(config: MigracaoConexaoInput): Promise<mysql.Connection> {
  return mysql.createConnection({
    host: config.host,
    port: config.porta,
    user: config.usuario,
    password: config.senha,
    database: config.banco,
    dateStrings: true,
    connectTimeout: 10_000
  })
}

export async function testarConexao(config: MigracaoConexaoInput): Promise<void> {
  const conexao = await conectar(config)
  try {
    await conexao.query('SELECT 1')
  } finally {
    await conexao.end()
  }
}

export async function lerClientes(config: MigracaoConexaoInput): Promise<ClienteOrigemRow[]> {
  const conexao = await conectar(config)
  try {
    const [rows] = await conexao.query('SELECT * FROM clientes')
    return rows as ClienteOrigemRow[]
  } finally {
    await conexao.end()
  }
}

export async function lerExames(config: MigracaoConexaoInput): Promise<ExameOrigemRow[]> {
  const conexao = await conectar(config)
  try {
    const [rows] = await conexao.query('SELECT * FROM exames')
    return rows as ExameOrigemRow[]
  } finally {
    await conexao.end()
  }
}

export async function lerDespesas(config: MigracaoConexaoInput): Promise<DespesaOrigemRow[]> {
  const conexao = await conectar(config)
  try {
    const [rows] = await conexao.query('SELECT * FROM receitas_despesas')
    return rows as DespesaOrigemRow[]
  } finally {
    await conexao.end()
  }
}
