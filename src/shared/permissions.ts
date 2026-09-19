import type { Perfil } from './types'

/**
 * Matriz de permissoes (PRD secao 7.4).
 *
 * De proposito, isto e DADO (um mapa de recurso -> acoes), nao um enum
 * fixo nem um `if (perfil === 'admin')` espalhado pelo codigo. Acrescentar
 * um perfil novo (Gerente, Caixa, Optometrista - PRD Q1/Q2) e editar este
 * arquivo, nunca reescrever main nem renderer.
 *
 * Verificado nos dois lados por razoes diferentes:
 *  - no RENDERER, para nao desenhar no menu o que o usuario nao acessa;
 *  - no MAIN, dentro de cada handler de IPC, que e a checagem que importa -
 *    o renderer e sempre tratado como nao confiavel (PRD secao 9.2/9.3).
 */
export type Recurso =
  | 'clientes'
  | 'clientes.excluir'
  | 'receitas_opticas'
  | 'ordens_servico'
  | 'protocolo_saida'
  | 'aniversariantes'
  | 'relacionamento'
  | 'relacionamento.modelos'
  | 'vendas'
  | 'vendas.cancelar'
  | 'vendas.desconto_sem_limite'
  | 'produtos'
  | 'produtos.custo_margem'
  | 'estoque'
  | 'estoque.ajustar'
  | 'fornecedores_compras'
  | 'contas_receber'
  | 'contas_pagar'
  | 'financeiro_caixa'
  | 'comissoes.todas'
  | 'relatorios_gerenciais'
  | 'usuarios'
  | 'configuracoes'
  | 'backup'
  | 'licenca'
  | 'migracao'
  | 'auditoria'

export type Acao = 'ver' | 'criar' | 'editar' | 'excluir'

type MatrizPermissoes = Record<Perfil, Partial<Record<Recurso, Acao[]>>>

const TUDO: Acao[] = ['ver', 'criar', 'editar', 'excluir']
const VER_CRIAR_EDITAR: Acao[] = ['ver', 'criar', 'editar']
const SO_VER: Acao[] = ['ver']

export const PERMISSOES: MatrizPermissoes = {
  admin: {
    clientes: TUDO,
    'clientes.excluir': SO_VER,
    receitas_opticas: TUDO,
    ordens_servico: TUDO,
    protocolo_saida: TUDO,
    aniversariantes: SO_VER,
    relacionamento: VER_CRIAR_EDITAR,
    'relacionamento.modelos': ['ver', 'editar'],
    vendas: TUDO,
    'vendas.cancelar': SO_VER,
    'vendas.desconto_sem_limite': SO_VER,
    produtos: TUDO,
    'produtos.custo_margem': VER_CRIAR_EDITAR,
    estoque: TUDO,
    'estoque.ajustar': SO_VER,
    fornecedores_compras: TUDO,
    contas_receber: TUDO,
    contas_pagar: TUDO,
    financeiro_caixa: TUDO,
    'comissoes.todas': SO_VER,
    relatorios_gerenciais: SO_VER,
    usuarios: TUDO,
    configuracoes: TUDO,
    backup: TUDO,
    licenca: TUDO,
    migracao: TUDO,
    auditoria: SO_VER
  },
  vendedor: {
    clientes: VER_CRIAR_EDITAR,
    receitas_opticas: VER_CRIAR_EDITAR,
    ordens_servico: VER_CRIAR_EDITAR,
    protocolo_saida: SO_VER,
    aniversariantes: SO_VER,
    relacionamento: VER_CRIAR_EDITAR,
    vendas: ['ver', 'criar'],
    produtos: SO_VER,
    estoque: SO_VER,
    contas_receber: ['ver', 'editar'] // baixa das proprias vendas
    // tudo que nao aparece aqui: sem acesso.
  }
}

export function possuiPermissao(perfil: Perfil, recurso: Recurso, acao: Acao): boolean {
  return PERMISSOES[perfil]?.[recurso]?.includes(acao) ?? false
}

/** Recursos visiveis na navegacao lateral, por modulo (PRD secao 12.1). */
export const RECURSOS_POR_MODULO: Record<Perfil, Recurso[]> = {
  admin: [
    'clientes',
    'relacionamento',
    'receitas_opticas',
    'ordens_servico',
    'vendas',
    'contas_receber',
    'produtos',
    'estoque',
    'fornecedores_compras',
    'contas_pagar',
    'financeiro_caixa',
    'relatorios_gerenciais',
    'usuarios',
    'configuracoes',
    'backup',
    'auditoria'
  ],
  vendedor: ['clientes', 'relacionamento', 'receitas_opticas', 'ordens_servico', 'vendas', 'contas_receber', 'estoque']
}
