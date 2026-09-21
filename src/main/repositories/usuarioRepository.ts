import { getDb } from '@main/db/connection'
import type { Perfil, Usuario } from '@shared/types'

interface UsuarioRow {
  id: number
  nome: string
  login: string
  senha_hash: string
  perfil: Perfil
  ativo: number
  deve_trocar_senha: number
  tentativas_login: number
  bloqueado_ate: string | null
  ultimo_acesso: string | null
  criado_em: string
}

export interface UsuarioComHash extends Usuario {
  senhaHash: string
  tentativasLogin: number
  bloqueadoAte: string | null
}

/** senha_hash de quem foi cadastrado e ainda nao escolheu a senha. Nenhum hash Argon2 e vazio, entao nunca autentica. */
export const SEM_SENHA = ''

function toDomain(row: UsuarioRow): Usuario {
  return {
    id: row.id,
    nome: row.nome,
    login: row.login,
    perfil: row.perfil,
    ativo: row.ativo === 1,
    deveTrocarSenha: row.deve_trocar_senha === 1,
    aguardandoPrimeiroAcesso: row.senha_hash === SEM_SENHA,
    ultimoAcesso: row.ultimo_acesso,
    criadoEm: row.criado_em
  }
}

function toDomainComHash(row: UsuarioRow): UsuarioComHash {
  return {
    ...toDomain(row),
    senhaHash: row.senha_hash,
    tentativasLogin: row.tentativas_login,
    bloqueadoAte: row.bloqueado_ate
  }
}

export const usuarioRepository = {
  existeAlgum(): boolean {
    const row = getDb().prepare('SELECT 1 FROM usuario LIMIT 1').get()
    return row !== undefined
  },

  buscarPorLogin(login: string): UsuarioComHash | null {
    const row = getDb()
      .prepare('SELECT * FROM usuario WHERE login = :login COLLATE NOCASE')
      .get({ login }) as UsuarioRow | undefined
    return row ? toDomainComHash(row) : null
  },

  buscarPorId(id: number): Usuario | null {
    const row = getDb().prepare('SELECT * FROM usuario WHERE id = :id').get({ id }) as
      | UsuarioRow
      | undefined
    return row ? toDomain(row) : null
  },

  listar(): Usuario[] {
    const rows = getDb()
      .prepare('SELECT * FROM usuario ORDER BY ativo DESC, nome')
      .all() as unknown as UsuarioRow[]
    return rows.map(toDomain)
  },

  /** Cria com a senha ja escolhida pela propria pessoa (administrador do assistente inicial): nao precisa trocar. */
  criar(nome: string, login: string, senhaHash: string, perfil: Perfil): number {
    const info = getDb()
      .prepare(
        `INSERT INTO usuario (nome, login, senha_hash, perfil, deve_trocar_senha)
         VALUES (:nome, :login, :senhaHash, :perfil, 0)`
      )
      .run({ nome, login, senhaHash, perfil })
    return Number(info.lastInsertRowid)
  },

  /** Cadastro sem senha: a pessoa a escolhe no primeiro acesso. */
  criarSemSenha(nome: string, login: string, perfil: Perfil): number {
    const info = getDb()
      .prepare(
        `INSERT INTO usuario (nome, login, senha_hash, perfil, deve_trocar_senha)
         VALUES (:nome, :login, :semSenha, :perfil, 0)`
      )
      .run({ nome, login, semSenha: SEM_SENHA, perfil })
    return Number(info.lastInsertRowid)
  },

  /** So grava se o usuario ainda estiver sem senha (protege contra dois primeiros acessos ao mesmo tempo). */
  definirSenhaPrimeiroAcesso(id: number, senhaHash: string): boolean {
    const info = getDb()
      .prepare(
        `UPDATE usuario SET senha_hash = :senhaHash, deve_trocar_senha = 0, atualizado_em = datetime('now')
         WHERE id = :id AND senha_hash = :semSenha`
      )
      .run({ id, senhaHash, semSenha: SEM_SENHA })
    return Number(info.changes) === 1
  },

  setAtivo(id: number, ativo: boolean): void {
    getDb()
      .prepare('UPDATE usuario SET ativo = :ativo, atualizado_em = datetime(\'now\') WHERE id = :id')
      .run({ id, ativo: ativo ? 1 : 0 })
  },

  redefinirSenha(id: number, senhaHash: string): void {
    getDb()
      .prepare(
        `UPDATE usuario SET senha_hash = :senhaHash, deve_trocar_senha = 1,
           tentativas_login = 0, bloqueado_ate = NULL, atualizado_em = datetime('now')
         WHERE id = :id`
      )
      .run({ id, senhaHash })
  },

  trocarPropriaSenha(id: number, senhaHash: string): void {
    getDb()
      .prepare(
        `UPDATE usuario SET senha_hash = :senhaHash, deve_trocar_senha = 0,
           atualizado_em = datetime('now')
         WHERE id = :id`
      )
      .run({ id, senhaHash })
  },

  registrarLoginSucesso(id: number): void {
    getDb()
      .prepare(
        `UPDATE usuario SET tentativas_login = 0, bloqueado_ate = NULL,
           ultimo_acesso = datetime('now')
         WHERE id = :id`
      )
      .run({ id })
  },

  /** Bloqueio progressivo: a partir da 5a tentativa, bloqueia por alguns minutos. */
  registrarTentativaFalha(id: number, tentativasAtuais: number): void {
    const novasTentativas = tentativasAtuais + 1
    const minutosBloqueio = novasTentativas >= 5 ? Math.min(30, 2 ** (novasTentativas - 5)) : 0
    // "+N minutes" e sempre um numero calculado por nos (nunca dado do
    // usuario), mas ainda assim passa como parametro amarrado - nenhum
    // SQL desta base e montado por concatenacao de string.
    const offset = `+${minutosBloqueio} minutes`

    getDb()
      .prepare(
        `UPDATE usuario SET
           tentativas_login = :tentativas,
           bloqueado_ate = CASE WHEN :minutos > 0 THEN datetime('now', :offset) ELSE NULL END
         WHERE id = :id`
      )
      .run({ id, tentativas: novasTentativas, minutos: minutosBloqueio, offset })
  }
}
