import { compraRepository } from '@main/repositories/compraRepository'
import { produtoRepository } from '@main/repositories/produtoRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import { Errors } from '@main/errors'
import type { CompraDetalhada, CompraResumo } from '@shared/types'
import type { CompraCreateInput, ComprasListQuery } from '@shared/ipc'

/** RF-09: fornecedores e compras sao modulo exclusivo do Administrador. */
export const compraService = {
  listar(query: ComprasListQuery): CompraResumo[] {
    requirePermissao('fornecedores_compras', 'ver')
    return compraRepository.listar(query)
  },

  buscarPorId(id: number): CompraDetalhada {
    requirePermissao('fornecedores_compras', 'ver')
    const compra = compraRepository.buscarPorId(id)
    if (!compra) throw Errors.naoEncontrado('Compra')
    return compra
  },

  criar(input: CompraCreateInput): CompraDetalhada {
    const sessao = requirePermissao('fornecedores_compras', 'criar')

    for (const item of input.itens) {
      if (!produtoRepository.buscarPorId(item.produtoId)) {
        throw Errors.naoEncontrado(`Produto #${item.produtoId}`)
      }
    }

    const id = compraRepository.criar(input, sessao.usuario.id)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'CRIAR',
      entidade: 'compra',
      entidadeId: id,
      valorNovo: input
    })

    return compraRepository.buscarPorId(id)!
  },

  cancelar(id: number): CompraDetalhada {
    const sessao = requirePermissao('fornecedores_compras', 'editar')
    const compra = compraRepository.buscarPorId(id)
    if (!compra) throw Errors.naoEncontrado('Compra')
    if (compra.situacao !== 'ABERTA') {
      throw Errors.validacao('Só é possível cancelar uma compra que ainda não deu entrada.')
    }

    compraRepository.cancelar(id)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'CANCELAR',
      entidade: 'compra',
      entidadeId: id,
      valorAnterior: { situacao: compra.situacao }
    })

    return compraRepository.buscarPorId(id)!
  },

  /** RF-09, CA1/CA2: confere a ordem, da entrada no estoque e gera a conta a pagar - tudo numa transacao atomica. */
  confirmarEntrada(id: number, vencimentoContaPagar: string): CompraDetalhada {
    const sessao = requirePermissao('fornecedores_compras', 'editar')
    const compra = compraRepository.buscarPorId(id)
    if (!compra) throw Errors.naoEncontrado('Compra')
    if (compra.situacao !== 'ABERTA') {
      throw Errors.validacao('Esta compra já foi recebida ou está cancelada.')
    }

    compraRepository.confirmarEntrada(id, vencimentoContaPagar, sessao.usuario.id)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'CONFIRMAR_ENTRADA',
      entidade: 'compra',
      entidadeId: id,
      valorNovo: { vencimentoContaPagar }
    })

    return compraRepository.buscarPorId(id)!
  }
}
