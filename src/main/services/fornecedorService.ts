import { fornecedorRepository } from '@main/repositories/fornecedorRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import { Errors } from '@main/errors'
import type { Fornecedor } from '@shared/types'
import type { FornecedorInput, FornecedoresListQuery } from '@shared/ipc'

/** RF-09: fornecedores e compras sao modulo exclusivo do Administrador. */
export const fornecedorService = {
  listar(query: FornecedoresListQuery): Fornecedor[] {
    requirePermissao('fornecedores_compras', 'ver')
    return fornecedorRepository.listar(query)
  },

  buscarPorId(id: number): Fornecedor {
    requirePermissao('fornecedores_compras', 'ver')
    const fornecedor = fornecedorRepository.buscarPorId(id)
    if (!fornecedor) throw Errors.naoEncontrado('Fornecedor')
    return fornecedor
  },

  criar(input: FornecedorInput): Fornecedor {
    const sessao = requirePermissao('fornecedores_compras', 'criar')
    const id = fornecedorRepository.criar(input)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'CRIAR',
      entidade: 'fornecedor',
      entidadeId: id,
      valorNovo: input
    })

    return fornecedorRepository.buscarPorId(id)!
  },

  atualizar(id: number, input: FornecedorInput): Fornecedor {
    const sessao = requirePermissao('fornecedores_compras', 'editar')
    const antes = fornecedorRepository.buscarPorId(id)
    if (!antes) throw Errors.naoEncontrado('Fornecedor')

    fornecedorRepository.atualizar(id, input)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'ATUALIZAR',
      entidade: 'fornecedor',
      entidadeId: id,
      valorAnterior: antes,
      valorNovo: input
    })

    return fornecedorRepository.buscarPorId(id)!
  },

  setAtivo(id: number, ativo: boolean): void {
    const sessao = requirePermissao('fornecedores_compras', 'editar')
    if (!fornecedorRepository.buscarPorId(id)) throw Errors.naoEncontrado('Fornecedor')

    fornecedorRepository.setAtivo(id, ativo)
    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: ativo ? 'ATIVAR' : 'INATIVAR',
      entidade: 'fornecedor',
      entidadeId: id
    })
  }
}
