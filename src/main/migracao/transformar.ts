import type { SituacaoOS } from '@shared/types'

// PRD secao 11: valores-sentinela que o sistema anterior usava como "sem dado".
const DATA_SENTINELA = '1111-11-11'
const CPF_SENTINELA = '888.888.888-88'
const CELULAR_SENTINELA = '(85)91234-1234'

const SITUACOES_OS_ORIGEM = new Set(['EM ABERTO', 'LABORATÓRIO', 'ENTREGUE'])

/** PRD 11: "Campos em CAIXA ALTA -> Capitalização de Nome Próprio". Sem regra de preposicao (de/da/dos) - so title case simples. */
export function normalizarNomeProprio(texto: string): string {
  return texto
    .trim()
    .toLocaleLowerCase('pt-BR')
    .split(/\s+/)
    .filter(Boolean)
    .map((palavra) => palavra.charAt(0).toLocaleUpperCase('pt-BR') + palavra.slice(1))
    .join(' ')
}

export function dataOuNull(valor: string | null | undefined): string | null {
  const v = valor?.trim()
  if (!v || v === DATA_SENTINELA) return null
  return v
}

export function cpfOuNull(valor: string | null | undefined): string | null {
  const v = valor?.trim()
  if (!v || v === CPF_SENTINELA) return null
  return v
}

export function celularOuNull(valor: string | null | undefined): string | null {
  const v = valor?.trim()
  if (!v || v === CELULAR_SENTINELA) return null
  return v
}

/** Colunas DECIMAL do mysql2 vem como string (evita perda de precisao); INT vem como number. Aceita os dois. */
export function paraNumero(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined) return null
  const n = typeof valor === 'number' ? valor : Number(valor)
  return Number.isFinite(n) ? n : null
}

export function paraCentavos(valor: string | number | null | undefined): number {
  const n = paraNumero(valor)
  return n === null ? 0 : Math.round(n * 100)
}

/**
 * RF-06: o sistema anterior so tinha 3 estados (sem o "CHEGOU" que o RN-04
 * novo introduz) - mapeamento direto; qualquer coisa fora disso (nulo,
 * digitado errado) cai em EM ABERTO, nunca quebra a importacao por causa
 * de um valor de situacao inesperado.
 */
export function mapearSituacaoOS(valor: string | null | undefined): SituacaoOS {
  const v = valor?.trim().toUpperCase()
  return v && SITUACOES_OS_ORIGEM.has(v) ? (v as SituacaoOS) : 'EM ABERTO'
}
