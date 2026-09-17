import { contaPagarRepository } from '@main/repositories/contaPagarRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import { Errors } from '@main/errors'
import type { ContaPagar } from '@shared/types'
import type { ContaPagarCriarInput, ContaPagarPagarInput, ContasPagarListQuery } from '@shared/ipc'

/** RF-11.2: contas a pagar sao exclusivas do Administrador. */
export const contaPagarService = {
  listar(query: ContasPagarListQuery): ContaPagar[] {
    requirePermissao('contas_pagar', 'ver')
    return contaPagarRepository.listar(query)
  },

  criar(input: ContaPagarCriarInput): ContaPagar {
    const sessao = requirePermissao('contas_pagar', 'criar')
    const id = contaPagarRepository.criar({
      descricao: input.descricao,
      categoria: input.categoria?.trim() || null,
      valorCentavos: input.valorCentavos,
      vencimento: input.vencimento,
      recorrente: input.recorrente ?? false
    })

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'CRIAR',
      entidade: 'conta_pagar',
      entidadeId: id,
      valorNovo: input
    })

    return contaPagarRepository.buscarPorId(id)!
  },

  pagar(input: ContaPagarPagarInput): ContaPagar {
    const sessao = requirePermissao('contas_pagar', 'editar')
    const conta = contaPagarRepository.buscarPorId(input.id)
    if (!conta) throw Errors.naoEncontrado('Conta a pagar')
    if (conta.situacao !== 'ABERTA') {
      throw Errors.validacao('Esta conta não está em aberto.')
    }

    const restante = conta.valorCentavos - conta.valorPagoCentavos
    if (input.valorCentavos <= 0 || input.valorCentavos > restante) {
      throw Errors.validacao(`O valor do pagamento não pode passar do restante da conta (${restante} centavos).`)
    }

    contaPagarRepository.pagar(input.id, {
      valorCentavos: input.valorCentavos,
      data: input.data ?? null,
      formaPagamento: input.formaPagamento,
      usuarioId: sessao.usuario.id
    })

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'PAGAR',
      entidade: 'conta_pagar',
      entidadeId: input.id,
      valorAnterior: { situacao: conta.situacao, valorPagoCentavos: conta.valorPagoCentavos },
      valorNovo: { valorCentavos: input.valorCentavos, formaPagamento: input.formaPagamento }
    })

    return contaPagarRepository.buscarPorId(input.id)!
  }
}
