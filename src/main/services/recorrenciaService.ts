import { recorrenciaRepository } from '@main/repositories/recorrenciaRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import { Errors } from '@main/errors'
import { competenciaDeData } from '@shared/recorrencia'
import type { Recorrencia, RecorrenciaAcaoResultado } from '@shared/types'
import type { RecorrenciaEncerrarInput, RecorrenciaReajustarInput } from '@shared/ipc'

function buscar(id: number): Recorrencia {
  const r = recorrenciaRepository.buscarPorId(id)
  if (!r) throw Errors.naoEncontrado('Recorrência')
  return r
}

/**
 * Series de contas a pagar (aluguel, energia...). Valem as permissoes de contas a pagar, checadas aqui
 * no main. O renderer so manda o que o usuario escolheu: quais contas mudam e quais saem e decidido
 * aqui, nunca confiado a tela.
 */
export const recorrenciaService = {
  listar(): Recorrencia[] {
    requirePermissao('contas_pagar', 'ver')
    return recorrenciaRepository.listar()
  },

  /**
   * O job de recorrencia: completa o horizonte de 12 meses de todas as series ativas. Idempotente.
   * Uma falha aqui nunca derruba a tela que o chamou (so fica no log): a lista continua abrindo.
   */
  completarHorizonte(): void {
    try {
      recorrenciaRepository.completarHorizonte()
    } catch (err) {
      console.error('[recorrencia] falha ao completar o horizonte', err)
    }
  },

  /** Reajuste: o valor novo vale da competencia `aPartirDe` em diante, so nas contas em aberto. */
  reajustar(input: RecorrenciaReajustarInput): RecorrenciaAcaoResultado {
    const sessao = requirePermissao('contas_pagar', 'editar')
    return recorrenciaService.reajustarInterno(sessao.usuario.id, input.id, input.aPartirDe, input.valorCentavos)
  },

  /** Usado tambem por "editar este e os proximos". A permissao ja foi checada por quem chama. */
  reajustarInterno(usuarioId: number, id: number, aPartirDe: string, valorCentavos: number): RecorrenciaAcaoResultado {
    const antes = buscar(id)
    if (antes.status !== 'ATIVA') throw Errors.conflito('Esta recorrência está encerrada: não dá para reajustar o valor.')
    if (aPartirDe < competenciaDeData(antes.dataInicio)) {
      throw Errors.validacao('O reajuste não pode começar antes do início da recorrência.')
    }
    if (valorCentavos <= 0) throw Errors.validacao('Informe um valor maior que zero.')

    const atualizadas = recorrenciaRepository.reajustar(id, aPartirDe, valorCentavos)

    auditoriaRepository.registrar({
      usuarioId,
      acao: 'REAJUSTAR',
      entidade: 'recorrencia',
      entidadeId: id,
      valorAnterior: { descricao: antes.descricao, valorAtualCentavos: antes.valorAtualCentavos, vigencias: antes.vigencias },
      valorNovo: { aPartirDe, valorCentavos, contasAtualizadas: atualizadas }
    })
    return { afetadas: atualizadas }
  },

  /** Encerra a serie na data de fim: o que ainda esta em aberto e vence depois dela e excluido (logicamente). */
  encerrar(input: RecorrenciaEncerrarInput): RecorrenciaAcaoResultado {
    const sessao = requirePermissao('contas_pagar', 'editar')
    const antes = buscar(input.id)
    if (antes.status !== 'ATIVA') throw Errors.conflito('Esta recorrência já está encerrada.')
    if (input.dataFim < antes.dataInicio) throw Errors.validacao('A data de término não pode ser antes do início da recorrência.')

    const motivo = input.motivo?.trim() || null
    const removidas = recorrenciaRepository.encerrar(input.id, input.dataFim, motivo)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'ENCERRAR',
      entidade: 'recorrencia',
      entidadeId: input.id,
      valorAnterior: { descricao: antes.descricao, status: antes.status, dataFim: antes.dataFim },
      valorNovo: { status: 'ENCERRADA', dataFim: input.dataFim, contasRemovidas: removidas, motivo }
    })
    return { afetadas: removidas }
  }
}
