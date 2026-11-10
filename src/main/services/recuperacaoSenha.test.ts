import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'

const FP = 'ABCDEF0123456789ABCDEF0123456789'

const { banco, pasta, chaves } = vi.hoisted(() => ({
  banco: { db: null as DatabaseSync | null },
  pasta: { dir: '' },
  chaves: { publicaPem: '' }
}))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))
vi.mock('@main/paths', () => ({ paths: { root: () => pasta.dir } }))
vi.mock('@main/license/fingerprint', () => ({ obterFingerprint: () => FP }))
vi.mock('@main/license/service', () => ({ chavePublicaEmUso: () => chaves.publicaPem }))
vi.mock('@main/auth/session', () => ({
  iniciarSessao: vi.fn(),
  encerrarSessao: vi.fn(),
  getSessaoAtual: vi.fn(),
  requireSessao: vi.fn(),
  requirePermissao: vi.fn()
}))

import { gerarCodigo } from '../../../tools/gerar-codigo-recuperacao.mjs'
import { recuperacaoSenhaService } from './recuperacaoSenhaService'
import { authService } from './authService'
import { hashPassword } from '@main/auth/password'
import { usuarioRepository } from '@main/repositories/usuarioRepository'

let privadaPem = ''

beforeAll(async () => {
  pasta.dir = mkdtempSync(join(tmpdir(), 'recuperacao-'))
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  chaves.publicaPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  privadaPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS) db.exec(m.sql)
  banco.db = db

  const hash = await hashPassword('senhaantiga1')
  usuarioRepository.criar('Dono da Ótica', 'dono', hash, 'admin')
  usuarioRepository.criar('Segundo Admin', 'gerente', hash, 'admin')
  usuarioRepository.criar('Vendedor', 'vendedor1', hash, 'vendedor')
})

afterAll(() => rmSync(pasta.dir, { recursive: true, force: true }))

const idDe = (login: string): number => usuarioRepository.buscarPorLogin(login)!.id

