import { CARENCIA_DIAS } from '@shared/licenca'
import type { EstadoLicenca, LicencaInfo, MotivoChaveRecusada } from '@shared/types'
import type { LicencaPayload } from './chave'

// A carência também é usada pelo renderer (texto do banner), por isso mora em `shared`.
export { CARENCIA_DIAS }

/** Dias de avaliação a partir da primeira abertura (dia da abertura conta como o 1º). */
export const TESTE_DIAS = 14
/** Quantos dias antes do vencimento o aviso vermelho aparece (vale para qualquer plano). */
export const AVISO_DIAS = 10

const MS_DIA = 86_400_000

/** Diferença em dias inteiros (ate − de) entre duas datas YYYY-MM-DD. */
export function diasEntre(deIso: string, ateIso: string): number {
  return Math.round((Date.parse(`${ateIso}T00:00:00Z`) - Date.parse(`${deIso}T00:00:00Z`)) / MS_DIA)
}

/** A maior de duas datas YYYY-MM-DD (comparação lexicográfica é correta neste formato). */
export function maiorData(a: string, b: string | null | undefined): string {
  return b && b > a ? b : a
}

/** Data de hoje no fuso da máquina (não UTC: às 21h no Brasil o UTC já é "amanhã"). */
export function hojeLocalIso(agora: Date = new Date()): string {
  const mm = String(agora.getMonth() + 1).padStart(2, '0')
  const dd = String(agora.getDate()).padStart(2, '0')
  return `${agora.getFullYear()}-${mm}-${dd}`
}

export function estadoEhSomenteLeitura(estado: EstadoLicenca): boolean {
  return estado === 'teste_encerrado' || estado === 'vencida'
}

export interface EntradaEstado {
  /** "Hoje" já protegido contra relógio voltado (ver service.ts). */
  hoje: string
  /** Fingerprint desta máquina — já normalizado. */
  fingerprint: string
  /** Data da primeira abertura (início do teste). */
  inicioTeste: string
  /** Chave instalada, JÁ verificada (assinatura + fingerprint desta máquina), ou null. */
  licenca: LicencaPayload | null
  chaveRecusada: MotivoChaveRecusada | null
}

function montar(
  estado: EstadoLicenca,
  e: EntradaEstado,
  extra: Pick<LicencaInfo, 'cliente' | 'plano' | 'validade' | 'diasParaVencer'>
): LicencaInfo {
  return {
    estado,
    ...extra,
    fingerprint: e.fingerprint,
    chaveRecusada: e.chaveRecusada,
    somenteLeitura: estadoEhSomenteLeitura(estado)
  }
}

/**
 * Regra única de negócio da licença — pura (sem relógio, disco nem Electron),
 * para poder testar todas as bordas de data.
 */
export function calcularLicenca(e: EntradaEstado): LicencaInfo {
  const chave = e.licenca

  if (!chave) {
    const decorridos = Math.max(0, diasEntre(e.inicioTeste, e.hoje))
    const restantes = TESTE_DIAS - decorridos
    const base = { cliente: null, plano: null, validade: null }
    return restantes > 0
      ? montar('teste', e, { ...base, diasParaVencer: restantes })
      : montar('teste_encerrado', e, { ...base, diasParaVencer: 0 })
  }

  const dados = { cliente: chave.cliente, plano: chave.plano, validade: chave.validade }

  if (chave.validade === null) return montar('ativa', e, { ...dados, diasParaVencer: null })

  const dias = diasEntre(e.hoje, chave.validade)

  let estado: EstadoLicenca
  if (dias < -CARENCIA_DIAS) estado = 'vencida'
  else if (dias < 0) estado = 'carencia'
  else if (dias <= AVISO_DIAS) estado = 'proxima_vencimento'
  else estado = 'ativa'

  return montar(estado, e, { ...dados, diasParaVencer: dias })
}

/**
 * Uma chave nova só é aceita se AUMENTAR o prazo da instalada. Junto com a Central
 * (que emite cada renovação já encadeada — a validade nova = fim do período anterior
 * + o período pago), isso garante que o tempo é somado e que ninguém perde dias
 * cadastrando uma chave mais curta por engano. Sem validade = sem vencimento.
 */
export function estendeLicenca(
  atual: { validade: string | null } | null,
  nova: { validade: string | null }
): boolean {
  if (!atual) return true
  if (nova.validade === null) return atual.validade !== null
  if (atual.validade === null) return false
  return nova.validade > atual.validade
}
