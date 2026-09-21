import { usuarioRepository } from '@main/repositories/usuarioRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { hashPassword } from '@main/auth/password'
import { requirePermissao } from '@main/auth/session'
import { Errors } from '@main/errors'
import type { Usuario } from '@shared/types'
import type { UsuarioCreateInput } from '@shared/ipc'

export const usuarioService = {
  listar(): Usuario[] {
    requirePermissao('usuarios', 'ver')
    return usuarioRepository.listar()
  },

  async criar(input: UsuarioCreateInput): Promise<Usuario> {
    const sessao = requirePermissao('usuarios', 'criar')

    if (usuarioRepository.buscarPorLogin(input.login)) {
      throw Errors.conflito('Já existe um usuário com este login.')
    }

    // Sem senha: quem vai usar escolhe a propria no primeiro acesso.
    const id = usuarioRepository.criarSemSenha(input.nome.trim(), input.login.trim(), input.perfil)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'CRIAR',
      entidade: 'usuario',
      entidadeId: id,
      valorNovo: { nome: input.nome, login: input.login, perfil: input.perfil }
    })

    return usuarioRepository.buscarPorId(id)!
  },

  setAtivo(id: number, ativo: boolean): void {
    const sessao = requirePermissao('usuarios', 'editar')

    if (id === sessao.usuario.id && !ativo) {
      throw Errors.validacao('Você não pode inativar a própria conta.')
    }

    usuarioRepository.setAtivo(id, ativo)
    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: ativo ? 'ATIVAR' : 'INATIVAR',
      entidade: 'usuario',
      entidadeId: id
    })
  },

  async resetarSenha(id: number, novaSenha: string): Promise<void> {
    const sessao = requirePermissao('usuarios', 'editar')
    const senhaHash = await hashPassword(novaSenha)
    usuarioRepository.redefinirSenha(id, senhaHash)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'RESETAR_SENHA',
      entidade: 'usuario',
      entidadeId: id
    })
  }
}
