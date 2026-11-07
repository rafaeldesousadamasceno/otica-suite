/**
 * Lista única do que entra (e do que NÃO entra) na sincronização com a nuvem.
 * É usada pelo gerador da migração 010, pelos testes e pelo documento
 * docs/Arquitetura-Sincronizacao.md. Tabela nova no schema precisa ser
 * classificada aqui: um teste falha se alguma ficar de fora.
 */

export interface TabelaSync {
  nome: string
  /**
   * Quando a linha tem uma chave própria além do uuid, a nuvem casa as linhas
   * por ela (ex.: `configuracao` é identificada por `chave`).
   */
  chaveNatural?: string
  /** Colunas que nunca saem do computador (o worker de envio precisa omiti-las). */
  colunasLocais?: string[]
  /** Linhas que nunca saem do computador: condição SQL sobre a própria tabela. */
  filtroLocal?: string
  /** Só recebe registros novos, nunca edição: não existe conflito de edição. */
  somenteAcrescenta?: boolean
}

/** Chaves de `configuracao` que pertencem a este computador e não podem viajar. */
export const CHAVES_CONFIGURACAO_LOCAIS = ['licenca_local', 'sync_dispositivo_id'] as const

export const TABELAS_SINCRONIZAVEIS: TabelaSync[] = [
  // Cadastros básicos
  { nome: 'empresa', chaveNatural: 'id' },
  {
    nome: 'configuracao',
    chaveNatural: 'chave',
    filtroLocal: `chave IN (${CHAVES_CONFIGURACAO_LOCAIS.map((c) => `'${c}'`).join(', ')})`
  },
  // A senha e o controle de tentativas de login ficam em cada computador.
  { nome: 'usuario', chaveNatural: 'login', colunasLocais: ['senha_hash', 'tentativas_login', 'bloqueado_ate', 'ultimo_acesso'] },
  { nome: 'lista_valor' },
  { nome: 'profissional' },

  // Clientes e receitas
  { nome: 'cliente' },
  { nome: 'receita_optica' },
  { nome: 'contato' },

  // Produtos e estoque
  { nome: 'produto' },
  { nome: 'produto_lente', chaveNatural: 'produto_id' },
  { nome: 'fornecedor' },
  { nome: 'compra' },
  { nome: 'compra_item' },
  { nome: 'estoque_movimento', somenteAcrescenta: true },

  // Vendas e ordens de serviço
  { nome: 'venda' },
  { nome: 'venda_item' },
  { nome: 'venda_pagamento' },
  { nome: 'ordem_servico' },
  { nome: 'comissao' },

  // Financeiro: lançamentos e movimentos de caixa só acrescentam
  { nome: 'conta_receber' },
  { nome: 'recebimento', somenteAcrescenta: true },
  { nome: 'conta_pagar' },
  { nome: 'pagamento', somenteAcrescenta: true },
  { nome: 'lancamento', somenteAcrescenta: true },
  { nome: 'caixa' },

  { nome: 'auditoria', somenteAcrescenta: true }
]

/** Tabelas que nunca sincronizam, com o motivo. */
export const TABELAS_FORA_DA_SINCRONIZACAO: Record<string, string> = {
  _migrations: 'Versão do schema de cada computador.',
  migracao_registro: 'Mapa da importação do MD Óculos, só faz sentido onde a importação foi feita.',
  sync_contador: 'Contador de revisões deste computador.',
  sync_exclusao: 'Registro de exclusões pendentes de envio, consumido pelo próprio worker.'
}
