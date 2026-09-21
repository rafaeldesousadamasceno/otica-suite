import { clienteRepository } from '@main/repositories/clienteRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao, requireSessao } from '@main/auth/session'
import { Errors } from '@main/errors'
import { cpfValido, limparCpf } from '@shared/cpf'
import type { Cliente, ClienteResumo } from '@shared/types'
import type { ClienteInput, ClientesListQuery } from '@shared/ipc'

function validarCpfSeInformado(cpf: string | null | undefined): void {
  if (!cpf || !cpf.trim()) return
  if (!cpfValido(cpf)) throw Errors.validacao('CPF inválido. Confira os números digitados.')
}

export const clienteService = {
  listar(query: ClientesListQuery): ClienteResumo[] {
    requireSessao()
    return clienteRepository.listar(query.busca?.trim() ?? '', query.apenasAtivos ?? true, query.limite ?? 200)
  },

  buscarPorId(id: number): Cliente {
    requireSessao()
    const cliente = clienteRepository.buscarPorId(id)
    if (!cliente) throw Errors.naoEncontrado('Cliente')
    return cliente
  },

  criar(input: ClienteInput): Cliente {
    const sessao = requirePermissao('clientes', 'criar')
    validarCpfSeInformado(input.cpf)

    const cpfLimpo = input.cpf ? limparCpf(input.cpf) : null
    if (cpfLimpo && clienteRepository.cpfEmUsoPorOutro(cpfLimpo)) {
      throw Errors.conflito('Já existe um cliente cadastrado com este CPF.')
    }

    const id = clienteRepository.criar({ ...input, cpf: cpfLimpo }, sessao.usuario.id)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'CRIAR',
      entidade: 'cliente',
      entidadeId: id,
      valorNovo: input
    })

    return clienteRepository.buscarPorId(id)!
  },

  atualizar(id: number, input: ClienteInput): Cliente {
    const sessao = requirePermissao('clientes', 'editar')
    const antes = clienteRepository.buscarPorId(id)
    if (!antes) throw Errors.naoEncontrado('Cliente')

    validarCpfSeInformado(input.cpf)
    const cpfLimpo = input.cpf ? limparCpf(input.cpf) : null
    if (cpfLimpo && clienteRepository.cpfEmUsoPorOutro(cpfLimpo, id)) {
      throw Errors.conflito('Já existe um cliente cadastrado com este CPF.')
    }

    clienteRepository.atualizar(id, { ...input, cpf: cpfLimpo }, sessao.usuario.id)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'ATUALIZAR',
      entidade: 'cliente',
      entidadeId: id,
      valorAnterior: antes,
      valorNovo: input
    })

    return clienteRepository.buscarPorId(id)!
  },

  /**
   * RN-13: cliente com historico (receita ou venda) e sempre inativado,
   * nunca excluido. Sem historico, remove de fato - e so uma correcao de
   * cadastro, nao vale a pena guardar como "inativo" para sempre.
   */
  remover(id: number): { modo: 'excluido' | 'inativado' } {
    const sessao = requirePermissao('clientes.excluir', 'ver')
    const cliente = clienteRepository.buscarPorId(id)
    if (!cliente) throw Errors.naoEncontrado('Cliente')

    const temVinculos = clienteRepository.possuiVinculos(id)
    if (temVinculos) {
      clienteRepository.inativar(id)
    } else {
      clienteRepository.excluir(id)
    }

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: temVinculos ? 'INATIVAR' : 'EXCLUIR',
      entidade: 'cliente',
      entidadeId: id,
      valorAnterior: cliente
    })

    return { modo: temVinculos ? 'inativado' : 'excluido' }
  },

  aniversariantes(mes: number | null): ClienteResumo[] {
    requirePermissao('aniversariantes', 'ver')
    return clienteRepository.aniversariantes(mes)
  }
}
