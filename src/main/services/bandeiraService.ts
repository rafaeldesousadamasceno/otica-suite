import { bandeiraRepository } from '@main/repositories/bandeiraRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import { Errors } from '@main/errors'
import type { Bandeira } from '@shared/types'
import type { BandeiraExcluirInput, BandeiraInput, BandeirasListQuery } from '@shared/ipc'

function buscar(id: number): Bandeira {
  const bandeira = bandeiraRepository.buscarPorId(id)
  if (!bandeira) throw Errors.naoEncontrado('Bandeira')
  return bandeira
}

const maiusc = (v: string): string => v.trim().toLocaleUpperCase('pt-BR')
const rotulo = (nome: string, adquirente: string | null | undefined): string => (adquirente?.trim() ? `${maiusc(nome)} (${maiusc(adquirente)})` : maiusc(nome))

/**
 * Cadastro de bandeiras de cartao (RG-02). Quem vende precisa VER as ativas (taxa e liquido estimado no
 * select de parcelas); cadastrar, editar, inativar e excluir e do Administrador. Bandeira que ja foi usada numa
 * venda nunca e excluida, so inativada. Mudar a taxa NUNCA recalcula vendas antigas: o snapshot fica na venda.
 */
export const bandeiraService = {
  listar(query: BandeirasListQuery): Bandeira[] {
    const sessao = requirePermissao('bandeiras', 'ver')
    const apenasAtivos = sessao.usuario.perfil === 'admin' ? query.apenasAtivos : true
    return bandeiraRepository.listar({ ...query, apenasAtivos })
  },

  criar(input: BandeiraInput): Bandeira {
    const sessao = requirePermissao('bandeiras', 'criar')
    if (bandeiraRepository.nomeEmUso(input.nome, input.adquirente)) {
      throw Errors.conflito(`Já existe a bandeira ${rotulo(input.nome, input.adquirente)}.`)
    }
    const id = bandeiraRepository.criar(input)
    auditoriaRepository.registrar({ usuarioId: sessao.usuario.id, acao: 'CRIAR', entidade: 'bandeira', entidadeId: id, valorNovo: input })
    return buscar(id)
  },

  atualizar(id: number, input: BandeiraInput): Bandeira {
    const sessao = requirePermissao('bandeiras', 'editar')
    const antes = buscar(id)
    if (bandeiraRepository.nomeEmUso(input.nome, input.adquirente, id)) {
      throw Errors.conflito(`Já existe outra bandeira ${rotulo(input.nome, input.adquirente)}.`)
    }
    bandeiraRepository.atualizar(id, input)
    auditoriaRepository.registrar({ usuarioId: sessao.usuario.id, acao: 'ATUALIZAR', entidade: 'bandeira', entidadeId: id, valorAnterior: antes, valorNovo: input })
    return buscar(id)
  },

  setAtivo(id: number, ativo: boolean): void {
    const sessao = requirePermissao('bandeiras', 'editar')
    buscar(id)
    bandeiraRepository.setAtivo(id, ativo)
    auditoriaRepository.registrar({ usuarioId: sessao.usuario.id, acao: ativo ? 'ATIVAR' : 'INATIVAR', entidade: 'bandeira', entidadeId: id })
  },

  excluir(input: BandeiraExcluirInput): void {
    const sessao = requirePermissao('bandeiras', 'excluir')
    const bandeira = buscar(input.id)
    if (bandeira.vendasVinculadas > 0) {
      const n = bandeira.vendasVinculadas
      throw Errors.conflito(
        `A bandeira ${rotulo(bandeira.nome, bandeira.adquirente)} foi usada em ${n} pagamento${n === 1 ? '' : 's'} de venda e não pode ser excluída. ` +
          'Use "Inativar": ela deixa de aparecer nas vendas novas e continua nas antigas.'
      )
    }
    const motivo = input.motivo?.trim() || null
    bandeiraRepository.excluir(input.id, motivo)
    auditoriaRepository.registrar({ usuarioId: sessao.usuario.id, acao: 'EXCLUIR', entidade: 'bandeira', entidadeId: input.id, valorAnterior: bandeira, valorNovo: motivo ? { motivo } : null })
  }
}
