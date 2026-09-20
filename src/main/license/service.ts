import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from '@main/paths'
import { getDb } from '@main/db/connection'
import type { LicencaInfo, MotivoChaveRecusada } from '@shared/types'
import { verificarChave, normalizarFingerprint, type LicencaPayload } from './chave'
import { CHAVE_PUBLICA_PEM } from './chavePublica'
import { calcularLicenca, estendeLicenca, hojeLocalIso } from './estado'
import { obterFingerprint } from './fingerprint'
import { mesclarEstadoLocal, reancorarMarca, resolverHoje, type EstadoLocal } from './relogio'

// A chave e o estado local ficam em userData, FORA do banco de dados: restaurar um
// backup nunca sobrescreve nem traz a licença de outra máquina.
const arquivoChave = (): string => paths.licenca()
const arquivoEstado = (): string => join(paths.root(), 'licenca-estado.json')
const CHAVE_PREFERENCIA = 'licenca_local'

// Consultado a cada gravação (autosave); um cache curto evita reverificar a
// assinatura e reler disco toda vez sem deixar a UI ver estado velho por muito tempo.
const TTL_CACHE_MS = 60_000
let cache: { info: LicencaInfo; expiraEm: number } | null = null

const MSG_TESTE_ENCERRADO =
  'Somente leitura: o período de teste terminou. Ative uma licença em "Licença" para voltar a editar.'
const MSG_VENCIDA =
  'Somente leitura: sua licença venceu. Renove em "Licença" para voltar a editar — seus dados continuam intactos.'

/**
 * Chave pública usada para verificar. Em build empacotado é SEMPRE a embutida;
 * fora dele, `OTICASUITE_CHAVE_PUBLICA_TESTE` (PEM) permite testar a ativação de ponta
 * a ponta com um par de chaves descartável, sem ter a privada do produto real.
 */
function chavePublicaEmUso(): string {
  const teste = process.env['OTICASUITE_CHAVE_PUBLICA_TESTE']
  return !app.isPackaged && teste ? teste : CHAVE_PUBLICA_PEM
}

/** Em desenvolvimento a cobrança fica desligada (senão o ambiente de teste vira somente leitura em 14 dias). */
function cobrancaDesligada(): boolean {
  return !app.isPackaged && process.env['OTICASUITE_FORCAR_LICENCA'] !== '1'
}

// ---- Persistência do estado local (arquivo + banco), sempre tolerante a falha ----

function lerEstadoArquivo(): Partial<EstadoLocal> | null {
  try {
    return JSON.parse(readFileSync(arquivoEstado(), 'utf8')) as Partial<EstadoLocal>
  } catch {
    return null
  }
}

function lerEstadoBanco(): Partial<EstadoLocal> | null {
  try {
    const linha = getDb()
      .prepare('SELECT valor FROM configuracao WHERE chave = ?')
      .get(CHAVE_PREFERENCIA) as { valor: string } | undefined
    return linha ? (JSON.parse(linha.valor) as Partial<EstadoLocal>) : null
  } catch {
    return null
  }
}

function mesmo(a: Partial<EstadoLocal> | null, b: EstadoLocal): boolean {
  return a?.inicioTeste === b.inicioTeste && a?.maiorDataVista === b.maiorDataVista
}

/** Grava nos dois lugares, só onde diferente (evita escrever em disco a cada consulta ao estado). */
function gravarEstadoLocal(novo: EstadoLocal, arquivo: Partial<EstadoLocal> | null, banco: Partial<EstadoLocal> | null): void {
  const json = JSON.stringify(novo)
  if (!mesmo(arquivo, novo)) {
    try {
      writeFileSync(arquivoEstado(), json, 'utf8')
    } catch (e) {
      console.error('[licenca] falha ao gravar estado em arquivo:', e)
    }
  }
  if (!mesmo(banco, novo)) {
    try {
      getDb()
        .prepare(
          `INSERT INTO configuracao (chave, valor, tipo) VALUES (@chave, @valor, 'texto')
           ON CONFLICT(chave) DO UPDATE SET valor = @valor`
        )
        .run({ chave: CHAVE_PREFERENCIA, valor: json })
    } catch (e) {
      console.error('[licenca] falha ao gravar estado no banco:', e)
    }
  }
}

// ---- Chave instalada ----

