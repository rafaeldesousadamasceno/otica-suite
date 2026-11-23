import { receitaOpticaRepository } from '@main/repositories/receitaOpticaRepository'
import { clienteRepository } from '@main/repositories/clienteRepository'
import { profissionalRepository } from '@main/repositories/profissionalRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import { Errors } from '@main/errors'
import { normalizarPrescricao, validarPrescricao } from '@shared/prescricao'
import type { ReceitaOptica } from '@shared/types'
import type { ReceitaExcluirInput, ReceitaOpticaAtualizarInput, ReceitaOpticaInput } from '@shared/ipc'

/**
 * Prescricao (no codigo, "receita optica"). Antes de gravar: sem cilindro nao ha
 * eixo e sem prisma a base e "Nenhum" (corrige sozinho); o resto das faixas e
 * regras (DNP obrigatoria, eixo com cilindro, base com prisma, grade da
 * armacao...) barra o salvamento com a mensagem do primeiro problema. A tela
 * mostra todos; aqui fica a garantia para quem salva sem passar por ela.
 *
 * O Perto nao e gravado: sai de Longe + Adicao quando a prescricao e lida.
 */
function prepararParaGravar<T extends ReceitaOpticaInput>(input: T): T {
  const dados = normalizarPrescricao(input)
  const problema = validarPrescricao(dados)[0]
  if (problema) throw Errors.validacao(problema.mensagem)
  return dados
}

function descreverVinculos(vinculos: { tipo: string; numero: string; situacao: string }[]): string {
  return vinculos.map((v) => `${v.tipo === 'OS' ? 'OS' : 'Venda'} ${v.numero} (${v.situacao.toLowerCase()})`).join(', ')
}

export const receitaOpticaService = {
  listarPorCliente(clienteId: number): ReceitaOptica[] {
    requirePermissao('receitas_opticas', 'ver')
    return receitaOpticaRepository.listarPorCliente(clienteId)
  },

  criar(entrada: ReceitaOpticaInput): ReceitaOptica {
    const sessao = requirePermissao('receitas_opticas', 'criar')

    if (!clienteRepository.buscarPorId(entrada.clienteId)) {
      throw Errors.naoEncontrado('Cliente')
    }

    const dados = prepararParaGravar(entrada)
    const profissionalId = dados.profissionalNome?.trim()
      ? profissionalRepository.buscarOuCriarPorNome(dados.profissionalNome)
      : null

    const versao = receitaOpticaRepository.proximaVersao(dados.clienteId)
    const id = receitaOpticaRepository.criar(dados, profissionalId, versao, sessao.usuario.id)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'CRIAR',
      entidade: 'receita_optica',
      entidadeId: id,
      valorNovo: dados
    })

    return receitaOpticaRepository.buscarPorId(id)!
  },

  /**
   * Corrige uma prescricao ja salva (ex.: digitada errado ou salva sem querer).
   * Mexe no mesmo registro, entao OS e vendas ligadas a ela passam a mostrar o
   * valor corrigido; o valor de antes fica na auditoria.
   */
  atualizar(entrada: ReceitaOpticaAtualizarInput): ReceitaOptica {
    const sessao = requirePermissao('receitas_opticas', 'editar')

    const atual = receitaOpticaRepository.buscarPorId(entrada.id)
    if (!atual) throw Errors.naoEncontrado('Prescrição')
    // A prescricao pertence a um cliente: editar nao a muda de ficha.
    if (atual.clienteId !== entrada.clienteId) throw Errors.validacao('Esta prescrição pertence a outro cliente.')

    const dados = prepararParaGravar(entrada)
    const profissionalId = dados.profissionalNome?.trim()
      ? profissionalRepository.buscarOuCriarPorNome(dados.profissionalNome)
      : null

    receitaOpticaRepository.atualizar(dados, profissionalId)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'ATUALIZAR',
      entidade: 'receita_optica',
      entidadeId: entrada.id,
      valorAnterior: atual,
      valorNovo: dados
    })

    return receitaOpticaRepository.buscarPorId(entrada.id)!
  },

  /**
   * Exclusao logica (RG-02): a prescricao some das telas e continua guardada.
   * Se uma OS ou venda ainda valida a usa, bloqueia e diz quais sao.
   */
  excluir(input: ReceitaExcluirInput): void {
    const sessao = requirePermissao('receitas_opticas', 'excluir')
    const atual = receitaOpticaRepository.buscarPorId(input.id)
    if (!atual) throw Errors.naoEncontrado('Prescrição')

    const vinculos = receitaOpticaRepository.vinculosAtivos(input.id)
    if (vinculos.length > 0) {
      throw Errors.conflito(
        `Esta prescrição não pode ser excluída porque está vinculada a: ${descreverVinculos(vinculos)}. Cancele ou desvincule antes.`
      )
    }

    const motivo = input.motivo?.trim() || null
    receitaOpticaRepository.excluir(input.id, motivo)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'EXCLUIR',
      entidade: 'receita_optica',
      entidadeId: input.id,
      valorAnterior: atual,
      valorNovo: motivo ? { motivo } : null
    })
  }
}
