import { formaPagamentoRepository } from '@main/repositories/formaPagamentoRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import { Errors } from '@main/errors'
import type { FormaPagamento } from '@shared/types'
import type { FormaPagamentoExcluirInput, FormaPagamentoInput, FormasPagamentoListQuery } from '@shared/ipc'

function buscar(id: number): FormaPagamento {
  const forma = formaPagamentoRepository.buscarPorId(id)
  if (!forma) throw Errors.naoEncontrado('Forma de pagamento')
  return forma
}

/**
 * Cadastro de formas de pagamento (RG-02). Quem vende precisa VER as ativas (o select da venda);
 * cadastrar, editar, inativar e excluir e do Administrador. Forma que ja foi usada numa venda nunca e
 * excluida, so inativada (sai das vendas novas e continua aparecendo nas antigas). Alterar o cadastro
 * nao recalcula venda nenhuma: cada pagamento guarda o snapshot do que foi calculado.
 */
export const formaPagamentoService = {
  listar(query: FormasPagamentoListQuery): FormaPagamento[] {
    const sessao = requirePermissao('formas_pagamento', 'ver')
    // Quem so vende ve as ativas: inativas e configuracao antiga sao assunto do Administrador.
    const apenasAtivos = sessao.usuario.perfil === 'admin' ? query.apenasAtivos : true
    return formaPagamentoRepository.listar({ ...query, apenasAtivos })
  },

  criar(input: FormaPagamentoInput): FormaPagamento {
    const sessao = requirePermissao('formas_pagamento', 'criar')
    if (formaPagamentoRepository.nomeEmUso(input.nome)) {
      throw Errors.conflito(`Já existe uma forma de pagamento com o nome ${input.nome.trim().toLocaleUpperCase('pt-BR')}.`)
    }
    const id = formaPagamentoRepository.criar(input)
    auditoriaRepository.registrar({ usuarioId: sessao.usuario.id, acao: 'CRIAR', entidade: 'forma_pagamento', entidadeId: id, valorNovo: input })
    return buscar(id)
  },

  atualizar(id: number, input: FormaPagamentoInput): FormaPagamento {
    const sessao = requirePermissao('formas_pagamento', 'editar')
    const antes = buscar(id)
    if (formaPagamentoRepository.nomeEmUso(input.nome, id)) {
      throw Errors.conflito(`Já existe outra forma de pagamento com o nome ${input.nome.trim().toLocaleUpperCase('pt-BR')}.`)
    }
    formaPagamentoRepository.atualizar(id, input)
    auditoriaRepository.registrar({ usuarioId: sessao.usuario.id, acao: 'ATUALIZAR', entidade: 'forma_pagamento', entidadeId: id, valorAnterior: antes, valorNovo: input })
    return buscar(id)
  },

  setAtivo(id: number, ativo: boolean): void {
    const sessao = requirePermissao('formas_pagamento', 'editar')
    buscar(id)
    formaPagamentoRepository.setAtivo(id, ativo)
    auditoriaRepository.registrar({ usuarioId: sessao.usuario.id, acao: ativo ? 'ATIVAR' : 'INATIVAR', entidade: 'forma_pagamento', entidadeId: id })
  },

  excluir(input: FormaPagamentoExcluirInput): void {
    const sessao = requirePermissao('formas_pagamento', 'excluir')
    const forma = buscar(input.id)
    if (forma.vendasVinculadas > 0) {
      const n = forma.vendasVinculadas
      throw Errors.conflito(
        `A forma de pagamento ${forma.nome} foi usada em ${n} pagamento${n === 1 ? '' : 's'} de venda e não pode ser excluída. ` +
          'Use "Inativar": ela deixa de aparecer nas vendas novas e continua nas antigas.'
      )
    }
    const motivo = input.motivo?.trim() || null
    formaPagamentoRepository.excluir(input.id, motivo)
    auditoriaRepository.registrar({ usuarioId: sessao.usuario.id, acao: 'EXCLUIR', entidade: 'forma_pagamento', entidadeId: input.id, valorAnterior: forma, valorNovo: motivo ? { motivo } : null })
  }
}
