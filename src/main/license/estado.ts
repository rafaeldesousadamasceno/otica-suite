import { readFileSync, existsSync } from 'node:fs'
import { paths } from '@main/paths'
import { verificarChave } from './chave'
import { obterFingerprint } from './fingerprint'
import type { EstadoLicenca, LicencaInfo } from '@shared/types'

const DIAS_AVISO_VENCIMENTO = 30
const DIAS_CARENCIA = 15
// Cache curto: evita reler/reverificar a chave a cada chamada de IPC (esta
// funcao e consultada por requirePermissao, ou seja, em quase toda acao de
// escrita do sistema), sem deixar a UI mostrar um estado velho por muito tempo.
const TTL_CACHE_MS = 5 * 60_000

let cache: { info: LicencaInfo; expiraEm: number } | null = null

function semLicenca(): LicencaInfo {
  return {
    estado: 'nao_ativada',
    oticaNome: null,
    tipo: null,
    validade: null,
    fingerprint: obterFingerprint(),
    diasParaVencer: null
  }
}

function diasEntre(hojeIso: string, dataIso: string): number {
  const hoje = Date.parse(`${hojeIso}T00:00:00Z`)
  const data = Date.parse(`${dataIso}T00:00:00Z`)
  return Math.round((data - hoje) / 86_400_000)
}

function calcular(): LicencaInfo {
  if (!existsSync(paths.licenca())) return semLicenca()

  const chave = readFileSync(paths.licenca(), 'utf8')
  const payload = verificarChave(chave)

  // Chave corrompida/adulterada ou emitida para outra maquina: nunca apaga
  // o arquivo nem os dados do cliente, so deixa de reconhecer a licenca.
  if (!payload || payload.fingerprint !== obterFingerprint()) return semLicenca()

  if (payload.tipo === 'perpetua' || !payload.validade) {
    return {
      estado: 'ativa',
      oticaNome: payload.otica,
      tipo: payload.tipo,
      validade: null,
      fingerprint: payload.fingerprint,
      diasParaVencer: null
    }
  }

  const hoje = new Date().toISOString().slice(0, 10)
  const dias = diasEntre(hoje, payload.validade)

  let estado: EstadoLicenca
  if (dias < -DIAS_CARENCIA) estado = 'vencida'
  else if (dias < 0) estado = 'carencia'
  else if (dias <= DIAS_AVISO_VENCIMENTO) estado = 'proxima_vencimento'
  else estado = 'ativa'

  return {
    estado,
    oticaNome: payload.otica,
    tipo: payload.tipo,
    validade: payload.validade,
    fingerprint: payload.fingerprint,
    diasParaVencer: dias
  }
}

export function obterLicencaInfo(): LicencaInfo {
  const agora = Date.now()
  if (cache && cache.expiraEm > agora) return cache.info
  const info = calcular()
  cache = { info, expiraEm: agora + TTL_CACHE_MS }
  return info
}

/** Chame depois de gravar/trocar o arquivo de licenca, pra nao esperar o TTL. */
export function invalidarCacheLicenca(): void {
  cache = null
}

/**
 * RF-13.4/14.3: licenca vencida (alem da carencia) trava toda escrita no
 * sistema - nunca apaga dado nenhum, so impede criar/editar/excluir ate a
 * renovacao. Backup e a propria tela de licenca ficam sempre liberados
 * (PRD 14.3: "o dado e da otica, nao seu").
 */
export function emSomenteLeitura(): boolean {
  return obterLicencaInfo().estado === 'vencida'
}
