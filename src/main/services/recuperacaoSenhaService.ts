import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from '@main/paths'
import { usuarioRepository } from '@main/repositories/usuarioRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { hashPassword } from '@main/auth/password'
import {
  formatarPedido,
  gerarNonce,
  pedidoExpirado,
  verificarCodigoRecuperacao,
  type PedidoPendente
} from '@main/auth/recuperacao'
import { chavePublicaEmUso } from '@main/license/service'
import { obterFingerprint } from '@main/license/fingerprint'
import { Errors } from '@main/errors'
import type { AdminRecuperavel, PedidoRecuperacao } from '@shared/types'
import type { RecuperacaoCodigoInput, RecuperacaoRedefinirInput } from '@shared/ipc'

// Fora do banco de proposito: restaurar um backup nao traz um pedido antigo de volta
// e nada disso viaja na sincronizacao (o pedido vale para ESTE computador).
const arquivoPedido = (): string => join(paths.root(), 'recuperacao-senha.json')

function lerPedidoPendente(): PedidoPendente | null {
  try {
    if (!existsSync(arquivoPedido())) return null
    const p = JSON.parse(readFileSync(arquivoPedido(), 'utf8')) as Partial<PedidoPendente>
    if (typeof p.nonce !== 'string' || typeof p.criadoEm !== 'number') return null
    return { nonce: p.nonce, criadoEm: p.criadoEm }
  } catch {
    return null
  }
}

function apagarPedido(): void {
  try {
    rmSync(arquivoPedido(), { force: true })
  } catch {
    // sem o arquivo ou sem permissao: o pedido expira sozinho
  }
}

const MSG_CODIGO_INVALIDO =
  'Código de recuperação inválido. Confira se copiou o código inteiro e se ele foi gerado para o pedido que aparece na tela.'

/** Confere o codigo contra o pedido pendente desta maquina. Lanca erro generico se qualquer parte nao bater. */
function exigirCodigoValido(codigo: string): void {
  const pendente = lerPedidoPendente()
  if (!pendente || pedidoExpirado(pendente)) {
    throw Errors.validacao('Não há um pedido de recuperação ativo. Peça um novo código na tela de login.')
  }
  const ok = verificarCodigoRecuperacao(
    codigo,
    { fingerprint: obterFingerprint(), nonce: pendente.nonce },
    chavePublicaEmUso()
  )
  if (!ok) throw Errors.validacao(MSG_CODIGO_INVALIDO)
}

/**
 * Chamadas feitas ANTES do login (esqueceu o login e a senha): nenhuma exige sessao.
 * A autorizacao e o codigo assinado pelo fornecedor, nao uma credencial do sistema.
 */
export const recuperacaoSenhaService = {
  /** Reaproveita o pedido ainda valido (o dono pode fechar o app enquanto espera a resposta) ou cria outro. */
  gerarPedido(): PedidoRecuperacao {
    let pendente = lerPedidoPendente()
    if (!pendente || pedidoExpirado(pendente)) {
      pendente = { nonce: gerarNonce(), criadoEm: Date.now() }
      writeFileSync(arquivoPedido(), JSON.stringify(pendente), 'utf8')
    }
    return { pedido: formatarPedido(obterFingerprint(), pendente.nonce) }
  },

  /** Codigo valido => lista os Administradores (isso tambem resolve "esqueci o login"). */
  verificarCodigo(input: RecuperacaoCodigoInput): AdminRecuperavel[] {
    exigirCodigoValido(input.codigo)
    return usuarioRepository
      .listarAdmins()
      .map((u) => ({ id: u.id, nome: u.nome, login: u.login, ativo: u.ativo }))
  },

  async redefinir(input: RecuperacaoRedefinirInput): Promise<{ login: string }> {
    exigirCodigoValido(input.codigo)

    const alvo = usuarioRepository.listarAdmins().find((u) => u.id === input.usuarioId)
    if (!alvo) throw Errors.validacao('Escolha um dos Administradores da lista.')

    const hash = await hashPassword(input.novaSenha)
    if (!usuarioRepository.redefinirSenhaRecuperacao(alvo.id, hash)) {
      throw Errors.validacao('Escolha um dos Administradores da lista.')
    }

    // Uso unico: o mesmo codigo nao funciona uma segunda vez.
    apagarPedido()

    auditoriaRepository.registrar({
      usuarioId: alvo.id,
      acao: 'RECUPERACAO_SENHA',
      entidade: 'usuario',
      entidadeId: alvo.id,
      valorNovo: { reativado: !alvo.ativo }
    })

    return { login: alvo.login }
  }
}
