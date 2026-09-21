import { usuarioRepository } from '@main/repositories/usuarioRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { hashPassword, verifyPassword } from '@main/auth/password'
import { encerrarSessao, getSessaoAtual, iniciarSessao, requireSessao } from '@main/auth/session'
import { Errors } from '@main/errors'
import type { LoginInput, TrocarSenhaInput, PrimeiroAcessoInput, AutorizarAcaoInput } from '@shared/ipc'
import type { Sessao, Usuario } from '@shared/types'

function formatarDataHora(iso: string): string {
  const d = new Date(iso.replace(' ', 'T') + 'Z')
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export const authService = {
  async login(input: LoginInput): Promise<Sessao> {
    const usuario = usuarioRepository.buscarPorLogin(input.login)

    // Mensagem identica para "nao existe" e "senha errada" - nunca revela
    // qual dos dois campos esta incorreto.
    if (!usuario) throw Errors.credenciaisInvalidas()

    if (usuario.bloqueadoAte && new Date(usuario.bloqueadoAte + 'Z').getTime() > Date.now()) {
      throw Errors.contaBloqueada(formatarDataHora(usuario.bloqueadoAte))
    }

    if (usuario.aguardandoPrimeiroAcesso) {
      if (!usuario.ativo) throw Errors.contaInativa()
      throw Errors.validacao('Este é o seu primeiro acesso. Clique em "Primeiro acesso" para escolher sua senha.')
    }

    const senhaOk = await verifyPassword(input.senha, usuario.senhaHash)
    if (!senhaOk) {
      usuarioRepository.registrarTentativaFalha(usuario.id, usuario.tentativasLogin)
      auditoriaRepository.registrar({
        usuarioId: usuario.id,
        acao: 'LOGIN_FALHOU',
        entidade: 'usuario',
        entidadeId: usuario.id
      })
      throw Errors.credenciaisInvalidas()
    }

    if (!usuario.ativo) throw Errors.contaInativa()

    usuarioRepository.registrarLoginSucesso(usuario.id)
    auditoriaRepository.registrar({
      usuarioId: usuario.id,
      acao: 'LOGIN',
      entidade: 'usuario',
      entidadeId: usuario.id
    })

    const { senhaHash: _senhaHash, tentativasLogin: _t, bloqueadoAte: _b, ...usuarioPublico } = usuario
    iniciarSessao(usuarioPublico)
    return { usuario: usuarioPublico }
  },

  /**
   * Primeiro acesso de um usuario cadastrado pelo admin: escolhe a senha e ja
   * entra. Mesma mensagem para "nao existe" e "ja tem senha", para nao revelar
   * quais logins existem.
   */
  async primeiroAcesso(input: PrimeiroAcessoInput): Promise<Sessao> {
    const naoPendente = (): Error =>
      Errors.validacao('Não há primeiro acesso pendente para este login. Se você já tem senha, entre normalmente.')

    const usuario = usuarioRepository.buscarPorLogin(input.login)
    if (!usuario || !usuario.aguardandoPrimeiroAcesso) throw naoPendente()
    if (!usuario.ativo) throw Errors.contaInativa()

    const novoHash = await hashPassword(input.novaSenha)
    if (!usuarioRepository.definirSenhaPrimeiroAcesso(usuario.id, novoHash)) throw naoPendente()

    auditoriaRepository.registrar({
      usuarioId: usuario.id,
      acao: 'PRIMEIRO_ACESSO',
      entidade: 'usuario',
      entidadeId: usuario.id
    })
    usuarioRepository.registrarLoginSucesso(usuario.id)

    const { senhaHash: _h, tentativasLogin: _t, bloqueadoAte: _b, ...usuarioPublico } = usuario
    const publico = { ...usuarioPublico, aguardandoPrimeiroAcesso: false, deveTrocarSenha: false }
    iniciarSessao(publico)
    return { usuario: publico }
  },

  logout(): void {
    const sessao = getSessaoAtual()
    if (sessao) {
      auditoriaRepository.registrar({
        usuarioId: sessao.usuario.id,
        acao: 'LOGOUT',
        entidade: 'usuario',
        entidadeId: sessao.usuario.id
      })
    }
    encerrarSessao()
  },

  getSessao(): Sessao | null {
    return getSessaoAtual()
  },

  async trocarSenha(input: TrocarSenhaInput): Promise<void> {
    const sessao = requireSessao()
    const usuario = usuarioRepository.buscarPorLogin(sessao.usuario.login)
    if (!usuario) throw Errors.naoAutenticado()

    const senhaAtualOk = await verifyPassword(input.senhaAtual, usuario.senhaHash)
    if (!senhaAtualOk) throw Errors.validacao('Senha atual incorreta.')

    const novoHash = await hashPassword(input.novaSenha)
    usuarioRepository.trocarPropriaSenha(usuario.id, novoHash)
    auditoriaRepository.registrar({
      usuarioId: usuario.id,
      acao: 'TROCA_SENHA',
      entidade: 'usuario',
      entidadeId: usuario.id
    })
  },

  /**
   * RF-03.4: autoriza uma acao pontual (desconto acima do teto, cancelar
   * venda etc.) sem trocar a sessao ativa do vendedor. So aceita
   * credencial de um usuario com perfil admin.
   */
  async autorizarComoAdmin(input: AutorizarAcaoInput): Promise<Usuario> {
    const admin = usuarioRepository.buscarPorLogin(input.loginAdmin)
    if (!admin || admin.perfil !== 'admin') throw Errors.credenciaisInvalidas()
    if (!admin.ativo) throw Errors.contaInativa()

    const ok = await verifyPassword(input.senhaAdmin, admin.senhaHash)
    if (!ok) throw Errors.credenciaisInvalidas()

    const { senhaHash: _h, tentativasLogin: _t, bloqueadoAte: _b, ...usuarioPublico } = admin
    return usuarioPublico
  }
}
