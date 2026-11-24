import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { textoDaProva } from '../../../supabase/functions/pc-token/logica'
import { MIGRATIONS } from '@main/db/migrations'
import { criarClienteNuvem, type ClienteNuvem } from './clienteNuvem'
import { executarCiclo, type DepsCiclo } from './cicloEnvio'
import type { EstadoNuvem } from './estadoNuvem'
import { carregarIdentidadePc, type Cofre, type IdentidadePc } from './identidadePc'
import { chaveAnon, NUVEM_URL } from './nuvemConfig'
import { TABELAS_SINCRONIZAVEIS } from './tabelasSincronizaveis'

/**
 * Teste de integração contra o projeto Supabase REAL. Só roda com OPTIALEPH_SUPABASE_ANON e LICENCA definidas
 * (a licença é lida do ambiente e nunca é gravada nem impressa). Cria uma loja de teste própria na nuvem.
 * O PC não pode apagar `loja` (só service_role): no fim, apague a loja impressa em optialeph.loja no painel.
 */
const ATIVO = Boolean(process.env.OPTIALEPH_SUPABASE_ANON && process.env.LICENCA)

const cofreFalso: Cofre = {
  disponivel: () => true,
  cifrar: (t) => Buffer.from(t, 'utf8'),
  decifrar: (d) => d.toString('utf8')
}

describe.skipIf(!ATIVO)('envio para a nuvem real', () => {
  const lojaId = randomUUID()
  const pasta = ATIVO ? mkdtempSync(join(tmpdir(), 'nuvem-real-')) : ''
  let db: DatabaseSync
  let identidade: IdentidadePc
  let cliente: ClienteNuvem
  let estado: EstadoNuvem
  let deps: DepsCiclo
  let token: string

  /** Mesmo caminho do cliente: troca licença + prova de posse por um token do PC. */
  async function obterToken(): Promise<string> {
    const timestamp = new Date().toISOString()
    const r = await fetch(`${NUVEM_URL}/functions/v1/pc-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: chaveAnon() },
      body: JSON.stringify({
        licenca: process.env.LICENCA,
        loja: { id: lojaId, nome: 'LOJA DE TESTE (apagar)', cnpj: null },
        dispositivo_id: identidade.dispositivoId,
        chave_publica: identidade.chavePublica,
        timestamp,
        assinatura: identidade.assinar(textoDaProva(lojaId, identidade.dispositivoId, timestamp))
      })
    })
    if (!r.ok) throw new Error(`pc-token recusou (HTTP ${r.status})`)
    return ((await r.json()) as { token: string }).token
  }

  async function ler(tabela: string, select: string, filtro = ''): Promise<Response> {
    return fetch(`${NUVEM_URL}/rest/v1/${tabela}?select=${select}&loja_id=eq.${lojaId}${filtro}`, {
      headers: { apikey: chaveAnon(), Authorization: `Bearer ${token}`, 'Accept-Profile': 'optialeph' }
    })
  }
  async function linhas(tabela: string, select = 'uuid', filtro = ''): Promise<Record<string, unknown>[]> {
    const r = await ler(tabela, select, filtro)
    if (!r.ok) throw new Error(`leitura de ${tabela} falhou (HTTP ${r.status})`)
    return (await r.json()) as Record<string, unknown>[]
  }

  beforeAll(async () => {
    db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    for (const m of MIGRATIONS) db.exec(m.sql)
    db.prepare("INSERT INTO empresa (id, nome_fantasia, uuid) VALUES (1, 'LOJA DE TESTE (apagar)', ?)").run(lojaId)
    identidade = carregarIdentidadePc({
      pasta,
      cofre: cofreFalso,
      fingerprint: 'FP-TESTE-REAL',
      lerDispositivoId: () => randomUUID(),
      gravarDispositivoId: () => {}
    })
    cliente = criarClienteNuvem({
      url: NUVEM_URL,
      chaveAnon: chaveAnon(),
      loja: { id: lojaId, nome: 'LOJA DE TESTE (apagar)', cnpj: null },
      identidade,
      obterLicenca: () => process.env.LICENCA as string
    })
    estado = { fingerprint: 'FP-TESTE-REAL', cursor: 0 }
    deps = {
      db,
      cliente,
      lerEstado: () => estado,
      gravarEstado: (e) => {
        estado = e
      },
      fingerprint: 'FP-TESTE-REAL',
      agora: () => new Date()
    }
    token = await obterToken()
  }, 60_000)

  afterAll(async () => {
    try {
      // O PC não pode apagar `loja`; limpa o que der nas tabelas do espelho e deixa a loja para o painel.
      for (const t of TABELAS_SINCRONIZAVEIS) {
        const uuids = (await linhas(t.nome)).map((l) => String(l.uuid))
        if (uuids.length > 0) await cliente.apagar(t.nome, uuids)
      }
    } catch {
      // limpeza é best effort
    }
    db?.close()
    if (pasta) rmSync(pasta, { recursive: true, force: true })
    console.log(`Loja de teste: ${lojaId} - apague esta loja em optialeph.loja no painel (a cascata remove o resto e o dispositivo).`)
  }, 60_000)

  it('primeiro ciclo envia tudo', async () => {
    for (const n of ['Ana', 'Bruno', 'Carla']) db.prepare('INSERT INTO cliente (nome) VALUES (?)').run(n)
    db.prepare("INSERT INTO usuario (nome, login, senha_hash, perfil) VALUES ('Admin Teste', 'admin-teste', 'hash-secreto', 'admin')").run()
    const r = await executarCiclo(deps)
    expect(r.varredura).toBe(true)
    expect(await linhas('cliente')).toHaveLength(3)
    const usuarios = await linhas('usuario', '*')
    expect(usuarios).toHaveLength(1)
    expect(Object.keys(usuarios[0])).not.toContain('senha_hash')
    expect((await ler('usuario', 'senha_hash')).ok).toBe(false)
  }, 60_000)

  it('segundo ciclo não reenvia', async () => {
    const r = await executarCiclo(deps)
    expect(r.enviados).toBe(0)
    expect(r.excluidos).toBe(0)
  }, 60_000)

  it('alteração e exclusão chegam', async () => {
    db.prepare("UPDATE cliente SET nome = 'Ana Renomeada' WHERE nome = 'Ana'").run()
    db.prepare("DELETE FROM cliente WHERE nome = 'Bruno'").run()
    const r = await executarCiclo(deps)
    expect(r.enviados).toBeGreaterThan(0)
    expect(r.excluidos).toBe(1)
    const nomes = (await linhas('cliente', 'nome')).map((l) => l.nome)
    expect(nomes).toHaveLength(2)
    expect(nomes).toContain('Ana Renomeada')
    expect(nomes).not.toContain('Bruno')
  }, 60_000)

  it('painel é gravado', async () => {
    await cliente.gravarPainel('hoje', { x: 1 })
    const p = await linhas('painel_snapshot', 'periodo,indicadores', '&periodo=eq.hoje')
    expect(p).toHaveLength(1)
    expect(p[0].indicadores).toEqual({ x: 1 })
  }, 60_000)
})
