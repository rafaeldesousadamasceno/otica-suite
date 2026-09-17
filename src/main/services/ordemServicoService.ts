import { ordemServicoRepository } from '@main/repositories/ordemServicoRepository'
import { clienteRepository } from '@main/repositories/clienteRepository'
import { configuracaoRepository } from '@main/repositories/configuracaoRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import { Errors } from '@main/errors'
import { proximaSituacao, campoDataDaSituacao, transicaoValida } from '@shared/situacaoOS'
import type { OrdemServico } from '@shared/types'
import type {
  OrdemServicoCreateInput,
  OrdemServicoCancelarInput,
  OrdemServicoAtualizarDatasInput,
  OrdensServicoQuery
} from '@shared/ipc'

const CAMPO_DATA_PARA_COLUNA = {
  dataEnvio: 'data_envio',
  dataChegada: 'data_chegada',
  dataEntrega: 'data_entrega'
} as const

export const ordemServicoService = {
  listar(query: OrdensServicoQuery): OrdemServico[] {
    requirePermissao('ordens_servico', 'ver')
    return ordemServicoRepository.listar(query)
  },

  buscarPorId(id: number): OrdemServico {
    requirePermissao('ordens_servico', 'ver')
    const os = ordemServicoRepository.buscarPorId(id)
    if (!os) throw Errors.naoEncontrado('Ordem de Serviço')
    return os
  },

  listarPorCliente(clienteId: number): OrdemServico[] {
    requirePermissao('ordens_servico', 'ver')
    return ordemServicoRepository.listarPorCliente(clienteId)
  },

  criar(input: OrdemServicoCreateInput): OrdemServico {
    const sessao = requirePermissao('ordens_servico', 'criar')

    if (!clienteRepository.buscarPorId(input.clienteId)) {
      throw Errors.naoEncontrado('Cliente')
    }

    const prefixo = configuracaoRepository.obter('prefixo_os') ?? ''
    const id = ordemServicoRepository.criar(input, prefixo, sessao.usuario.id)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'CRIAR',
      entidade: 'ordem_servico',
      entidadeId: id,
      valorNovo: input
    })

    return ordemServicoRepository.buscarPorId(id)!
  },

  /** RN-04: avanca para o proximo estado do fluxo, preenchendo a data do evento. */
  avancar(id: number, data: string | null): OrdemServico {
    const sessao = requirePermissao('ordens_servico', 'editar')
    const os = ordemServicoRepository.buscarPorId(id)
    if (!os) throw Errors.naoEncontrado('Ordem de Serviço')

    const proxima = proximaSituacao(os.situacao)
    if (!proxima || !transicaoValida(os.situacao, proxima)) {
      throw Errors.validacao(`Não é possível avançar uma OS que está "${os.situacao}".`)
    }

    const campo = campoDataDaSituacao(proxima)
    const coluna = campo ? CAMPO_DATA_PARA_COLUNA[campo] : null
    ordemServicoRepository.atualizarSituacao(id, proxima, coluna, data)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'AVANCAR_SITUACAO',
      entidade: 'ordem_servico',
      entidadeId: id,
      valorAnterior: { situacao: os.situacao },
      valorNovo: { situacao: proxima }
    })

    return ordemServicoRepository.buscarPorId(id)!
  },

  cancelar(input: OrdemServicoCancelarInput): OrdemServico {
    const sessao = requirePermissao('ordens_servico', 'editar')
    const os = ordemServicoRepository.buscarPorId(input.id)
    if (!os) throw Errors.naoEncontrado('Ordem de Serviço')

    if (!transicaoValida(os.situacao, 'CANCELADA')) {
      throw Errors.validacao('Uma OS já entregue não pode ser cancelada.')
    }

    ordemServicoRepository.cancelar(input.id, input.motivo)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'CANCELAR',
      entidade: 'ordem_servico',
      entidadeId: input.id,
      valorAnterior: { situacao: os.situacao },
      valorNovo: { motivo: input.motivo }
    })

    return ordemServicoRepository.buscarPorId(input.id)!
  },

  atualizarDados(input: OrdemServicoAtualizarDatasInput): OrdemServico {
    const sessao = requirePermissao('ordens_servico', 'editar')
    const os = ordemServicoRepository.buscarPorId(input.id)
    if (!os) throw Errors.naoEncontrado('Ordem de Serviço')

    ordemServicoRepository.atualizarDados(
      input.id,
      input.laboratorio?.trim() || null,
      input.dataPrevisao?.trim() || null,
      input.observacao?.trim() || null
    )

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'ATUALIZAR',
      entidade: 'ordem_servico',
      entidadeId: input.id,
      valorAnterior: os,
      valorNovo: input
    })

    return ordemServicoRepository.buscarPorId(input.id)!
  },

  /** RF-06: protocolo de saida - lista para conferencia/impressao, com o mesmo filtro de listar(). */
  protocoloSaida(query: OrdensServicoQuery): OrdemServico[] {
    requirePermissao('protocolo_saida', 'ver')
    return ordemServicoRepository.listar(query)
  }
}
