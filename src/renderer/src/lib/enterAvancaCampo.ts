import type { KeyboardEvent } from 'react'

const CAMPOS = 'input, select, textarea, button[type="submit"]'

function utilizavel(el: HTMLElement): boolean {
  if ((el as HTMLInputElement).disabled || el.tabIndex < 0) return false
  if (el instanceof HTMLInputElement && (el.type === 'hidden' || el.type === 'checkbox' || el.type === 'radio')) return false
  return el.offsetParent !== null
}

/**
 * Para formularios em que salvar sem querer e um problema (ex.: receita
 * optica): o Enter dentro de um campo passa para o PROXIMO campo, em vez de
 * enviar o formulario. Salvar fica so no botao (ou Tab ate ele e Enter).
 *
 * Uso: `<form onKeyDown={enterAvancaCampo}>`. Nao mexe no Enter de textarea
 * (quebra de linha) nem de botao (ativar o botao).
 */
export function enterAvancaCampo(e: KeyboardEvent<HTMLFormElement>): void {
  if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
  const alvo = e.target
  if (!(alvo instanceof HTMLInputElement || alvo instanceof HTMLSelectElement)) return
  if (alvo instanceof HTMLInputElement && (alvo.type === 'submit' || alvo.type === 'button')) return

  e.preventDefault()
  const campos = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(CAMPOS)).filter(utilizavel)
  // O primeiro campo que vem DEPOIS do atual na ordem da tela (funciona tambem
  // quando o atual e um checkbox, que nao esta na lista de campos de texto).
  const proximo = campos.find((c) => alvo.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING)
  proximo?.focus()
  if (proximo instanceof HTMLInputElement) proximo.select()
}
