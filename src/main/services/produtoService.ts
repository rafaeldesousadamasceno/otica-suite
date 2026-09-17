import { produtoRepository } from '@main/repositories/produtoRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao, requireSessao } from '@main/auth/session'
import { possuiPermissao } from '@shared/permissions'
import { Errors } from '@main/errors'
import type { Produto } from '@shared/types'
import type { ProdutoInput, ProdutosListQuery } from '@shared/ipc'

/**
 * RF-07, CA3: quem nao tem `produtos.custo_margem` recebe o produto com
 * custo e margem redigidos (null) - a redacao acontece aqui, uma unica
 * vez, para nunca depender da UI lembrar de esconder a coluna.
 */
function redigirSeNecessario(produto: Produto, perfil: 'admin' | 'vendedor'): Produto {
  if (possuiPermissao(perfil, 'produtos.custo_margem', 'ver')) return produto
  return { ...produto, custoCentavos: null, margem: null }
}

export const produtoService = {
  listar(query: ProdutosListQuery): Produto[] {
    const sessao = requireSessao()
    return produtoRepository.listar(query).map((p) => redigirSeNecessario(p, sessao.usuario.perfil))
  },

  buscarPorId(id: number): Produto {
    const sessao = requireSessao()
    const produto = produtoRepository.buscarPorId(id)
    if (!produto) throw Errors.naoEncontrado('Produto')
    return redigirSeNecessario(produto, sessao.usuario.perfil)
  },

  criar(input: ProdutoInput): Produto {
    const sessao = requirePermissao('produtos', 'criar')

    if (input.codigoBarras && produtoRepository.codigoBarrasEmUsoPorOutro(input.codigoBarras)) {
      throw Errors.conflito('Já existe um produto com este código de barras.')
    }

    const id = produtoRepository.criar(input)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'CRIAR',
      entidade: 'produto',
      entidadeId: id,
      valorNovo: input
    })

    return produtoRepository.buscarPorId(id)!
  },

  atualizar(id: number, input: ProdutoInput): Produto {
    const sessao = requirePermissao('produtos', 'editar')
    const antes = produtoRepository.buscarPorId(id)
    if (!antes) throw Errors.naoEncontrado('Produto')

    if (
      input.codigoBarras &&
      produtoRepository.codigoBarrasEmUsoPorOutro(input.codigoBarras, id)
    ) {
      throw Errors.conflito('Já existe um produto com este código de barras.')
    }

    produtoRepository.atualizar(id, input)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'ATUALIZAR',
      entidade: 'produto',
      entidadeId: id,
      valorAnterior: antes,
      valorNovo: input
    })

    return produtoRepository.buscarPorId(id)!
  },

  /**
   * RN-13: nunca exclui de fato, so inativa - mesmo padrao ja usado em
   * usuarios. Um produto pode estar referenciado em lugares nao obvios
   * (venda antiga, movimentacao de estoque futura); inativar e sempre
   * seguro, excluir nem sempre.
   */
  setAtivo(id: number, ativo: boolean): void {
    const sessao = requirePermissao('produtos', 'editar')
    if (!produtoRepository.buscarPorId(id)) throw Errors.naoEncontrado('Produto')

    produtoRepository.setAtivo(id, ativo)
    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: ativo ? 'ATIVAR' : 'INATIVAR',
      entidade: 'produto',
      entidadeId: id
    })
  }
}
