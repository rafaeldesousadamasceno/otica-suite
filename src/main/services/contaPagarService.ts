import { contaPagarRepository } from '@main/repositories/contaPagarRepository'
import { recorrenciaRepository } from '@main/repositories/recorrenciaRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { recorrenciaService } from '@main/services/recorrenciaService'
import { requirePermissao } from '@main/auth/session'
import { Errors } from '@main/errors'
import { competenciaDeData, dataFimAoExcluirEstaEAsProximas } from '@shared/recorrencia'
import type { ContaPagar, RecorrenciaAcaoResultado } from '@shared/types'
import type {
  ContaPagarCriarInput,
  ContaPagarEditarInput,
  ContaPagarExcluirInput,
  ContaPagarPagarInput,
  ContasPagarListQuery
} from '@shared/ipc'

function buscar(id: number): ContaPagar {
  const conta = contaPagarRepository.buscarPorId(id)
  if (!conta) throw Errors.naoEncontrado('Conta a pagar')
  return conta
}

/** RF-11.2: contas a pagar sao exclusivas do Administrador. */
export const contaPagarService = {
  /**
   * Abrir a lista e o momento em que o job de recorrencia completa o horizonte de 12 meses
   * (idempotente), para as contas dos proximos meses ja estarem la.
   */
  listar(query: ContasPagarListQuery): ContaPagar[] {
    requirePermissao('contas_pagar', 'ver')
    recorrenciaService.completarHorizonte()
    return contaPagarRepository.listar(query)
  },

  /**
   * Conta avulsa, ou (com `recorrente`) uma recorrencia: cria a serie e materializa as ocorrencias.
   * Devolve a conta do primeiro vencimento.
   */
  criar(input: ContaPagarCriarInput): ContaPagar {
    const sessao = requirePermissao('contas_pagar', 'criar')
    const categoria = input.categoria?.trim() || null
    const fornecedorId = input.fornecedorId ?? null
    if (fornecedorId !== null && !contaPagarRepository.fornecedorExiste(fornecedorId)) {
      throw Errors.naoEncontrado('Fornecedor')
    }

    if (input.recorrente) {
      const frequencia = input.frequencia ?? 'MENSAL'
      const dataFim = input.dataFim?.trim() || null
      const recorrenciaId = recorrenciaRepository.criar({
        descricao: input.descricao,
        categoria,
        fornecedorId,
        frequencia,
        primeiroVencimento: input.vencimento,
        dataFim,
        valorCentavos: input.valorCentavos
      })
      auditoriaRepository.registrar({
        usuarioId: sessao.usuario.id,
        acao: 'CRIAR',
        entidade: 'recorrencia',
        entidadeId: recorrenciaId,
        valorNovo: { ...input, frequencia, dataFim }
      })
      return contaPagarRepository.buscarPorSerieECompetencia(recorrenciaId, competenciaDeData(input.vencimento))!
    }

    const id = contaPagarRepository.criar({
      descricao: input.descricao,
      categoria,
      fornecedorId,
      valorCentavos: input.valorCentavos,
      vencimento: input.vencimento
    })

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'CRIAR',
      entidade: 'conta_pagar',
      entidadeId: id,
      valorNovo: input
    })

    return buscar(id)
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

    return buscar(input.id)
  },

  /**
   * Editar uma ocorrencia de recorrencia em aberto.
   *  - SOMENTE_ESTE: so esta conta muda (valor proprio e, se vier, o vencimento);
   *  - ESTE_E_PROXIMOS: e um reajuste a partir da competencia desta conta (o vencimento nao muda).
   * Nunca "todos": as contas pagas e as anteriores ficam como estao.
   */
  editar(input: ContaPagarEditarInput): ContaPagar {
    const sessao = requirePermissao('contas_pagar', 'editar')
    const conta = buscar(input.id)
    if (conta.recorrenciaId === null || conta.competencia === null) {
      throw Errors.validacao('Só as contas de uma despesa recorrente podem ser editadas por aqui.')
    }
    if (conta.situacao !== 'ABERTA' || conta.valorPagoCentavos > 0) {
      throw Errors.conflito('Esta conta já foi paga (ou tem pagamento) e não pode ser alterada.')
    }

    if (input.escopo === 'ESTE_E_PROXIMOS') {
      if (input.vencimento && input.vencimento !== conta.vencimento) {
        throw Errors.validacao('Em "este e os próximos" só o valor muda. Para mudar o vencimento, edite somente esta conta.')
      }
      recorrenciaService.reajustarInterno(sessao.usuario.id, conta.recorrenciaId, conta.competencia, input.valorCentavos)
      return buscar(input.id)
    }

    const vencimento = input.vencimento ?? conta.vencimento
    contaPagarRepository.atualizarOcorrencia(input.id, { valorCentavos: input.valorCentavos, vencimento })
    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'ATUALIZAR',
      entidade: 'conta_pagar',
      entidadeId: input.id,
      valorAnterior: { valorCentavos: conta.valorCentavos, vencimento: conta.vencimento },
      valorNovo: { escopo: input.escopo, valorCentavos: input.valorCentavos, vencimento }
    })
    return buscar(input.id)
  },

  /**
   * Exclusao logica (RG-02). A confirmacao (RG-01) e da tela; as regras sao daqui:
   *  - conta paga (ou com pagamento): bloqueada, o pagamento tem de ser estornado antes;
   *  - conta gerada por uma compra: bloqueada (a compra e o registro dela);
   *  - avulsa: so ela;
   *  - de recorrencia: SOMENTE_ESTA (padrao; o job nao recria a competencia, pela chave unica que conta
   *    tambem as excluidas) ou ESTA_E_PROXIMAS (exclui as proximas em aberto e encerra a serie).
   */
  excluir(input: ContaPagarExcluirInput): RecorrenciaAcaoResultado {
    const sessao = requirePermissao('contas_pagar', 'excluir')
    const conta = buscar(input.id)
    if (conta.situacao === 'PAGA' || conta.valorPagoCentavos > 0) {
      throw Errors.conflito('Esta conta já foi paga e não pode ser excluída. Estorne o pagamento antes de excluí-la.')
    }
    if (conta.compraId !== null) {
      throw Errors.conflito('Esta conta foi gerada por uma compra (entrada de mercadoria) e não pode ser excluída aqui.')
    }

    const motivo = input.motivo?.trim() || null
    const emSerie = conta.recorrenciaId !== null && conta.competencia !== null
    const escopo = emSerie ? (input.escopo ?? 'SOMENTE_ESTA') : 'SOMENTE_ESTA'

    let excluidas = 1
    if (emSerie && escopo === 'ESTA_E_PROXIMAS') {
      excluidas = recorrenciaRepository.excluirEstaEAsProximas(
        conta.id,
        conta.recorrenciaId!,
        conta.competencia!,
        dataFimAoExcluirEstaEAsProximas(conta.competencia!),
        motivo
      )
    } else {
      contaPagarRepository.excluir(conta.id, motivo)
    }

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'EXCLUIR',
      entidade: 'conta_pagar',
      entidadeId: conta.id,
      valorAnterior: {
        descricao: conta.descricao,
        valorCentavos: conta.valorCentavos,
        vencimento: conta.vencimento,
        recorrenciaId: conta.recorrenciaId,
        competencia: conta.competencia
      },
      valorNovo: { escopo, motivo, contasExcluidas: excluidas }
    })
    return { afetadas: excluidas }
  }
}
