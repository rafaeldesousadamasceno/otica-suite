import { receitaOpticaRepository } from '@main/repositories/receitaOpticaRepository'
import { clienteRepository } from '@main/repositories/clienteRepository'
import { profissionalRepository } from '@main/repositories/profissionalRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import { Errors } from '@main/errors'
import { calcularPertoEsf } from '@shared/receitaCalculo'
import type { ReceitaOptica } from '@shared/types'
import type { ReceitaOpticaAtualizarInput, ReceitaOpticaInput } from '@shared/ipc'

/**
 * RN-02: esferico de perto = esferico de longe + adicao, calculado
 * automaticamente - mas so quando o campo de perto foi deixado em branco.
 * Se o profissional digitou um valor de perto diferente, isso e
 * respeitado (a regra e um atalho, nao uma imposicao).
 *
 * O formulario faz a mesma conta na tela, enquanto se digita a adicao
 * (`calcularPertoEsf`, compartilhada); aqui fica a garantia para quem salva sem
 * passar pela tela (importacao, outro cliente da API).
 */
function aplicarCalculoDeAdicao(input: ReceitaOpticaInput): ReceitaOpticaInput {
  if (input.adicao === null) return input

  const calculado = { ...input }
  if (calculado.pertoOdEsf === null) calculado.pertoOdEsf = calcularPertoEsf(calculado.longeOdEsf, input.adicao)
  if (calculado.pertoOeEsf === null) calculado.pertoOeEsf = calcularPertoEsf(calculado.longeOeEsf, input.adicao)
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
  },

  /**
   * Corrige uma receita ja salva (ex.: digitada errado ou salva sem querer).
   * Mexe no mesmo registro, entao OS e vendas ligadas a ela passam a mostrar o
   * valor corrigido; o valor de antes fica na auditoria.
   */
  atualizar(input: ReceitaOpticaAtualizarInput): ReceitaOptica {
    const sessao = requirePermissao('receitas_opticas', 'editar')

    const atual = receitaOpticaRepository.buscarPorId(input.id)
    if (!atual) throw Errors.naoEncontrado('Receita')
    // A receita pertence a um cliente: editar nao a muda de ficha.
    if (atual.clienteId !== input.clienteId) throw Errors.validacao('Esta receita pertence a outro cliente.')

    const profissionalId = input.profissionalNome?.trim()
      ? profissionalRepository.buscarOuCriarPorNome(input.profissionalNome)
      : null

    const dados = aplicarCalculoDeAdicao(input) as ReceitaOpticaAtualizarInput
    receitaOpticaRepository.atualizar(dados, profissionalId)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'ATUALIZAR',
      entidade: 'receita_optica',
      entidadeId: input.id,
      valorAnterior: atual,
      valorNovo: dados
    })

    return receitaOpticaRepository.buscarPorId(input.id)!
  }
}
