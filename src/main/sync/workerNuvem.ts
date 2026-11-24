import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { safeStorage } from 'electron'
import { getDb } from '@main/db/connection'
import { obterFingerprint } from '@main/license/fingerprint'
import { obterChaveParaNuvem } from '@main/license/service'
import { paths } from '@main/paths'
import { configuracaoRepository } from '@main/repositories/configuracaoRepository'
import { dataLocalISO } from '@shared/data'
import type { NuvemEstado, NuvemStatus } from '@shared/types'
import { normalizarCnpj } from '../../../supabase/functions/pc-token/logica'
import { executarCiclo } from './cicloEnvio'
import { criarClienteNuvem, NuvemErro, type ClienteNuvem, type ConfigCliente } from './clienteNuvem'
import { gravarEstado, lerEstado, type EstadoNuvem } from './estadoNuvem'
import { carregarIdentidadePc, type Cofre, type IdentidadePc } from './identidadePc'
import { chaveAnon, NUVEM_URL, nuvemConfigurada } from './nuvemConfig'
import { montarPaineis } from './painelPronto'

const MINUTO = 60_000
/** Intervalo normal entre ciclos e passo do relógio do worker. */
export const INTERVALO_BASE_MS = 2 * MINUTO
/** Teto do intervalo crescente (sem internet, nuvem fora do ar, licença recusada, erro). */
export const INTERVALO_MAXIMO_MS = 30 * MINUTO
/** PC novo esperando aprovação no celular: não adianta insistir a cada 2 minutos. */
export const ESPERA_APROVACAO_MS = 30 * MINUTO
/** Primeiro ciclo um pouco depois de abrir, para não disputar com a abertura do app. */
export const ATRASO_INICIAL_MS = 30_000
/**
 * O setInterval conta do tempo do laço de eventos, que pode ser um pouco anterior ao início medido do ciclo:
 * o relógio pode bater uns ms "antes" do previsto. Sem esta folga, essa batida seria pulada (2 min virariam 4).
 */
const FOLGA_RELOGIO_MS = 1_000

const CHAVE_LIGADA = 'nuvem_ligada'
const CHAVE_CONSENTIMENTO = 'nuvem_consentimento'
const CHAVE_DISPOSITIVO = 'sync_dispositivo_id'

const MSG_SEM_INTERNET = 'Sem conexão com a nuvem. O sistema continua funcionando e tenta de novo sozinho.'
const MSG_APROVACAO = 'Este computador precisa ser aprovado pelo Administrador no celular.'
const MSG_REVOGADO = 'Este computador foi desconectado da nuvem pelo Administrador.'
const MSG_LICENCA = 'A licença não permite usar a nuvem agora (vencida, inválida ou sem o recurso).'
const MSG_ERRO = 'Não foi possível enviar os dados para a nuvem. O sistema continua funcionando e tenta de novo mais tarde.'
const MSG_RELOGIO = 'Confira a data, a hora e o fuso horário deste computador.'
/** Recusas da pc-token que não passam sozinhas: a tela mostra uma frase curta e o código, para o suporte. */
const RECUSAS_PERMANENTES = new Map<string, string>([
  ['SINCRONIZACAO_DESLIGADA', 'A sincronização desta loja está desligada na nuvem.'],
  ['LOJA_DE_OUTRA_LICENCA', 'Esta loja está ligada a outra licença na nuvem.'],
  ['DISPOSITIVO_NAO_CONFERE', 'A nuvem não reconheceu este computador.'],
  ['DADOS_INVALIDOS', 'A nuvem recusou os dados deste computador.'],
  ['PROVA_INVALIDA', 'A nuvem não reconheceu este computador.']
])

export interface TimersWorker {
  setInterval(fn: () => void, ms: number): unknown
  clearInterval(h: unknown): void
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(h: unknown): void
}

export interface DepsWorker {
  /** Chamado a cada ciclo: restaurar backup troca a conexão. */
  getDb(): DatabaseSync
  criarCliente(c: ConfigCliente): ClienteNuvem
  /** Carrega (ou cria) a identidade do PC; pode lançar (cofre indisponível, chave ilegível). */
  identidade(): IdentidadePc
  estado: { ler(): EstadoNuvem | null; gravar(e: EstadoNuvem): void }
  fingerprint(): string
  /** Chave da licença liberada para a nuvem, ou null. */
  obterLicenca(): string | null
  nuvemConfigurada(): boolean
  /** Data e hora do relógio do Windows: só para mostrar (último envio, consentimento) e para o painel. */
  agora(): Date
  /** Relógio monotônico em ms (performance.now()): mede os intervalos; não muda quando acertam o relógio do Windows. */
  monotonico(): number
  timers: TimersWorker
}

