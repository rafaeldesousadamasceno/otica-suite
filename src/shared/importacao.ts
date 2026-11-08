/**
 * Produto generico onde entram os itens de venda vindos do sistema anterior
 * (nao ha produto real por tras deles: sem custo, sem estoque). O painel e os
 * relatorios o deixam de fora da margem e dos produtos mais vendidos.
 */
export const DESCRICAO_PRODUTO_IMPORTADO = 'ITEM IMPORTADO'

// ---------------------------------------------------------------------
// Pendencias da importacao (o que a importacao achou de errado ou mexeu)
// ---------------------------------------------------------------------

export const TIPOS_PENDENCIA = [
  'CPF_INVALIDO',
  'CPF_DUPLICADO',
  'CPF_MESCLADO',
  'CPF_REMOVIDO',
  'EXAME_SEM_CLIENTE',
  'CLIENTE_INEXISTENTE_NA_ORIGEM',
  'CLIENTE_FALHOU',
  'DATA_INVALIDA',
  'DATA_INCOERENTE',
  'DATA_AUSENTE',
  'ERRO_IMPORTACAO',
  'REGISTRO_VAZIO'
] as const
export type TipoPendencia = (typeof TIPOS_PENDENCIA)[number]

export type GravidadePendencia = 'info' | 'atencao' | 'erro'
export type StatusPendencia = 'ABERTA' | 'RESOLVIDA' | 'IGNORADA'

export const ROTULO_TIPO_PENDENCIA: Record<TipoPendencia, string> = {
  CPF_INVALIDO: 'CPF inválido',
  CPF_DUPLICADO: 'CPF repetido',
  CPF_MESCLADO: 'Cliente mesclado',
  CPF_REMOVIDO: 'CPF retirado do cadastro',
  EXAME_SEM_CLIENTE: 'Exame sem cliente',
  CLIENTE_INEXISTENTE_NA_ORIGEM: 'Cliente inexistente no sistema antigo',
  CLIENTE_FALHOU: 'Cliente não importado',
  DATA_INVALIDA: 'Data inválida',
  DATA_INCOERENTE: 'Data incoerente',
  DATA_AUSENTE: 'Data ausente',
  ERRO_IMPORTACAO: 'Erro na importação',
  REGISTRO_VAZIO: 'Registro em branco'
}

/** Campos de data de um exame antigo que a importacao sabe analisar e corrigir. */
export const CAMPOS_DATA_EXAME = ['data_exame', 'data_venda', 'data_saida', 'data_chegada'] as const
export type CampoDataExame = (typeof CAMPOS_DATA_EXAME)[number]

export const ROTULO_CAMPO_DATA: Record<CampoDataExame, string> = {
  data_exame: 'data do exame',
  data_venda: 'data da venda',
  data_saida: 'data de envio ao laboratório',
  data_chegada: 'data de chegada do laboratório'
}

/** Dados de apoio de uma pendencia: o suficiente para o administrador agir sobre ela. */
export interface PendenciaDados {
  campo?: CampoDataExame
  atual?: string
  sugerido?: string
  [chave: string]: string | number | null | undefined
}

/** Pendencia prevista pela analise (ainda nao gravada) ou gerada pela importacao. */
export interface PendenciaPrevista {
  tipo: TipoPendencia
  gravidade: GravidadePendencia
  /** Tabela do sistema antigo: clientes, exames ou receitas_despesas. */
  origemTabela: string
  origemId: number
  motivo: string
  sugestao: string | null
  dados: PendenciaDados | null
}

export interface Pendencia extends PendenciaPrevista {
  id: number
  status: StatusPendencia
  destinoTabela: string | null
  destinoId: number | null
  criadoEm: string
  resolvidoEm: string | null
}

/** O administrador aprova, por categoria, o que a importacao pode resolver sozinha. */
export interface MigracaoAprovacoes {
  /** Mesma pessoa com CPF repetido: junta num so cliente (os exames seguem). */
  mesclarDuplicados: boolean
  /** Pessoas diferentes com o mesmo CPF: importa as duas e tira o CPF de uma (original vai para a observacao). */
  removerCpfConflitante: boolean
  /** Cliente so com o nome e exames totalmente em branco: nao importa (e remove, se ja tinha entrado sem uso). */
  removerRegistrosVazios: boolean
}

export interface MigracaoAnalise {
  clientesLidos: number
  clientesAImportar: number
  clientesJaImportados: number
  /** Sem nome e sem nenhuma receita no sistema antigo: nao entram. */
  clientesSemNome: number
  /** Cliente so com o nome e exames em branco: nao entram (e saem, se ja tinham entrado). */
  registrosVazios: number
  examesLidos: number
  examesAImportar: number
  examesJaImportados: number
  porTipo: Partial<Record<TipoPendencia, number>>
  pendencias: PendenciaPrevista[]
}

export interface MigracaoResultado {
  clientesImportados: number
  clientesMesclados: number
  clientesJaImportados: number
  clientesComFalha: number
  /** Clientes sem nome e sem nenhuma receita no sistema antigo: nao entram. */
  clientesSemNomeIgnorados: number
  /** Clientes sem nome e sem receita que tinham entrado numa importacao anterior e foram removidos. */
  clientesSemNomeRemovidos: number
  /** Registros em branco que nao foram importados. */
  registrosVaziosIgnorados: number
  /** Registros em branco que ja estavam importados e foram removidos do sistema. */
  registrosVaziosRemovidos: number
  examesImportados: number
  examesJaImportados: number
  examesComFalha: number
  despesasImportadas: number
  despesasJaImportadas: number
  despesasComFalha: number
  /** Registros ja importados cujos acentos quebrados foram corrigidos nesta rodada. */
  textosCorrigidos: number
  /** Pendencias abertas ao fim da importacao, por tipo. */
  pendenciasAbertas: Partial<Record<TipoPendencia, number>>
  /** Backup tirado antes de gravar. */
  backupArquivo: string
}

/** Tudo o que ajuda a decidir a data certa de um exame importado: de quem e, o que foi, e as datas gravadas. */
export interface DetalhesExamePendencia {
  cliente: { id: number; nome: string; celular: string | null; cpf: string | null }
  numeroVenda: string
  numeroOS: string | null
  item: string | null
  laboratorio: string | null
  profissional: string | null
  valorCentavos: number
  formaPagamento: string | null
  situacaoOS: string | null
  /** Datas como estao gravadas hoje (so o dia; pode vir algo que nao e data, de uma importacao antiga). */
  datas: {
    exame: string | null
    venda: string | null
    abertura: string | null
    envio: string | null
    chegada: string | null
    entrega: string | null
  }
  /** Outras compras/exames do mesmo cliente, as mais recentes primeiro. */
  outros: { numero: string; dataExame: string | null; dataVenda: string | null }[]
}

/** Ordens de servico que vieram do sistema antigo e continuam sem entrega. */
export interface OsAntigasAbertas {
  total: number
  porSituacao: Record<string, number>
  /** Data de abertura da mais antiga. */
  maisAntiga: string | null
  /** Ultimo dia de movimento que se ve nos dados antigos (nunca depois de hoje): bom candidato a data de entrega. */
  sugestaoData: string | null
}

export interface OsAntigasEncerradas {
  encerradas: number
  backupArquivo: string
}