describe('recuperação de senha do Administrador', () => {
  it('o pedido é reaproveitado enquanto vale (fechar o app não invalida o que já foi enviado)', () => {
    const a = recuperacaoSenhaService.gerarPedido()
    const b = recuperacaoSenhaService.gerarPedido()
    expect(a.pedido).toBe(b.pedido)
    expect(a.pedido.replaceAll('-', '').startsWith(FP)).toBe(true)
  })

  it('sem código válido não lista nem redefine nada', async () => {
    recuperacaoSenhaService.gerarPedido()
    expect(() => recuperacaoSenhaService.verificarCodigo({ codigo: 'lixo' })).toThrow(/inválido/i)
    await expect(
      recuperacaoSenhaService.redefinir({ codigo: 'lixo', usuarioId: idDe('dono'), novaSenha: 'novasenha1' })
    ).rejects.toThrow(/inválido/i)
    await expect(authService.login({ login: 'dono', senha: 'senhaantiga1' })).resolves.toBeTruthy()
  })

  it('código de um pedido ANTERIOR (ou de outra máquina) não vale para o pedido atual', () => {
    const { pedido } = recuperacaoSenhaService.gerarPedido()
    const outraMaquina = gerarCodigo(privadaPem, pedido.replace(FP.slice(0, 4), 'FFFF'))
    const outroPedido = gerarCodigo(privadaPem, `${FP}0000000000000000`)
    expect(() => recuperacaoSenhaService.verificarCodigo({ codigo: outraMaquina })).toThrow(/inválido/i)
    expect(() => recuperacaoSenhaService.verificarCodigo({ codigo: outroPedido })).toThrow(/inválido/i)
  })

  it('fluxo completo: código válido lista os Admins (e só eles), redefine, entra com a senha nova e o código não serve de novo', async () => {
    const { pedido } = recuperacaoSenhaService.gerarPedido()
    const codigo = gerarCodigo(privadaPem, pedido)

    const admins = recuperacaoSenhaService.verificarCodigo({ codigo })
    expect(admins.map((a) => a.login).sort()).toEqual(['dono', 'gerente'])
    expect(admins[0]).not.toHaveProperty('senhaHash')

    // vendedor não pode ser redefinido por este caminho, mesmo com código válido
    await expect(
      recuperacaoSenhaService.redefinir({ codigo, usuarioId: idDe('vendedor1'), novaSenha: 'hackeada123' })
    ).rejects.toThrow(/lista/i)
    await expect(authService.login({ login: 'vendedor1', senha: 'senhaantiga1' })).resolves.toBeTruthy()

    const r = await recuperacaoSenhaService.redefinir({ codigo, usuarioId: idDe('dono'), novaSenha: 'senhanova123' })
    expect(r.login).toBe('dono')

    const sessao = await authService.login({ login: 'dono', senha: 'senhanova123' })
    expect(sessao.usuario.deveTrocarSenha).toBe(false)
    await expect(authService.login({ login: 'dono', senha: 'senhaantiga1' })).rejects.toThrow()
    // o outro admin não foi tocado
    await expect(authService.login({ login: 'gerente', senha: 'senhaantiga1' })).resolves.toBeTruthy()

    // uso único: o mesmo código não abre nada de novo
    expect(() => recuperacaoSenhaService.verificarCodigo({ codigo })).toThrow()
    await expect(
      recuperacaoSenhaService.redefinir({ codigo, usuarioId: idDe('gerente'), novaSenha: 'outrasenha1' })
    ).rejects.toThrow()
    await expect(authService.login({ login: 'gerente', senha: 'senhaantiga1' })).resolves.toBeTruthy()

    // e um novo pedido tem outro número, que o código antigo não cobre
    const novo = recuperacaoSenhaService.gerarPedido()
    expect(novo.pedido).not.toBe(pedido)
    expect(() => recuperacaoSenhaService.verificarCodigo({ codigo })).toThrow(/inválido/i)
  })

  it('tira o bloqueio por tentativas, reativa a conta inativa e registra na auditoria', async () => {
    const id = idDe('gerente')
    const db = banco.db!
    db.prepare("UPDATE usuario SET ativo = 0, tentativas_login = 9, bloqueado_ate = datetime('now', '+30 minutes') WHERE id = ?").run(id)
    await expect(authService.login({ login: 'gerente', senha: 'senhaantiga1' })).rejects.toThrow(/bloqueada/i)

    const { pedido } = recuperacaoSenhaService.gerarPedido()
    const codigo = gerarCodigo(privadaPem, pedido)
    const admins = recuperacaoSenhaService.verificarCodigo({ codigo })
    expect(admins.find((a) => a.login === 'gerente')?.ativo).toBe(false)

    await recuperacaoSenhaService.redefinir({ codigo, usuarioId: id, novaSenha: 'reativada123' })
    await expect(authService.login({ login: 'gerente', senha: 'reativada123' })).resolves.toBeTruthy()

    const registro = db.prepare("SELECT usuario_id, entidade_id, valor_novo FROM auditoria WHERE acao = 'RECUPERACAO_SENHA' ORDER BY id DESC").get() as {
      usuario_id: number
      entidade_id: number
      valor_novo: string
    }
    expect(registro.usuario_id).toBe(id)
    expect(JSON.parse(registro.valor_novo)).toEqual({ reativado: true })
  })

  it('funciona também para quem ainda estava sem senha (aguardando primeiro acesso)', async () => {
    const id = usuarioRepository.criarSemSenha('Admin Novo', 'novoadmin', 'admin')
    const { pedido } = recuperacaoSenhaService.gerarPedido()
    const codigo = gerarCodigo(privadaPem, pedido)
    await recuperacaoSenhaService.redefinir({ codigo, usuarioId: id, novaSenha: 'primeira1234' })
    await expect(authService.login({ login: 'novoadmin', senha: 'primeira1234' })).resolves.toBeTruthy()
  })
})
