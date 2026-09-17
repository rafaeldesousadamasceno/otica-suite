import { listarComSaldo, ajustar, saldoAtualProduto } from '@main/repositories/estoqueRepository'
import { produtoRepository } from '@main/repositories/produtoRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import { Errors } from '@main/errors'
import type { EstoqueItem } from '@shared/types'
import type { EstoqueAjustarInput, EstoqueListQuery } from '@shared/ipc'

export const estoqueService = {
  listar(query: EstoqueListQuery): EstoqueItem[] {
    requirePermissao('estoque', 'ver')
    return listarComSaldo(query)
  },

  /** RF-08: inventario - so o Administrador ajusta o saldo direto. */
  ajustar(input: EstoqueAjustarInput): EstoqueItem {
    const sessao = requirePermissao('estoque.ajustar', 'ver')
    const produto = produtoRepository.buscarPorId(input.produtoId)
    if (!produto) throw Errors.naoEncontrado('Produto')
    if (produto.categoria === 'servico') {
      throw Errors.validacao('Serviço não tem estoque para ajustar.')
    }

    const saldoAnterior = saldoAtualProduto(input.produtoId)
    ajustar(input.produtoId, input.saldoContado, input.motivo, sessao.usuario.id)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'AJUSTAR_ESTOQUE',
      entidade: 'produto',
      entidadeId: input.produtoId,
      valorAnterior: { saldo: saldoAnterior },
      valorNovo: { saldo: input.saldoContado, motivo: input.motivo }
    })

    return {
      produtoId: produto.id,
      descricao: produto.descricao,
      categoria: produto.categoria,
      marca: produto.marca,
      unidade: produto.unidade,
      saldo: input.saldoContado,
      estoqueMinimo: produto.estoqueMinimo,
      ativo: produto.ativo
    }
  }
}
