import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Select } from '@renderer/components/ui/Select'
import { unwrap } from '@renderer/lib/ipc'

interface Props {
  /** Id do laboratorio escolhido, como texto (`''` = nenhum). */
  valor: string
  onChange: (valor: string) => void
  /** Laboratorio que a OS JA tem: continua aparecendo mesmo se foi inativado depois (RG-02). */
  atual?: { id: number; nome: string } | null
  disabled?: boolean
  'aria-label'?: string
}

/** Opcoes de laboratorio de uma OS: so os ativos, mais o que a OS ja usa. */
export function LaboratorioSelect({ valor, onChange, atual, disabled, 'aria-label': ariaLabel }: Props): ReactNode {
  const laboratorios = useQuery({
    queryKey: ['laboratorios', { apenasAtivos: true }],
    queryFn: () => unwrap(window.api.laboratorios.list({ apenasAtivos: true }))
  })
  const ativos = laboratorios.data ?? []
  const atualInativo = atual && !ativos.some((l) => l.id === atual.id) ? atual : null

  return (
    <Select value={valor} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label={ariaLabel}>
      <option value="">— nenhum —</option>
      {atualInativo && <option value={String(atualInativo.id)}>{atualInativo.nome} (inativo)</option>}
      {ativos.map((l) => (
        <option key={l.id} value={String(l.id)}>
          {l.nome}
        </option>
      ))}
    </Select>
  )
}
