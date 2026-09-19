import { describe, expect, it } from 'vitest'
import { possuiPermissao } from './permissions'

describe('matriz de permissoes (PRD secao 7.4)', () => {
  it('admin tem acesso total a financeiro; vendedor nao tem nenhum', () => {
    expect(possuiPermissao('admin', 'financeiro_caixa', 'ver')).toBe(true)
    expect(possuiPermissao('vendedor', 'financeiro_caixa', 'ver')).toBe(false)
  })

  it('vendedor pode criar cliente mas nao excluir', () => {
    expect(possuiPermissao('vendedor', 'clientes', 'criar')).toBe(true)
    expect(possuiPermissao('vendedor', 'clientes.excluir', 'ver')).toBe(false)
  })

  it('vendedor nao ve custo/margem de produto, admin ve', () => {
    expect(possuiPermissao('vendedor', 'produtos.custo_margem', 'ver')).toBe(false)
    expect(possuiPermissao('admin', 'produtos.custo_margem', 'ver')).toBe(true)
  })

  it('desconto sem limite e exclusivo do admin (RN-07)', () => {
    expect(possuiPermissao('admin', 'vendas.desconto_sem_limite', 'ver')).toBe(true)
    expect(possuiPermissao('vendedor', 'vendas.desconto_sem_limite', 'ver')).toBe(false)
  })

  it('relacionamento: os dois perfis chamam clientes, so o admin edita as mensagens', () => {
    for (const perfil of ['admin', 'vendedor'] as const) {
      expect(possuiPermissao(perfil, 'relacionamento', 'ver')).toBe(true)
      expect(possuiPermissao(perfil, 'relacionamento', 'criar')).toBe(true)
    }
    expect(possuiPermissao('admin', 'relacionamento.modelos', 'editar')).toBe(true)
    expect(possuiPermissao('vendedor', 'relacionamento.modelos', 'ver')).toBe(false)
    expect(possuiPermissao('vendedor', 'relacionamento.modelos', 'editar')).toBe(false)
  })

  it('recurso nao mapeado para o perfil nunca autoriza', () => {
    expect(possuiPermissao('vendedor', 'usuarios', 'ver')).toBe(false)
    expect(possuiPermissao('vendedor', 'auditoria', 'ver')).toBe(false)
  })
})
