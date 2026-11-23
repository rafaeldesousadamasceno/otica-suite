import { type ReactNode, useState } from 'react'
import { Input } from '@renderer/components/ui/Input'
import { cn } from '@renderer/lib/cn'
import { digitosTelefone, mascararTelefoneBr, telefoneValido } from '@shared/telefone'

interface Props {
  /** So os digitos (ex.: "85999998888"), que e o que se grava. */
  value: string
  onChange: (digitos: string) => void
  invalid?: boolean
  disabled?: boolean
  id?: string
  className?: string
  'aria-label'?: string
}

/**
 * Telefone com mascara (RG-05): celular "(85) 9 9999-8888" ou fixo
 * "(85) 3333-4444". A mascara e so da tela; quem usa recebe e guarda so os
 * digitos. Fica vermelho ao sair do campo se nao tiver 10 ou 11 digitos.
 */
export function TelefoneInput({ value, onChange, invalid, disabled, id, className, 'aria-label': ariaLabel }: Props): ReactNode {
  const [saiu, setSaiu] = useState(false)
  const incompleto = saiu && !telefoneValido(value)

  return (
    <div className="flex flex-col gap-1">
      <Input
        id={id}
        aria-label={ariaLabel}
        type="tel"
        inputMode="tel"
        autoComplete="off"
        disabled={disabled}
        // "!" porque o border-color global do index.css vence a cor de borda do Tailwind (ver nota no DioptriaInput).
        className={cn(className, (invalid || incompleto) && 'border-[var(--danger)]!')}
        placeholder="(00) 0 0000-0000"
        value={mascararTelefoneBr(value)}
        onChange={(e) => onChange(digitosTelefone(e.target.value))}
        onBlur={() => setSaiu(true)}
      />
      {incompleto && <p className="text-xs text-[var(--danger)]">Informe DDD e número: 10 ou 11 dígitos.</p>}
    </div>
  )
}