export interface WorkerNuvem {
  iniciarWorkerNuvem(): void
  pararWorkerNuvem(): void
  sincronizarAgora(): Promise<void>
  obterStatusNuvem(): NuvemStatus
  ligarNuvem(consentimento: { versao: number; usuarioId: number }): void
  desligarNuvem(): void
}

type Loja = ConfigCliente['loja']
type Falha = { estado: NuvemEstado; mensagem: string }

function semRef(h: unknown): void {
  ;(h as { unref?: () => void } | null)?.unref?.()
}

function lerLoja(db: DatabaseSync): Loja {
  const r = db.prepare('SELECT uuid, nome_fantasia, cnpj FROM empresa WHERE id = 1').get() as
    | { uuid: string | null; nome_fantasia: string; cnpj: string | null }
    | undefined
  if (!r?.uuid) throw new Error('Cadastro da empresa ausente: não há loja para enviar à nuvem.')
  // CNPJ vazio ou digitado pela metade vai como null: a nuvem só aceita 14 dígitos.
  return { id: r.uuid, nome: r.nome_fantasia.slice(0, 200), cnpj: normalizarCnpj(r.cnpj) }
}

/** Traduz a falha de um ciclo em estado + mensagem para a tela; detalhe técnico só no log. */
function classificar(e: unknown): Falha {
  if (e instanceof NuvemErro) {
    if (e.codigo === 'REDE') return { estado: 'sem_internet', mensagem: MSG_SEM_INTERNET }
    if (e.codigo === 'NUVEM_HTTP') {
      // Nuvem fora do ar ou ocupada (5xx, 408, 429): passa sozinho. O detalhe já foi para o log no cliente.
      console.error(`[nuvem] a nuvem não atendeu agora (HTTP ${e.status}); tenta de novo mais tarde`)
      return { estado: 'sem_internet', mensagem: MSG_SEM_INTERNET }
    }
    if (e.codigo === 'NUVEM_RECUSOU') {
      return {
        estado: 'erro',
        mensagem: `A nuvem recusou o envio (HTTP ${e.status}). O sistema continua funcionando e tenta de novo mais tarde; se o aviso continuar, fale com o suporte.`
      }
    }
    if (e.codigo === 'PC_NOVO_PRECISA_APROVACAO') return { estado: 'aguardando_aprovacao', mensagem: MSG_APROVACAO }
    if (e.codigo === 'DISPOSITIVO_REVOGADO') return { estado: 'revogado', mensagem: MSG_REVOGADO }
    if (e.codigo.startsWith('LICENCA_') || e.codigo === 'SEM_RECURSO_NUVEM') {
      return { estado: 'sem_licenca', mensagem: MSG_LICENCA }
    }
    if (e.codigo === 'PROVA_EXPIRADA') {
      console.error('[nuvem] a nuvem recusou a prova do PC (PROVA_EXPIRADA): relógio ou fuso do computador errado')
      return { estado: 'erro', mensagem: MSG_RELOGIO }
    }
    const frase = RECUSAS_PERMANENTES.get(e.codigo)
    if (frase) {
      console.error(`[nuvem] a nuvem recusou este computador (${e.codigo}, HTTP ${e.status})`)
      return { estado: 'erro', mensagem: `${frase} Fale com o suporte e informe o código ${e.codigo}.` }
    }
  }
  console.error('[nuvem] falha no ciclo de envio', e)
  return { estado: 'erro', mensagem: MSG_ERRO }
}

