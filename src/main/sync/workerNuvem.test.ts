import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MIGRATIONS } from '@main/db/migrations'

// O worker lê e grava configuracao e calcula o painel pela conexão global (getDb); aqui ela é um banco em memória trocável.
const { banco } = vi.hoisted(() => ({ banco: { db: null as DatabaseSync | null } }))
vi.mock('@main/db/connection', () => ({ getDb: () => banco.db }))
vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '' }, safeStorage: {} }))
vi.mock('@main/license/service', () => ({ obterChaveParaNuvem: () => null }))

import { configuracaoRepository } from '@main/repositories/configuracaoRepository'
import { NuvemErro, type ClienteNuvem, type ConfigCliente } from './clienteNuvem'
import type { EstadoNuvem } from './estadoNuvem'
import type { IdentidadePc } from './identidadePc'
import { criarWorker, type DepsWorker } from './workerNuvem'

const MIN = 60_000

function novoBanco(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const m of MIGRATIONS) db.exec(m.sql)
  db.prepare("INSERT INTO empresa (id, nome_fantasia, cnpj) VALUES (1, 'Ótica Teste', '12.345.678/0001-90')").run()
  return db
}

const contador = (db: DatabaseSync): number => (db.prepare('SELECT valor FROM sync_contador WHERE id = 1').get() as { valor: number }).valor
const novoCliente = (db: DatabaseSync, nome: string): void => {
  db.prepare('INSERT INTO cliente (nome) VALUES (?)').run(nome)
}
const ligarDireto = (): void => configuracaoRepository.definir('nuvem_ligada', '1')

/** Nuvem falsa: `modo` decide se cada chamada de envio passa ou lança; o painel tem chave própria. */
function nuvemFalsa() {
  const s = {
    modo: 'ok' as 'ok' | Error,
    falharPainel: false,
    chamadas: 0,
    upserts: [] as { tabela: string; linhas: Record<string, unknown>[] }[],
    varreduras: 0,
    paineis: [] as string[],
    configs: [] as ConfigCliente[],
    /** Chamado no começo de cada upsert com o número dele (1, 2, ...). */
    aoUpsert: null as ((n: number) => void) | null,
    qtdUpserts: 0,
    aoPainel: null as (() => void) | null
  }
  const passar = (): void => {
    s.chamadas++
    if (s.modo !== 'ok') throw s.modo
  }
  const cliente: ClienteNuvem = {
    async upsert(tabela, linhas) {
      s.aoUpsert?.(++s.qtdUpserts)
      passar()
      s.upserts.push({ tabela, linhas })
    },
    async apagar() {
      passar()
    },
    async varrer() {
      passar()
      s.varreduras++
    },
    async gravarPainel(periodo) {
      s.aoPainel?.()
      s.chamadas++
      if (s.falharPainel) throw new NuvemErro('NUVEM_HTTP', 500, 'A nuvem recusou a operação (HTTP 500).')
      s.paineis.push(periodo)
    }
  }
  return {
    s,
    criarCliente: (c: ConfigCliente): ClienteNuvem => {
      s.configs.push(c)
      return cliente
    }
  }
}

let atual: ReturnType<typeof criarWorker> | null = null

function montar(
  o: { licenca?: string | null; configurada?: boolean; identidade?: () => IdentidadePc; monotonico?: () => number } = {}
) {
  const nuvem = nuvemFalsa()
  const estado = { atual: null as EstadoNuvem | null }
  /** Instante monotônico (ms) de cada ciclo iniciado: o ciclo carrega a identidade uma vez, logo no começo. */
  const tentativas: number[] = []
  const identidade: IdentidadePc = { dispositivoId: randomUUID(), chavePublica: 'chave-publica', assinar: () => 'assinatura', nova: false }
  const deps: DepsWorker = {
    getDb: () => banco.db!,
    criarCliente: nuvem.criarCliente,
    identidade: () => {
      tentativas.push(performance.now())
      return o.identidade ? o.identidade() : identidade
    },
    estado: {
      ler: () => estado.atual,
      gravar: (e) => {
        estado.atual = e
      }
    },
    fingerprint: () => 'fp',
    obterLicenca: () => (o.licenca === undefined ? 'licenca-de-teste' : o.licenca),
    nuvemConfigurada: () => o.configurada ?? true,
    agora: () => new Date(),
    // Com vi.useFakeTimers o performance.now() é falso: anda com os timers e não muda com vi.setSystemTime.
    monotonico: o.monotonico ?? (() => performance.now()),
    timers: {
      setInterval: (fn, ms) => setInterval(fn, ms),
      clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>)
    }
  }
  const w = criarWorker(deps)
  atual = w
  return { w, nuvem, estado, tentativas }
}