function lerChaveInstalada(): { licenca: LicencaPayload | null; recusada: MotivoChaveRecusada | null } {
  if (!existsSync(arquivoChave())) return { licenca: null, recusada: null }

  let texto: string
  try {
    texto = readFileSync(arquivoChave(), 'utf8')
  } catch {
    return { licenca: null, recusada: null }
  }

  // Chave corrompida, adulterada ou de outra máquina: nunca apaga o arquivo nem
  // os dados do cliente — só deixa de reconhecer a licença (e explica por quê).
  const payload = verificarChave(texto, chavePublicaEmUso())
  if (!payload) return { licenca: null, recusada: 'invalida' }
  if (normalizarFingerprint(payload.fingerprint) !== obterFingerprint()) {
    return { licenca: null, recusada: 'outra_maquina' }
  }
  return { licenca: payload, recusada: null }
}

// ---- API do módulo ----

function calcular(): LicencaInfo {
  const fingerprint = obterFingerprint()

  if (cobrancaDesligada()) {
    return {
      estado: 'ativa',
      cliente: 'Modo desenvolvimento',
      plano: null,
      validade: null,
      diasParaVencer: null,
      fingerprint,
      chaveRecusada: null,
      somenteLeitura: false
    }
  }

  const arquivo = lerEstadoArquivo()
  const banco = lerEstadoBanco()
  const { hoje, inicioTeste, maiorDataVista } = resolverHoje(
    hojeLocalIso(),
    mesclarEstadoLocal([arquivo, banco])
  )
  gravarEstadoLocal({ inicioTeste, maiorDataVista }, arquivo, banco)

  const { licenca, recusada } = lerChaveInstalada()
  return calcularLicenca({ hoje, fingerprint, inicioTeste, licenca, chaveRecusada: recusada })
}

export function obterLicencaInfo(): LicencaInfo {
  const agora = Date.now()
  if (cache && cache.expiraEm > agora) return cache.info
  const info = calcular()
  cache = { info, expiraEm: agora + TTL_CACHE_MS }
  return info
}

/**
 * Trava só a escrita quando a licença não permite — nunca apaga nada. Backup e
 * Licença ficam sempre liberados: o dado é da ótica, não do fornecedor.
 */
export function exigirEscrita(): void {
  const info = obterLicencaInfo()
  if (!info.somenteLeitura) return
  throw new Error(info.estado === 'teste_encerrado' ? MSG_TESTE_ENCERRADO : MSG_VENCIDA)
}

export function ativarLicenca(chave: string): LicencaInfo {
  const payload = verificarChave(chave, chavePublicaEmUso())
  if (!payload) throw new Error('Chave de licença inválida. Confira se copiou a chave inteira.')
  if (normalizarFingerprint(payload.fingerprint) !== obterFingerprint()) {
    throw new Error('Esta chave foi emitida para outra máquina.')
  }

  const atual = lerChaveInstalada().licenca
  if (atual && payload.emitidoEm < atual.emitidoEm) {
    throw new Error('Esta chave é mais antiga que a licença já instalada.')
  }
  if (!estendeLicenca(atual, payload)) {
    const ate = atual?.validade ? atual.validade.split('-').reverse().join('/') : ''
    throw new Error(
      `Esta chave não aumenta o prazo da sua licença atual${ate ? ` (que vale até ${ate})` : ''}. Use a chave mais recente que você recebeu.`
    )
  }

  // Renovação de verdade (estritamente mais nova, ou primeira chave): reancora a
  // marca do relógio — ver reancorarMarca().
  if (!atual || payload.emitidoEm > atual.emitidoEm) {
    const arquivo = lerEstadoArquivo()
    const banco = lerEstadoBanco()
    const local = mesclarEstadoLocal([arquivo, banco])
    gravarEstadoLocal(
      {
        inicioTeste: local.inicioTeste,
        maiorDataVista: reancorarMarca(payload.emitidoEm, hojeLocalIso())
      },
      arquivo,
      banco
    )
  }

  writeFileSync(arquivoChave(), chave.replace(/\s+/g, ''), 'utf8')
  cache = null
  return obterLicencaInfo()
}

/** Atalho usado por `requirePermissao`: true quando o main deve recusar qualquer escrita. */
export function emSomenteLeitura(): boolean {
  return obterLicencaInfo().somenteLeitura
}
