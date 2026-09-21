import { DatabaseSync } from 'node:sqlite'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'

const { banco } = vi.hoisted(() => ({ banco: { db: null as DatabaseSync | null } }))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))
vi.mock('@main/auth/session', () => ({
  iniciarSessao: vi.fn(),
  encerrarSessao: vi.fn(),
  getSessaoAtual: vi.fn(),
  requireSessao: vi.fn(),
  requirePermissao: () => ({ usuario: { id: 1 } })
}))

import { authService } from './authService'
import { usuarioService } from './usuarioService'
import { usuarioRepository } from '@main/repositories/usuarioRepository'

beforeAll(() => {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS) db.exec(m.sql)
  // admin que "cadastra": id 1 (usado como autor da auditoria)
  db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil, deve_trocar_senha) VALUES ('Admin','admin','x','admin',0)").run()
  banco.db = db
})

describe('primeiro acesso', () => {
  it('cadastro nao pede senha e o usuario fica aguardando o primeiro acesso', async () => {
    const u = await usuarioService.criar({ nome: 'Marcelo', login: 'marcelo', perfil: 'vendedor' })
    expect(u.aguardandoPrimeiroAcesso).toBe(true)
    expect(u.deveTrocarSenha).toBe(false)
  })

  it('login antes do primeiro acesso orienta em vez de aceitar qualquer senha', async () => {
    await expect(authService.login({ login: 'marcelo', senha: '' })).rejects.toThrow(/primeiro acesso/i)
    await expect(authService.login({ login: 'marcelo', senha: 'qualquercoisa' })).rejects.toThrow(/primeiro acesso/i)
  })

  it('escolhe a senha, entra sem ter que trocar de novo, e depois loga normalmente', async () => {
    const sessao = await authService.primeiroAcesso({ login: 'Marcelo', novaSenha: 'minhasenha1' })
    expect(sessao.usuario.deveTrocarSenha).toBe(false)
    expect(sessao.usuario.aguardandoPrimeiroAcesso).toBe(false)
    expect(usuarioRepository.buscarPorLogin('marcelo')?.aguardandoPrimeiroAcesso).toBe(false)

    const de_novo = await authService.login({ login: 'marcelo', senha: 'minhasenha1' })
    expect(de_novo.usuario.login).toBe('marcelo')
    await expect(authService.login({ login: 'marcelo', senha: 'errada123' })).rejects.toThrow()
  })

  it('nao permite "primeiro acesso" em conta que ja tem senha, nem em login inexistente (mesma mensagem)', async () => {
    const a = await authService.primeiroAcesso({ login: 'marcelo', novaSenha: 'outrasenha1' }).catch((e: Error) => e.message)
    const b = await authService.primeiroAcesso({ login: 'ninguem', novaSenha: 'outrasenha1' }).catch((e: Error) => e.message)
    expect(a).toBe(b)
    expect(a).toMatch(/pendente/i)
    // e a senha antiga continua valendo
    await expect(authService.login({ login: 'marcelo', senha: 'minhasenha1' })).resolves.toBeTruthy()
  })
})

describe('administrador do assistente inicial', () => {
  it('escolhe a senha no assistente e nao precisa trocar de novo no primeiro login', async () => {
    const id = usuarioRepository.criar('Rafael', 'rafael', await (await import('@main/auth/password')).hashPassword('senhaforte1'), 'admin')
    expect(usuarioRepository.buscarPorId(id)?.deveTrocarSenha).toBe(false)
    const sessao = await authService.login({ login: 'rafael', senha: 'senhaforte1' })
    expect(sessao.usuario.deveTrocarSenha).toBe(false)
  })
})
