import { listaValorRepository } from '@main/repositories/listaValorRepository'
import { produtoRepository } from '@main/repositories/produtoRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao, requireSessao } from '@main/auth/session'
import { AppError, Errors } from '@main/errors'
import { UNIDADE_PADRAO, type ListaValorItem, type UnidadeMedida } from '@shared/types'
import type { UnidadeMedidaInput, UnidadeMedidaUpdateInput } from '@shared/ipc'

const TIPO = 'unidade_medida'

function paraUnidade(item: ListaValorItem, produtos: number): UnidadeMedida {
  return { id: item.id, sigla: item.valor, descricao: item.descricao, ativo: item.ativo, produtos }
}

function buscar(id: number): ListaValorItem {
  const item = listaValorRepository.buscarPorId(id)
  if (!item || item.tipo !== TIPO) throw new AppError('NAO_ENCONTRADO', 'Unidade de medida não encontrada.')
  return item
}

function comContagem(item: ListaValorItem): UnidadeMedida {
  return paraUnidade(item, produtoRepository.contarPorUnidade().get(item.valor) ?? 0)
}

/**
 * Cadastro das unidades de medida do produto. Quem cadastra produto cadastra
 * unidade (para nao travar no meio de um cadastro); editar e desativar seguem
 * a permissao de editar produto.
 */
export const unidadeMedidaService = {
  /** Todas, inclusive as inativas: a tela de produto precisa delas para mostrar a unidade de um produto antigo. */
  listar(): UnidadeMedida[] {
    requireSessao()
    const contagem = produtoRepository.contarPorUnidade()
    return listaValorRepository.listarPorTipo(TIPO, false).map((u) => paraUnidade(u, contagem.get(u.valor) ?? 0))
  },

  /** Sigla que ja existe desativada volta a ficar ativa (com a descricao nova), em vez de dar erro. */
  criar(input: UnidadeMedidaInput): UnidadeMedida {
    const sessao = requirePermissao('produtos', 'criar')
    const existente = listaValorRepository.buscarPorValor(TIPO, input.sigla)

    if (existente?.ativo) throw Errors.conflito(`A unidade ${existente.valor} já está cadastrada.`)

    if (existente) {
      listaValorRepository.atualizarDescricao(existente.id, input.descricao)
      listaValorRepository.setAtivo(existente.id, true)
      auditoriaRepository.registrar({
        usuarioId: sessao.usuario.id,
        acao: 'ATIVAR',
        entidade: TIPO,
        entidadeId: existente.id,
        valorAnterior: { sigla: existente.valor, descricao: existente.descricao, ativo: false },
        valorNovo: { sigla: existente.valor, descricao: input.descricao, ativo: true }
      })
      return comContagem(buscar(existente.id))
    }

    const id = listaValorRepository.criar(TIPO, input.sigla, input.descricao)
    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'CRIAR',
      entidade: TIPO,
      entidadeId: id,
      valorNovo: input
    })
    return comContagem(buscar(id))
  },

  atualizar(input: UnidadeMedidaUpdateInput): UnidadeMedida {
    const sessao = requirePermissao('produtos', 'editar')
    const antes = buscar(input.id)

    listaValorRepository.atualizarDescricao(antes.id, input.descricao)
    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'ATUALIZAR',
      entidade: TIPO,
      entidadeId: antes.id,
      valorAnterior: { sigla: antes.valor, descricao: antes.descricao },
      valorNovo: { sigla: antes.valor, descricao: input.descricao }
    })
    return comContagem(buscar(antes.id))
  },

  /** Desativar so tira a unidade das opcoes: os produtos que ja usam continuam com ela. */
  setAtivo(id: number, ativo: boolean): void {
    const sessao = requirePermissao('produtos', 'editar')
    const item = buscar(id)
    if (!ativo && item.valor === UNIDADE_PADRAO) {
      throw Errors.validacao(`A unidade ${UNIDADE_PADRAO} é a padrão do sistema e não pode ser desativada.`)
    }

    listaValorRepository.setAtivo(id, ativo)
    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: ativo ? 'ATIVAR' : 'INATIVAR',
      entidade: TIPO,
      entidadeId: id
    })
  },

  /**
   * O produto so grava sigla da lista, e ativa. A excecao e a sigla que o
   * produto ja tinha: editar um produto antigo nao obriga a trocar a unidade
   * so porque ela foi desativada depois. Devolve a sigla como esta na lista.
   */
  validarParaProduto(sigla: string, siglaAtual?: string): string {
    if (siglaAtual !== undefined && sigla === siglaAtual) return sigla
    const item = listaValorRepository.buscarPorValor(TIPO, sigla)
    if (!item) throw Errors.validacao(`A unidade ${sigla} não está cadastrada. Cadastre-a antes de usar no produto.`)
    if (!item.ativo) throw Errors.validacao(`A unidade ${item.valor} está desativada. Escolha outra ou reative-a.`)
    return item.valor
  }
}