export function criarWorker(d: DepsWorker): WorkerNuvem {
  let ativo = false
  let primeiro: unknown = null
  let relogio: unknown = null
  let emAndamento: Promise<void> | null = null
  /** Resultado do último ciclo (ok ou falha); null antes do primeiro ou depois de ligar/desligar. */
  let resultado: { estado: NuvemEstado; erro: string | null } | null = null
  let ultimoEnvioEm: string | null = null
  let falhasSeguidas = 0
  /** Antes deste instante (ms do relógio monotônico) o relógio não dispara ciclo; `sincronizarAgora` ignora. */
  let proximaEm = 0
  /** Revogado: o relógio para de tentar até religar. */
  let parado = false
  let clienteAtual: { chave: string; cliente: ClienteNuvem } | null = null

  /** O relógio bate a cada 2 min contados do início do último ciclo, então os intervalos ficam exatos. */
  function rearmar(): void {
    if (!ativo) return
    if (relogio !== null) d.timers.clearInterval(relogio)
    relogio = d.timers.setInterval(tique, INTERVALO_BASE_MS)
    semRef(relogio)
  }

  function tique(): void {
    if (parado || emAndamento) return
    if (d.monotonico() + FOLGA_RELOGIO_MS < proximaEm) return
    void executar()
  }

  /** Motivo local para nem tentar (sem tocar na nuvem), ou null. */
  function bloqueio(): NuvemEstado | null {
    if (configuracaoRepository.obter(CHAVE_LIGADA) !== '1') return 'desligada'
    if (!d.nuvemConfigurada()) return 'nao_configurada'
    if (d.obterLicenca() === null) return 'sem_licenca'
    return null
  }

  /** Reaproveita o cliente (e o token dele) enquanto loja e identidade forem as mesmas. */
  function cliente(loja: Loja, identidade: IdentidadePc): ClienteNuvem {
    const chave = JSON.stringify([loja.id, loja.nome, loja.cnpj, identidade.dispositivoId, identidade.chavePublica])
    if (clienteAtual?.chave === chave) return clienteAtual.cliente
    const novo = d.criarCliente({
      url: NUVEM_URL,
      chaveAnon: chaveAnon(),
      loja,
      identidade,
      obterLicenca: () => {
        const l = d.obterLicenca()
        if (l === null) throw new NuvemErro('LICENCA_AUSENTE', 0, 'Sem licença liberada para a nuvem.')
        return l
      }
    })
    clienteAtual = { chave, cliente: novo }
    return novo
  }

  /** A nuvem continua ligada? Na dúvida (banco fechado), não. */
  function ligada(): boolean {
    try {
      return configuracaoRepository.obter(CHAVE_LIGADA) === '1'
    } catch {
      return false
    }
  }

  async function enviarPainel(c: ClienteNuvem): Promise<void> {
    try {
      const paineis = montarPaineis(dataLocalISO(d.agora()))
      for (const [periodo, indicadores] of Object.entries(paineis)) {
        if (!ligada()) return
        await c.gravarPainel(periodo, indicadores)
      }
    } catch (e) {
      // As linhas já foram enviadas e o cursor já avançou: o painel tenta de novo no próximo ciclo.
      console.error('[nuvem] falha ao gravar o painel', e)
    }
  }

  function registrarFalha(e: unknown, inicio: number): void {
    const f = classificar(e)
    resultado = { estado: f.estado, erro: f.mensagem }
    // Só 'revogado' para o relógio; qualquer outro resultado (mesmo de um envio manual) volta às tentativas automáticas.
    parado = f.estado === 'revogado'
    if (parado) return
    if (f.estado === 'aguardando_aprovacao') {
      falhasSeguidas = 0
      proximaEm = inicio + ESPERA_APROVACAO_MS
      return
    }
    falhasSeguidas++
    proximaEm = inicio + Math.min(INTERVALO_BASE_MS * 2 ** (falhasSeguidas - 1), INTERVALO_MAXIMO_MS)
  }

  async function ciclo(): Promise<void> {
    const inicio = d.monotonico()
    rearmar()
    try {
      const identidade = d.identidade()
      const db = d.getDb()
      const c = cliente(lerLoja(db), identidade)
      const fingerprint = d.fingerprint()
      const r = await executarCiclo({
        db,
        cliente: c,
        lerEstado: () => d.estado.ler() ?? { fingerprint, cursor: 0 },
        gravarEstado: (e) => d.estado.gravar(e),
        fingerprint,
        agora: () => d.agora(),
        continuar: ligada
      })
      // Desligada no meio: o desligar já zerou o status; nem sucesso nem falha a registrar.
      if (r.interrompido) return
      ultimoEnvioEm = d.agora().toISOString()
      resultado = { estado: 'ok', erro: null }
      parado = false
      falhasSeguidas = 0
      proximaEm = inicio + INTERVALO_BASE_MS
      await enviarPainel(c)
    } catch (e) {
      // Falha de uma chamada que já estava no ar quando desligaram: não conta como falha.
      if (!ligada()) return
      registrarFalha(e, inicio)
    }
  }

  function executar(): Promise<void> {
    if (emAndamento) return emAndamento
    try {
      if (bloqueio()) return Promise.resolve()
    } catch (e) {
      console.error('[nuvem] falha ao conferir se a nuvem está ligada', e)
      return Promise.resolve()
    }
    emAndamento = ciclo().finally(() => {
      emAndamento = null
    })
    return emAndamento
  }

  function lerConsentimentoEm(): string | null {
    const valor = configuracaoRepository.obter(CHAVE_CONSENTIMENTO)
    if (!valor) return null
    try {
      const j = JSON.parse(valor) as { em?: unknown }
      return typeof j?.em === 'string' ? j.em : null
    } catch {
      return null
    }
  }

  function estadoAtual(ligada: boolean): NuvemEstado {
    if (!ligada) return 'desligada'
    if (!d.nuvemConfigurada()) return 'nao_configurada'
    if (d.obterLicenca() === null) return 'sem_licenca'
    if (emAndamento) return 'sincronizando'
    return resultado?.estado ?? 'aguardando'
  }

  function reiniciarTentativas(): void {
    resultado = null
    falhasSeguidas = 0
    proximaEm = 0
    parado = false
  }

  return {
    iniciarWorkerNuvem() {
      if (ativo) return
      ativo = true
      primeiro = d.timers.setTimeout(() => {
        primeiro = null
        rearmar()
        tique()
      }, ATRASO_INICIAL_MS)
      semRef(primeiro)
    },

    pararWorkerNuvem() {
      ativo = false
      if (primeiro !== null) d.timers.clearTimeout(primeiro)
      if (relogio !== null) d.timers.clearInterval(relogio)
      primeiro = null
      relogio = null
    },

    sincronizarAgora() {
      return executar()
    },

    obterStatusNuvem() {
      const ligada = configuracaoRepository.obter(CHAVE_LIGADA) === '1'
      const n = (d.getDb().prepare('SELECT valor FROM sync_contador WHERE id = 1').get() as { valor: number }).valor
      const cursor = d.estado.ler()?.cursor ?? 0
      return {
        estado: estadoAtual(ligada),
        ligada,
        ultimoEnvioEm,
        ultimoErro: resultado?.erro ?? null,
        pendentes: Math.max(0, n - cursor),
        consentimentoEm: lerConsentimentoEm()
      }
    },

    ligarNuvem(consentimento) {
      const registro = { versao: consentimento.versao, usuarioId: consentimento.usuarioId, em: d.agora().toISOString() }
      configuracaoRepository.definir(CHAVE_CONSENTIMENTO, JSON.stringify(registro))
      configuracaoRepository.definir(CHAVE_LIGADA, '1')
      reiniciarTentativas()
      void executar()
    },

    desligarNuvem() {
      configuracaoRepository.definir(CHAVE_LIGADA, '0')
      configuracaoRepository.definir(CHAVE_CONSENTIMENTO, '')
      reiniciarTentativas()
    }
  }
}