const intervalosEmMinutos = (t: number[]): number[] => t.slice(1).map((x, i) => (x - t[i]) / MIN)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-24T10:00:00'))
  banco.db = novoBanco()
})

afterEach(() => {
  atual?.pararWorkerNuvem()
  atual = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('workerNuvem', () => {
  it('desligada: nunca chama a nuvem', async () => {
    const { w, nuvem, tentativas } = montar()
    w.iniciarWorkerNuvem()
    await vi.advanceTimersByTimeAsync(60 * MIN)
    await w.sincronizarAgora()
    expect(tentativas).toHaveLength(0)
    expect(nuvem.s.configs).toHaveLength(0)
    expect(nuvem.s.chamadas).toBe(0)
    expect(w.obterStatusNuvem()).toMatchObject({ estado: 'desligada', ligada: false, ultimoEnvioEm: null })
  })

  it('não configurada: não chama a nuvem e diz isso', async () => {
    const { w, nuvem, tentativas } = montar({ configurada: false })
    w.iniciarWorkerNuvem()
    w.ligarNuvem({ versao: 1, usuarioId: 1 })
    await w.sincronizarAgora()
    await vi.advanceTimersByTimeAsync(10 * MIN)
    expect(tentativas).toHaveLength(0)
    expect(nuvem.s.chamadas).toBe(0)
    expect(w.obterStatusNuvem()).toMatchObject({ estado: 'nao_configurada', ligada: true })
  })

  it('sem licença: não chama a nuvem', async () => {
    const { w, nuvem, tentativas } = montar({ licenca: null })
    w.iniciarWorkerNuvem()
    w.ligarNuvem({ versao: 1, usuarioId: 1 })
    await w.sincronizarAgora()
    await vi.advanceTimersByTimeAsync(10 * MIN)
    expect(tentativas).toHaveLength(0)
    expect(nuvem.s.chamadas).toBe(0)
    expect(w.obterStatusNuvem()).toMatchObject({ estado: 'sem_licenca', ligada: true })
  })

  it('ligar dispara o primeiro envio e o status vira ok', async () => {
    const { w, nuvem, estado, tentativas } = montar()
    w.ligarNuvem({ versao: 1, usuarioId: 7 })
    expect(configuracaoRepository.obter('nuvem_ligada')).toBe('1')
    expect(JSON.parse(configuracaoRepository.obter('nuvem_consentimento')!)).toMatchObject({ versao: 1, usuarioId: 7 })
    expect(w.obterStatusNuvem().estado).toBe('sincronizando')

    await w.sincronizarAgora() // devolve o ciclo que o ligar já começou
    expect(tentativas).toHaveLength(1)
    const agora = new Date().toISOString()
    expect(w.obterStatusNuvem()).toEqual({
      estado: 'ok',
      ligada: true,
      ultimoEnvioEm: agora,
      ultimoErro: null,
      pendentes: 0,
      consentimentoEm: agora
    })
    expect(estado.atual).toEqual({ fingerprint: 'fp', cursor: contador(banco.db!) })
    expect(nuvem.s.varreduras).toBe(1) // primeiro envio: tudo, com varredura
    expect(nuvem.s.upserts.some((u) => u.tabela === 'empresa')).toBe(true)
    expect([...nuvem.s.paineis].sort()).toEqual(['avisos', 'hoje', 'mes', 'mes_anterior'])
    const empresa = banco.db!.prepare('SELECT uuid FROM empresa WHERE id = 1').get() as { uuid: string }
    expect(nuvem.s.configs[0].loja).toEqual({ id: empresa.uuid, nome: 'Ótica Teste', cnpj: '12345678000190' })
    expect(nuvem.s.configs[0].obterLicenca()).toBe('licenca-de-teste')

    // Alteração local depois do envio aparece como pendente.
    novoCliente(banco.db!, 'Bia')
    expect(w.obterStatusNuvem().pendentes).toBe(1)
  })

  it('sem internet: status sem_internet e intervalo dobra até 30 minutos', async () => {
    const { w, nuvem, tentativas } = montar()
    nuvem.s.modo = new NuvemErro('REDE', 0, 'Sem conexão com a nuvem.')
    ligarDireto()
    w.iniciarWorkerNuvem()
    await vi.advanceTimersByTimeAsync(30_000) // primeiro ciclo ~30 s depois de abrir
    expect(tentativas).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(91 * MIN)
    expect(intervalosEmMinutos(tentativas)).toEqual([2, 4, 8, 16, 30, 30])
    const st = w.obterStatusNuvem()
    expect(st.estado).toBe('sem_internet')
    expect(st.ultimoErro).toBeTruthy()
    expect(st.ultimoEnvioEm).toBeNull()
    expect(st.pendentes).toBe(contador(banco.db!))
  })

  it('sucesso depois de falha volta o intervalo para 2 minutos', async () => {
    const { w, nuvem, tentativas } = montar()
    nuvem.s.modo = new NuvemErro('NUVEM_HTTP', 503, 'A nuvem recusou a operação (HTTP 503).')
    ligarDireto()
    w.iniciarWorkerNuvem()
    await vi.advanceTimersByTimeAsync(30_000 + 2 * MIN) // falhas em 0:30 e 2:30
    expect(w.obterStatusNuvem().estado).toBe('sem_internet')
    nuvem.s.modo = 'ok'
    await vi.advanceTimersByTimeAsync(4 * MIN) // 6:30: volta a funcionar
    expect(w.obterStatusNuvem()).toMatchObject({ estado: 'ok', ultimoErro: null })
    await vi.advanceTimersByTimeAsync(4 * MIN)
    expect(intervalosEmMinutos(tentativas)).toEqual([2, 4, 2, 2])
  })

  it('PC novo precisa de aprovação: status aguardando_aprovacao e só tenta de novo em 30 minutos', async () => {
    const { w, nuvem, tentativas } = montar()
    nuvem.s.modo = new NuvemErro('PC_NOVO_PRECISA_APROVACAO', 409, 'A nuvem recusou a conexão deste computador (PC_NOVO_PRECISA_APROVACAO).')
    ligarDireto()
    w.iniciarWorkerNuvem()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(tentativas).toHaveLength(1)
    expect(w.obterStatusNuvem().estado).toBe('aguardando_aprovacao')
    await vi.advanceTimersByTimeAsync(29 * MIN)
    expect(tentativas).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1 * MIN)
    expect(tentativas).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(30 * MIN)
    expect(intervalosEmMinutos(tentativas)).toEqual([30, 30])
    expect(w.obterStatusNuvem().estado).toBe('aguardando_aprovacao')
  })

  it('dispositivo revogado: para de tentar', async () => {
    const { w, nuvem, tentativas } = montar()
    nuvem.s.modo = new NuvemErro('DISPOSITIVO_REVOGADO', 403, 'A nuvem recusou a conexão deste computador (DISPOSITIVO_REVOGADO).')
    ligarDireto()
    w.iniciarWorkerNuvem()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(w.obterStatusNuvem().estado).toBe('revogado')
    await vi.advanceTimersByTimeAsync(5 * 60 * MIN)
    expect(tentativas).toHaveLength(1)

    // Religar volta a tentar.
    nuvem.s.modo = 'ok'
    w.ligarNuvem({ versao: 1, usuarioId: 1 })
    await w.sincronizarAgora()
    expect(tentativas).toHaveLength(2)
    expect(w.obterStatusNuvem().estado).toBe('ok')
    await vi.advanceTimersByTimeAsync(2 * MIN)
    expect(tentativas).toHaveLength(3)
  })

  it('revogado e depois envio manual bem-sucedido: volta a tentar sozinho', async () => {
    const { w, nuvem, tentativas } = montar()
    nuvem.s.modo = new NuvemErro('DISPOSITIVO_REVOGADO', 403, 'A nuvem recusou a conexão deste computador (DISPOSITIVO_REVOGADO).')
    ligarDireto()
    w.iniciarWorkerNuvem()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(w.obterStatusNuvem().estado).toBe('revogado')

    // O dispositivo foi liberado na nuvem; o Administrador clica em "Sincronizar agora".
    nuvem.s.modo = 'ok'
    await w.sincronizarAgora()
    expect(tentativas).toHaveLength(2)
    expect(w.obterStatusNuvem().estado).toBe('ok')

    novoCliente(banco.db!, 'Depois da volta')
    nuvem.s.upserts = []
    await vi.advanceTimersByTimeAsync(2 * MIN)
    expect(tentativas).toHaveLength(3)
    expect(nuvem.s.upserts.filter((u) => u.tabela === 'cliente').flatMap((u) => u.linhas.map((l) => l.nome))).toEqual(['Depois da volta'])
    expect(w.obterStatusNuvem()).toMatchObject({ estado: 'ok', pendentes: 0 })
  })

  it('revogado e depois PC novo precisa de aprovação: volta a tentar a cada 30 minutos', async () => {
    const { w, nuvem, tentativas } = montar()
    nuvem.s.modo = new NuvemErro('DISPOSITIVO_REVOGADO', 403, 'A nuvem recusou a conexão deste computador (DISPOSITIVO_REVOGADO).')
    ligarDireto()
    w.iniciarWorkerNuvem()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(w.obterStatusNuvem().estado).toBe('revogado')

    nuvem.s.modo = new NuvemErro('PC_NOVO_PRECISA_APROVACAO', 409, 'A nuvem recusou a conexão deste computador (PC_NOVO_PRECISA_APROVACAO).')
    await w.sincronizarAgora()
    expect(tentativas).toHaveLength(2)
    expect(w.obterStatusNuvem().estado).toBe('aguardando_aprovacao')

    await vi.advanceTimersByTimeAsync(29 * MIN)
    expect(tentativas).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1 * MIN)
    expect(tentativas).toHaveLength(3)
    expect(intervalosEmMinutos(tentativas)).toEqual([0, 30])
  })

  it('não roda dois ciclos ao mesmo tempo', async () => {
    const { w, nuvem, tentativas } = montar()
    ligarDireto()
    await Promise.all([w.sincronizarAgora(), w.sincronizarAgora()])
    expect(tentativas).toHaveLength(1)
    expect(nuvem.s.varreduras).toBe(1)

    await w.sincronizarAgora() // terminado o ciclo, o próximo roda normalmente
    expect(tentativas).toHaveLength(2)
  })

  it('usa a conexão atual do banco a cada ciclo', async () => {
    const { w, nuvem, estado } = montar()
    for (const nome of ['A1', 'A2', 'A3', 'A4', 'A5']) novoCliente(banco.db!, nome)
    ligarDireto()
    await w.sincronizarAgora()
    const nomesEnviados = (): string[] =>
      nuvem.s.upserts.filter((u) => u.tabela === 'cliente').flatMap((u) => u.linhas.map((l) => String(l.nome)))
    expect(nomesEnviados()).toEqual(['A1', 'A2', 'A3', 'A4', 'A5'])

    // Backup restaurado: getDb() passa a devolver outra conexão.
    const novo = novoBanco()
    novoCliente(novo, 'Só no banco novo')
    banco.db = novo
    ligarDireto()
    nuvem.s.upserts = []
    await w.sincronizarAgora()
    expect(nomesEnviados()).toEqual(['Só no banco novo'])
    expect(estado.atual?.cursor).toBe(contador(novo))
    expect(w.obterStatusNuvem().pendentes).toBe(0)
  })

  it('falha ao gravar o painel não desfaz o envio das linhas', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { w, nuvem, estado } = montar()
    nuvem.s.falharPainel = true
    novoCliente(banco.db!, 'Ana')
    ligarDireto()
    await w.sincronizarAgora()
    expect(nuvem.s.upserts.some((u) => u.tabela === 'cliente')).toBe(true)
    expect(nuvem.s.paineis).toEqual([])
    expect(estado.atual?.cursor).toBe(contador(banco.db!))
    expect(w.obterStatusNuvem()).toMatchObject({ estado: 'ok', ultimoErro: null, pendentes: 0 })
    expect(w.obterStatusNuvem().ultimoEnvioEm).not.toBeNull()
    expect(erro).toHaveBeenCalled()
  })

  it('identidade ilegível: status erro com mensagem genérica, sem regenerar a identidade', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { w, nuvem, tentativas } = montar({
      identidade: () => {
        throw new Error('Unsupported state or unable to authenticate data')
      }
    })
    ligarDireto()
    await w.sincronizarAgora()
    expect(tentativas).toHaveLength(1)
    expect(nuvem.s.configs).toHaveLength(0)
    const st = w.obterStatusNuvem()
    expect(st.estado).toBe('erro')
    expect(st.ultimoErro).toBeTruthy()
    expect(st.ultimoErro).not.toContain('Unsupported')
    expect(erro).toHaveBeenCalled()
  })

  it.each(['', '12.345.678/', '   '])('CNPJ %j (vazio ou pela metade) vai como null para a nuvem', async (cnpj) => {
    banco.db!.prepare('UPDATE empresa SET cnpj = ? WHERE id = 1').run(cnpj)
    const { w, nuvem } = montar()
    ligarDireto()
    await w.sincronizarAgora()
    expect(nuvem.s.configs[0].loja.cnpj).toBeNull()
    expect(w.obterStatusNuvem().estado).toBe('ok')
  })

  it('prova expirada (data, hora ou fuso errados no PC): status erro pedindo para conferir o relógio', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { w, nuvem } = montar()
    nuvem.s.modo = new NuvemErro('PROVA_EXPIRADA', 403, 'A nuvem recusou a conexão deste computador (PROVA_EXPIRADA).')
    ligarDireto()
    await w.sincronizarAgora()
    expect(w.obterStatusNuvem()).toMatchObject({
      estado: 'erro',
      ultimoErro: 'Confira a data, a hora e o fuso horário deste computador.'
    })
  })

  it.each(['SINCRONIZACAO_DESLIGADA', 'LOJA_DE_OUTRA_LICENCA', 'DISPOSITIVO_NAO_CONFERE', 'DADOS_INVALIDOS', 'PROVA_INVALIDA'])(
    'recusa permanente da pc-token %s: status erro com o código na mensagem para o suporte',
    async (codigo) => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const { w, nuvem } = montar()
      nuvem.s.modo = new NuvemErro(codigo, 403, `A nuvem recusou a conexão deste computador (${codigo}).`)
      ligarDireto()
      await w.sincronizarAgora()
      const st = w.obterStatusNuvem()
      expect(st.estado).toBe('erro')
      expect(st.ultimoErro).toContain(codigo)
      expect(st.ultimoErro).toMatch(/suporte/)
      expect(st.ultimoErro).not.toContain('recusou a conexão deste computador')
    }
  )

  it.each([400, 403, 404])('nuvem recusou os dados (HTTP %i): status erro, sem texto da nuvem na tela', async (status) => {
    const { w, nuvem } = montar()
    nuvem.s.modo = new NuvemErro('NUVEM_RECUSOU', status, `A nuvem recusou a operação (HTTP ${status}).`)
    ligarDireto()
    await w.sincronizarAgora()
    const st = w.obterStatusNuvem()
    expect(st.estado).toBe('erro')
    expect(st.ultimoErro).toContain(`HTTP ${status}`)
    expect(st.ultimoErro).not.toContain('Sem conexão')
  })

  it.each([500, 429])('nuvem fora do ar (HTTP %i): continua sem_internet', async (status) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { w, nuvem } = montar()
    nuvem.s.modo = new NuvemErro('NUVEM_HTTP', status, `A nuvem recusou a operação (HTTP ${status}).`)
    ligarDireto()
    await w.sincronizarAgora()
    expect(w.obterStatusNuvem().estado).toBe('sem_internet')
  })

  it('licença recusada pela nuvem: status sem_licenca', async () => {
    const { w, nuvem } = montar()
    nuvem.s.modo = new NuvemErro('LICENCA_VENCIDA', 403, 'A nuvem recusou a conexão deste computador (LICENCA_VENCIDA).')
    ligarDireto()
    await w.sincronizarAgora()
    expect(w.obterStatusNuvem().estado).toBe('sem_licenca')
  })

  it('desligar no meio do ciclo (lote 2): para na hora, cursor intacto e sem erro', async () => {
    const { w, nuvem, estado, tentativas } = montar()
    nuvem.s.aoUpsert = (n) => {
      if (n === 2) w.desligarNuvem()
    }
    ligarDireto()
    w.iniciarWorkerNuvem()
    await w.sincronizarAgora()
    expect(nuvem.s.qtdUpserts).toBe(2)
    expect(nuvem.s.varreduras).toBe(0)
    expect(nuvem.s.paineis).toEqual([])
    expect(estado.atual).toBeNull()
    expect(w.obterStatusNuvem()).toMatchObject({ estado: 'desligada', ligada: false, ultimoErro: null, ultimoEnvioEm: null })
    const chamadas = nuvem.s.chamadas
    await vi.advanceTimersByTimeAsync(30 * MIN)
    expect(nuvem.s.chamadas).toBe(chamadas)
    expect(tentativas).toHaveLength(1)
  })

  it('desligar enquanto grava o painel: não grava os períodos que faltam', async () => {
    const { w, nuvem, estado } = montar()
    let n = 0
    nuvem.s.aoPainel = () => {
      n = contador(banco.db!) // antes do desligar, que também mexe em configuracao
      w.desligarNuvem()
    }
    ligarDireto()
    await w.sincronizarAgora()
    expect(nuvem.s.varreduras).toBe(1)
    expect(estado.atual?.cursor).toBe(n) // as linhas já tinham ido: o cursor avança
    expect(nuvem.s.paineis).toHaveLength(1)
    expect(w.obterStatusNuvem()).toMatchObject({ estado: 'desligada', ultimoErro: null })
  })

  it('desligar durante um envio que depois falha: não registra a falha', async () => {
    const { w, nuvem, estado } = montar()
    nuvem.s.aoUpsert = (n) => {
      if (n !== 1) return
      w.desligarNuvem()
      nuvem.s.modo = new NuvemErro('REDE', 0, 'Sem conexão com a nuvem.')
    }
    ligarDireto()
    await w.sincronizarAgora()
    expect(estado.atual).toBeNull()
    expect(w.obterStatusNuvem()).toMatchObject({ estado: 'desligada', ultimoErro: null })

    // Religar começa do zero: sem falha acumulada, envia tudo e o relógio volta a 2 minutos.
    nuvem.s.aoUpsert = null
    nuvem.s.modo = 'ok'
    w.ligarNuvem({ versao: 1, usuarioId: 1 })
    await w.sincronizarAgora()
    expect(w.obterStatusNuvem()).toMatchObject({ estado: 'ok', ultimoErro: null, pendentes: 0 })
  })

  it('relógio do Windows atrasado 1 hora não congela as tentativas', async () => {
    const { w, nuvem, tentativas } = montar()
    nuvem.s.modo = new NuvemErro('REDE', 0, 'Sem conexão com a nuvem.')
    ligarDireto()
    w.iniciarWorkerNuvem()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(tentativas).toHaveLength(1)
    vi.setSystemTime(new Date(Date.now() - 60 * MIN))
    await vi.advanceTimersByTimeAsync(6 * MIN)
    expect(intervalosEmMinutos(tentativas)).toEqual([2, 4])
  })

  it('relógio do Windows adiantado 1 hora não pula o intervalo crescente', async () => {
    const { w, nuvem, tentativas } = montar()
    nuvem.s.modo = new NuvemErro('REDE', 0, 'Sem conexão com a nuvem.')
    ligarDireto()
    w.iniciarWorkerNuvem()
    await vi.advanceTimersByTimeAsync(30_000 + 2 * MIN) // falhas em 0:30 e 2:30; a próxima é em 6:30
    vi.setSystemTime(new Date(Date.now() + 60 * MIN))
    await vi.advanceTimersByTimeAsync(2 * MIN)
    expect(tentativas).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(2 * MIN)
    expect(intervalosEmMinutos(tentativas)).toEqual([2, 4])
  })

  it('o relógio que bate uns milissegundos antes do previsto não perde a vez', async () => {
    // O setInterval conta do tempo do laço de eventos, que pode ser um pouco anterior ao início medido do ciclo.
    let adiantado = 0
    const { w, nuvem, tentativas } = montar({ monotonico: () => performance.now() - adiantado })
    nuvem.s.modo = new NuvemErro('REDE', 0, 'Sem conexão com a nuvem.')
    ligarDireto()
    w.iniciarWorkerNuvem()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(tentativas).toHaveLength(1)
    adiantado = 3
    await vi.advanceTimersByTimeAsync(2 * MIN)
    expect(tentativas).toHaveLength(2)
  })

  it('marcarReenvioTotal (backup restaurado): cursor 0 e o próximo ciclo reenvia tudo com varredura', async () => {
    const { w, nuvem, estado } = montar()
    novoCliente(banco.db!, 'Ana')
    ligarDireto()
    await w.sincronizarAgora()
    expect(nuvem.s.varreduras).toBe(1)
    w.marcarReenvioTotal()
    expect(estado.atual).toEqual({ fingerprint: 'fp', cursor: 0 })
    nuvem.s.upserts = []
    await w.sincronizarAgora()
    expect(nuvem.s.varreduras).toBe(2)
    expect(nuvem.s.upserts.some((u) => u.tabela === 'cliente')).toBe(true)
    expect(estado.atual?.cursor).toBe(contador(banco.db!))
  })

  it('marcarReenvioTotal sem a nuvem ter rodado nunca: não cria estado', () => {
    const { w, estado } = montar()
    w.marcarReenvioTotal()
    expect(estado.atual).toBeNull()
  })

  it('marcarReenvioTotal com um ciclo em andamento: o cursor gravado pelo ciclo não apaga a marca', async () => {
    const { w, nuvem, estado } = montar()
    ligarDireto()
    await w.sincronizarAgora()
    nuvem.s.aoUpsert = () => w.marcarReenvioTotal()
    novoCliente(banco.db!, 'Bia')
    await w.sincronizarAgora()
    expect(nuvem.s.qtdUpserts).toBeGreaterThan(0)
    expect(estado.atual?.cursor).toBe(0)
  })

  it('desligar grava a chave e o status volta a desligada', async () => {
    const { w } = montar()
    w.ligarNuvem({ versao: 1, usuarioId: 1 })
    await w.sincronizarAgora()
    w.desligarNuvem()
    expect(configuracaoRepository.obter('nuvem_ligada')).toBe('0')
    expect(w.obterStatusNuvem()).toMatchObject({ estado: 'desligada', ligada: false, consentimentoEm: null })
  })
})
