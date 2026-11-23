import { laboratorioRepository } from '@main/repositories/laboratorioRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import { Errors } from '@main/errors'
import type { Laboratorio } from '@shared/types'
import type { LaboratorioExcluirInput, LaboratorioInput, LaboratoriosListQuery } from '@shared/ipc'

function buscar(id: number): Laboratorio {
  const lab = laboratorioRepository.buscarPorId(id)
  if (!lab) throw Errors.naoEncontrado('Laboratório')
  return lab
}

/**
 * Cadastro de laboratorios (RG-02). Quem abre OS precisa VER a lista (os ativos, no select);
 * cadastrar, editar, inativar e excluir e do Administrador. Laboratorio com OS nunca e excluido:
 * so inativado (sai das opcoes de novas OS e continua aparecendo nas antigas).
 */
export const laboratorioService = {
  listar(query: LaboratoriosListQuery): Laboratorio[] {
    requirePermissao('ordens_servico', 'ver')
    return laboratorioRepository.listar(query)
  },

  criar(input: LaboratorioInput): Laboratorio {
    const sessao = requirePermissao('laboratorios', 'criar')
    if (laboratorioRepository.nomeEmUso(input.nome)) {
      throw Errors.conflito(`Já existe um laboratório com o nome ${input.nome.trim().toLocaleUpperCase('pt-BR')}.`)
    }
    const id = laboratorioRepository.criar(input)
    auditoriaRepository.registrar({ usuarioId: sessao.usuario.id, acao: 'CRIAR', entidade: 'laboratorio', entidadeId: id, valorNovo: input })
    return buscar(id)
  },

  atualizar(id: number, input: LaboratorioInput): Laboratorio {
    const sessao = requirePermissao('laboratorios', 'editar')
    const antes = buscar(id)
    if (laboratorioRepository.nomeEmUso(input.nome, id)) {
      throw Errors.conflito(`Já existe outro laboratório com o nome ${input.nome.trim().toLocaleUpperCase('pt-BR')}.`)
    }
    laboratorioRepository.atualizar(id, input)
    auditoriaRepository.registrar({ usuarioId: sessao.usuario.id, acao: 'ATUALIZAR', entidade: 'laboratorio', entidadeId: id, valorAnterior: antes, valorNovo: input })
    return buscar(id)
  },

  setAtivo(id: number, ativo: boolean): void {
    const sessao = requirePermissao('laboratorios', 'editar')
    buscar(id)
    laboratorioRepository.setAtivo(id, ativo)
    auditoriaRepository.registrar({ usuarioId: sessao.usuario.id, acao: ativo ? 'ATIVAR' : 'INATIVAR', entidade: 'laboratorio', entidadeId: id })
  },

  excluir(input: LaboratorioExcluirInput): void {
    const sessao = requirePermissao('laboratorios', 'excluir')
    const lab = buscar(input.id)
    if (lab.osVinculadas > 0) {
      const n = lab.osVinculadas
      throw Errors.conflito(
        `O laboratório ${lab.nome} está em ${n} ordem${n === 1 ? '' : 's'} de serviço e não pode ser excluído. ` +
          'Use "Inativar": ele deixa de aparecer nas novas OS e continua nas antigas.'
      )
    }
    const motivo = input.motivo?.trim() || null
    laboratorioRepository.excluir(input.id, motivo)
    auditoriaRepository.registrar({ usuarioId: sessao.usuario.id, acao: 'EXCLUIR', entidade: 'laboratorio', entidadeId: input.id, valorAnterior: lab, valorNovo: motivo ? { motivo } : null })
  }
}
