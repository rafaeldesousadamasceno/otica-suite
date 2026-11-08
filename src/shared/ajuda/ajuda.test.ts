import { describe, expect, it } from 'vitest'
import { NAV_ITEMS } from '../../renderer/src/components/layout/navConfig'
import { SECOES_AJUDA, buscarSecoes, normalizar, secaoParaRota, secoesDoPerfil, textoDoBloco } from './index'

describe('conteudo da ajuda', () => {
  it('os ids das secoes sao unicos e servem de ancora', () => {
    const ids = SECOES_AJUDA.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
  })

  it('toda secao tem titulo, resumo e conteudo', () => {
    for (const s of SECOES_AJUDA) {
      expect(s.titulo.trim(), s.id).not.toBe('')
      expect(s.resumo.trim(), s.id).not.toBe('')
      expect(s.blocos.length, s.id).toBeGreaterThan(0)
      for (const b of s.blocos) expect(textoDoBloco(b).trim(), s.id).not.toBe('')
    }
  })

  it('toda tela do menu tem a sua secao de ajuda (menos o proprio Ajuda)', () => {
    for (const perfil of ['admin', 'vendedor'] as const) {
      for (const item of NAV_ITEMS[perfil]) {
        if (item.path === '/ajuda') continue
        const secao = secaoParaRota(item.path)
        expect(secao, `${perfil}: ${item.label} (${item.path})`).not.toBeNull()
      }
    }
  })

  it('as secoes que o Vendedor ve cobrem todas as telas do menu dele', () => {
    const visiveis = secoesDoPerfil('vendedor')
    for (const item of NAV_ITEMS.vendedor) {
      if (item.path === '/ajuda') continue
      expect(secaoParaRota(item.path, visiveis), item.label).not.toBeNull()
    }
  })

  it('tabelas tem o mesmo numero de colunas em todas as linhas', () => {
    for (const s of SECOES_AJUDA) {
      for (const b of s.blocos) {
        if (b.tipo !== 'tabela') continue
        for (const linha of b.linhas) expect(linha, `${s.id}: ${linha[0]}`).toHaveLength(b.colunas.length)
      }
    }
  })
})

describe('secoesDoPerfil', () => {
  it('o Vendedor nao ve as secoes so do Administrador', () => {
    const ids = secoesDoPerfil('vendedor').map((s) => s.id)
    expect(ids).toContain('vendas')
    expect(ids).not.toContain('caixa')
    expect(ids).not.toContain('backup')
    expect(secoesDoPerfil('admin')).toHaveLength(SECOES_AJUDA.length)
  })
})

describe('buscarSecoes', () => {
  it('ignora acento e maiuscula', () => {
    expect(normalizar('Licença')).toBe('licenca')
    expect(buscarSecoes(SECOES_AJUDA, 'LICENCA')[0].id).toBe('licenca')
    expect(buscarSecoes(SECOES_AJUDA, 'comissão').length).toBeGreaterThan(0)
  })

  it('exige todas as palavras, em qualquer ordem', () => {
    const achados = buscarSecoes(SECOES_AJUDA, 'sangria suprimento').map((s) => s.id)
    expect(achados).toContain('caixa')
    expect(buscarSecoes(SECOES_AJUDA, 'sangria banana')).toEqual([])
  })

  it('o titulo pesa mais que o corpo', () => {
    expect(buscarSecoes(SECOES_AJUDA, 'estoque')[0].id).toBe('estoque')
    expect(buscarSecoes(SECOES_AJUDA, 'backup')[0].id).toBe('backup')
  })

  it('termo vazio devolve tudo, na ordem do manual', () => {
    expect(buscarSecoes(SECOES_AJUDA, '  ')).toEqual(SECOES_AJUDA)
  })

  it('acha o DP e o visualizador pelas palavras do dia a dia', () => {
    expect(buscarSecoes(SECOES_AJUDA, 'DNP').map((s) => s.id)).toContain('ficha-cliente')
    expect(buscarSecoes(SECOES_AJUDA, 'imprimir pdf').map((s) => s.id)).toContain('relatorios')
  })
})

describe('secaoParaRota', () => {
  it('a ficha do cliente tem secao propria, diferente da lista', () => {
    expect(secaoParaRota('/clientes')?.id).toBe('clientes')
    expect(secaoParaRota('/clientes/42')?.id).toBe('ficha-cliente')
  })

  it('uma secao pode cobrir varias telas', () => {
    expect(secaoParaRota('/fluxo-caixa')?.id).toBe('fluxo-lucro')
    expect(secaoParaRota('/lucro-prejuizo')?.id).toBe('fluxo-lucro')
    expect(secaoParaRota('/compras')?.id).toBe('fornecedores-compras')
  })

  it('ignora a query e a ancora; rota sem secao devolve null', () => {
    expect(secaoParaRota('/contas-receber?vencidas=1')?.id).toBe('contas-receber')
    expect(secaoParaRota('/')?.id).toBe('inicio')
    expect(secaoParaRota('/nao-existe')).toBeNull()
  })
})
