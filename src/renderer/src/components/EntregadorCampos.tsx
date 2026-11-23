import type { ReactNode } from 'react'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { TelefoneInput } from '@renderer/components/ui/TelefoneInput'

interface Props {
  nome: string
  contato: string
  onNome: (v: string) => void
  /** So os digitos. */
  onContato: (digitos: string) => void
}

/** Quem leva a armacao ao laboratorio: nome e telefone, sem cadastro proprio (ficam gravados na OS). */
export function EntregadorCampos({ nome, contato, onNome, onContato }: Props): ReactNode {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Entregador" hint="Quem leva a armação ao laboratório.">
        <Input value={nome} onChange={(e) => onNome(e.target.value)} maxLength={80} aria-label="Nome do entregador" />
      </Field>
      <Field label="Contato do entregador">
        <TelefoneInput value={contato} onChange={onContato} aria-label="Contato do entregador" />
      </Field>
    </div>
  )
}
