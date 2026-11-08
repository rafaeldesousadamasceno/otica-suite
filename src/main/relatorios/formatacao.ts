import type { Empresa } from '@shared/types'

/** Formatacao de texto compartilhada por todos os relatorios (RF-12). */

export function formatarDataBr(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

export function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function texto(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '—'
  const s = String(valor)
  return s.trim() ? escapeHtml(s) : '—'
}

export function formatarMoeda(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Percentual com virgula: 48,5%. */
export function formatarPercentual(valor: number, casas = 1): string {
  return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`
}

export function montarFiltroPeriodo(dataInicio: string, dataFim: string): string {
  return `Período: ${formatarDataBr(dataInicio)} a ${formatarDataBr(dataFim)}`
}

/** "Rua das Flores, 120, Centro, Fortaleza/CE" - so as partes preenchidas. */
export function formatarEndereco(empresa: Empresa): string {
  const cidadeUf = [empresa.cidade, empresa.uf].filter((v): v is string => Boolean(v && v.trim())).join('/')
  return [empresa.logradouro, empresa.numero, empresa.bairro, cidadeUf]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(', ')
}

/** Telefone, WhatsApp e e-mail da otica, separados por ponto. */
export function formatarContatos(empresa: Empresa): string {
  return [empresa.telefone, empresa.whatsapp, empresa.email]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(' · ')
}