// ---- Dependências reais (processo main do Electron) ----

/** O mesmo nome que `carregarIdentidadePc` usa dentro da pasta (userData). */
const arquivoEstado = (): string => join(paths.root(), 'nuvem-estado.json')

/** Cofre do sistema (DPAPI no Windows) para a chave privada do PC. */
const cofreDoSistema: Cofre = {
  disponivel: () => safeStorage.isEncryptionAvailable(),
  cifrar: (texto) => safeStorage.encryptString(texto),
  decifrar: (dados) => safeStorage.decryptString(dados)
}

const workerPadrao = criarWorker({
  getDb,
  criarCliente: criarClienteNuvem,
  identidade: () =>
    carregarIdentidadePc({
      pasta: paths.root(),
      cofre: cofreDoSistema,
      fingerprint: obterFingerprint(),
      lerDispositivoId: () => configuracaoRepository.obter(CHAVE_DISPOSITIVO) || null,
      gravarDispositivoId: (id) => configuracaoRepository.definir(CHAVE_DISPOSITIVO, id)
    }),
  estado: {
    ler: () => lerEstado(arquivoEstado()),
    gravar: (e) => gravarEstado(arquivoEstado(), e)
  },
  fingerprint: obterFingerprint,
  obterLicenca: obterChaveParaNuvem,
  nuvemConfigurada,
  agora: () => new Date(),
  monotonico: () => performance.now(),
  timers: {
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>)
  }
})

/** Idempotente: primeiro ciclo ~30 s depois de abrir, depois a cada 2 min (timers com `unref`). */
export function iniciarWorkerNuvem(): void {
  workerPadrao.iniciarWorkerNuvem()
}

export function pararWorkerNuvem(): void {
  workerPadrao.pararWorkerNuvem()
}

/** Executa um ciclo já, ignorando o intervalo; se um ciclo está em andamento, devolve o mesmo. */
export function sincronizarAgora(): Promise<void> {
  return workerPadrao.sincronizarAgora()
}

export function obterStatusNuvem(): NuvemStatus {
  return workerPadrao.obterStatusNuvem()
}

/** Grava `nuvem_ligada` e o consentimento e dispara o primeiro envio. */
export function ligarNuvem(consentimento: { versao: number; usuarioId: number }): void {
  workerPadrao.ligarNuvem(consentimento)
}

/** Para o envio (os dados já enviados ficam na nuvem). */
export function desligarNuvem(): void {
  workerPadrao.desligarNuvem()
}
