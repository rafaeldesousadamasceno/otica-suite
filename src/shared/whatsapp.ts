import type { MotivoContato } from './types'

/**
 * Celular brasileiro -> "55" + DDD + numero (so digitos), ou null se nao da
 * para abrir o WhatsApp com ele. Aceita com/sem DDI, mascara e "0" de operadora
 * antes do DDD (so no formato sem ambiguidade). Fixo (comeca com 2-5) nao tem WhatsApp comum; numero antigo de 8
 * digitos que comeca com 6-9 ganha o "9" da frente.
 */
export function normalizarCelularBR(texto: string | null | undefined): string | null {
  if (!texto) return null
  let digitos = texto.replace(/\D/g, '')
  // Nenhum DDD comeca com 0, entao um 0 na frente e prefixo de operadora ("011 98765-4321"). So aceito no
  // formato inequivoco (0 + DDD + 9 digitos): em "(09) 98765-4321" tirar o 0 faria o "9" virar o DDD 99 e
  // a mensagem iria para OUTRA pessoa - na duvida, devolve null e o cadastro e corrigido.
  if (digitos.startsWith('0')) {
    if (digitos.length !== 12) return null
    digitos = digitos.slice(1)
  }
  if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) digitos = digitos.slice(2)

  if (digitos.length !== 10 && digitos.length !== 11) return null
  const ddd = Number(digitos.slice(0, 2))
  if (ddd < 11 || ddd > 99) return null

  let assinante = digitos.slice(2)
  if (assinante.length === 8) {
    if (!/^[6-9]/.test(assinante)) return null
    assinante = `9${assinante}`
  }
  if (!assinante.startsWith('9')) return null

  return `55${digitos.slice(0, 2)}${assinante}`
}

/** "MARIA DAS DORES" -> "Maria" (a mensagem fala com a pessoa pelo primeiro nome). */
export function primeiroNome(nomeCompleto: string): string {
  const primeiro = nomeCompleto.trim().split(/\s+/)[0] ?? ''
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase()
}

/**
 * Troca {chave} pelo valor. Placeholder desconhecido fica como esta de
 * proposito: o Administrador ve o erro de digitacao na propria mensagem em
 * vez de o texto sair silenciosamente com um buraco.
 */
export function preencherModelo(modelo: string, variaveis: Record<string, string>): string {
  return modelo.replace(/\{(\w+)\}/g, (inteiro, chave: string) => variaveis[chave] ?? inteiro)
}

export function montarLinkWhatsapp(numeroNormalizado: string, mensagem: string): string {
  return `https://wa.me/${numeroNormalizado}?text=${encodeURIComponent(mensagem)}`
}

/** Placeholders que cada mensagem sabe preencher - a tela de edicao mostra estes. */
export const PLACEHOLDERS_POR_MOTIVO: Record<MotivoContato, string[]> = {
  RETIRADA: ['{nome}', '{otica}', '{numero_os}'],
  COBRANCA: ['{nome}', '{otica}', '{valor}', '{vencimento}'],
  ANIVERSARIO: ['{nome}', '{otica}'],
  POS_VENDA: ['{nome}', '{otica}', '{numero_os}'],
  RENOVACAO: ['{nome}', '{otica}']
}
