import { ordemServicoRepository } from '@main/repositories/ordemServicoRepository'
import { clienteRepository } from '@main/repositories/clienteRepository'
import { laboratorioRepository } from '@main/repositories/laboratorioRepository'
import { receitaOpticaRepository } from '@main/repositories/receitaOpticaRepository'
import { configuracaoRepository } from '@main/repositories/configuracaoRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import { Errors } from '@main/errors'
import { maiusculoOuNulo } from '@shared/texto'
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

/**
 * Laboratorio escolhido na OS: so um cadastrado e ATIVO (inativo some das opcoes de OS novas).
 * Na edicao, o laboratorio que a OS ja tem continua valendo mesmo se foi inativado depois.
 */
function resolverLaboratorio(id: number | null, atualId: number | null): { id: number; nome: string } | null {
  if (id === null) return null
  const lab = laboratorioRepository.buscarPorId(id)
  if (!lab) throw Errors.naoEncontrado('Laboratório')
  if (!lab.ativo && id !== atualId) {
    throw Errors.validacao(`O laboratório ${lab.nome} está inativo. Escolha outro ou reative-o em Laboratórios.`)
  }
  return { id: lab.id, nome: lab.nome }
}

/** A prescricao vinculada tem de existir (nao excluida) e ser deste cliente: o FK sozinho nao garante nem uma coisa nem outra. */
function exigirPrescricaoDoCliente(receitaId: number | null | undefined, clienteId: number): void {
  if (!receitaId) return
  const receita = receitaOpticaRepository.buscarPorId(receitaId)
  if (!receita || receita.clienteId !== clienteId) {
    throw Errors.validacao('A prescrição selecionada não existe mais ou não pertence a este cliente.')
  }
}

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

    exigirPrescricaoDoCliente(input.receitaOpticaId, input.clienteId)
    const lab = resolverLaboratorio(input.laboratorioId ?? null, null)
    const prefixo = configuracaoRepository.obter('prefixo_os') ?? ''
    const id = ordemServicoRepository.criar(input, lab, prefixo, sessao.usuario.id)

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

    ordemServicoRepository.atualizarDados(input.id, {
      // Ausente = mantem o laboratorio da OS; null = tira.
      lab: input.laboratorioId === undefined ? undefined : resolverLaboratorio(input.laboratorioId, os.laboratorioId),
      entregadorNome: input.entregadorNome === undefined ? os.entregadorNome : maiusculoOuNulo(input.entregadorNome),
      entregadorContato: input.entregadorContato === undefined ? os.entregadorContato : input.entregadorContato,
      dataPrevisao: input.dataPrevisao?.trim() || null,
      observacao: input.observacao?.trim() || null
    })

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
