import { contaReceberRepository } from '@main/repositories/contaReceberRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import { Errors } from '@main/errors'
import type { ContaReceber } from '@shared/types'
import type { ContaReceberBaixarInput, ContasReceberListQuery } from '@shared/ipc'

export const contaReceberService = {
  listar(query: ContasReceberListQuery): ContaReceber[] {
    const sessao = requirePermissao('contas_receber', 'ver')
    const todas = contaReceberRepository.listar(query)
    // RF-11.1: vendedor da baixa (e ve) so nas parcelas das proprias vendas.
    if (sessao.usuario.perfil === 'admin') return todas
    return todas.filter((c) => c.vendedorId === sessao.usuario.id)
  },

  listarPorVenda(vendaId: number): ContaReceber[] {
    const sessao = requirePermissao('contas_receber', 'ver')
    const todas = contaReceberRepository.listarPorVenda(vendaId)
    if (sessao.usuario.perfil === 'admin') return todas
    return todas.filter((c) => c.vendedorId === sessao.usuario.id)
  },

  darBaixa(input: ContaReceberBaixarInput): ContaReceber {
    const sessao = requirePermissao('contas_receber', 'editar')
    const conta = contaReceberRepository.buscarPorId(input.id)
    if (!conta) throw Errors.naoEncontrado('Parcela')
    if (sessao.usuario.perfil !== 'admin' && conta.vendedorId !== sessao.usuario.id) {
      throw Errors.semPermissao()
    }
    if (conta.situacao !== 'ABERTA') {
      throw Errors.validacao('Esta parcela não está em aberto.')
    }

    const restante = conta.valorCentavos - conta.valorRecebidoCentavos
    if (input.valorCentavos <= 0 || input.valorCentavos > restante) {
      throw Errors.validacao(`O valor do recebimento não pode passar do restante da parcela (${restante} centavos).`)
    }

    contaReceberRepository.baixar(input.id, {
      valorCentavos: input.valorCentavos,
      data: input.data ?? null,
      formaPagamento: input.formaPagamento,
      usuarioId: sessao.usuario.id
    })

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'BAIXAR_PARCELA',
      entidade: 'conta_receber',
      entidadeId: input.id,
      valorAnterior: { situacao: conta.situacao, valorRecebidoCentavos: conta.valorRecebidoCentavos },
      valorNovo: { valorCentavos: input.valorCentavos, formaPagamento: input.formaPagamento }
    })

    return contaReceberRepository.buscarPorId(input.id)!
  }
}
