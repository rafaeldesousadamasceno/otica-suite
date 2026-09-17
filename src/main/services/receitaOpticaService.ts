import { receitaOpticaRepository } from '@main/repositories/receitaOpticaRepository'
import { clienteRepository } from '@main/repositories/clienteRepository'
import { profissionalRepository } from '@main/repositories/profissionalRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import { Errors } from '@main/errors'
import type { ReceitaOptica } from '@shared/types'
import type { ReceitaOpticaInput } from '@shared/ipc'

/**
 * RN-02: esferico de perto = esferico de longe + adicao, calculado
 * automaticamente - mas so quando o campo de perto foi deixado em branco.
 * Se o profissional digitou um valor de perto diferente, isso e
 * respeitado (a regra e um atalho, nao uma imposicao).
 */
function aplicarCalculoDeAdicao(input: ReceitaOpticaInput): ReceitaOpticaInput {
  if (input.adicao === null) return input

  const calculado = { ...input }
  if (calculado.pertoOdEsf === null && calculado.longeOdEsf !== null) {
    calculado.pertoOdEsf = Math.round((calculado.longeOdEsf! + input.adicao!) * 4) / 4
  }
  if (calculado.pertoOeEsf === null && calculado.longeOeEsf !== null) {
    calculado.pertoOeEsf = Math.round((calculado.longeOeEsf! + input.adicao!) * 4) / 4
  }
  return calculado
}

export const receitaOpticaService = {
  listarPorCliente(clienteId: number): ReceitaOptica[] {
    requirePermissao('receitas_opticas', 'ver')
    return receitaOpticaRepository.listarPorCliente(clienteId)
  },

  criar(input: ReceitaOpticaInput): ReceitaOptica {
    const sessao = requirePermissao('receitas_opticas', 'criar')

    if (!clienteRepository.buscarPorId(input.clienteId)) {
      throw Errors.naoEncontrado('Cliente')
    }

    const profissionalId = input.profissionalNome?.trim()
      ? profissionalRepository.buscarOuCriarPorNome(input.profissionalNome)
      : null

    const dados = aplicarCalculoDeAdicao(input)
    const versao = receitaOpticaRepository.proximaVersao(input.clienteId)
    const id = receitaOpticaRepository.criar(dados, profissionalId, versao, sessao.usuario.id)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'CRIAR',
      entidade: 'receita_optica',
      entidadeId: id,
      valorNovo: dados
    })

    const [criada] = receitaOpticaRepository
      .listarPorCliente(input.clienteId)
      .filter((r) => r.id === id)
    return criada
  }
}
