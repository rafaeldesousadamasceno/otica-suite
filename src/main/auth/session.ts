import type { Acao, Recurso } from '@shared/permissions'
import { possuiPermissao } from '@shared/permissions'
import type { Sessao, Usuario } from '@shared/types'
import { Errors } from '@main/errors'
import { emSomenteLeitura } from '@main/license/estado'

/**
 * Sessao em memoria do processo main - nunca persistida em disco.
 *
 * Deliberado: fechar o app exige login de novo na proxima abertura. Para
 * um sistema de balcao isso e o comportamento esperado (equivalente a um
 * PDV) e evita todo o problema de token persistido com expiracao,
 * revogacao e roubo de arquivo de sessao.
 *
 * A verificacao de permissao acontece SEMPRE aqui, no processo main -
 * nunca no renderer (PRD secao 7.1/9.2). Cada handler de IPC que muda ou
 * le dado sensivel chama `requirePermission` antes de tocar no banco.
 */
let sessaoAtual: Sessao | null = null
let ultimaAtividade = Date.now()

export function iniciarSessao(usuario: Usuario): void {
  sessaoAtual = { usuario }
  ultimaAtividade = Date.now()
}

export function encerrarSessao(): void {
  sessaoAtual = null
}

export function marcarAtividade(): void {
  ultimaAtividade = Date.now()
}

export function getSessaoAtual(): Sessao | null {
  return sessaoAtual
}

export function minutosInativo(): number {
  return (Date.now() - ultimaAtividade) / 60_000
}

/** Usado pelos handlers de IPC: garante que ha alguem logado. */
export function requireSessao(): Sessao {
  if (!sessaoAtual) throw Errors.naoAutenticado()
  marcarAtividade()
  return sessaoAtual
}

/** Usado pelos handlers de IPC: garante sessao + permissao especifica. */
export function requirePermissao(recurso: Recurso, acao: Acao): Sessao {
  const sessao = requireSessao()
  if (!possuiPermissao(sessao.usuario.perfil, recurso, acao)) {
    throw Errors.semPermissao()
  }

  // RF-13.4/14.3: licenca vencida (alem da carencia) trava toda ESCRITA no
  // sistema - 'ver' nunca e bloqueado (consultar sempre funciona), e nem
  // 'licenca' (precisa continuar acessivel pra reativar) nem 'backup'
  // (PRD 14.3: "o dado e da otica, nao seu" - backup nunca e bloqueado).
  if (acao !== 'ver' && recurso !== 'licenca' && recurso !== 'backup' && emSomenteLeitura()) {
    throw Errors.licencaVencida()
  }

  return sessao
}
