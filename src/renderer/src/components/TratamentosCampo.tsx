import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'

interface Props {
  /** Opcoes ativas da lista de tratamentos de lente, na ordem da lista. */
  opcoes: string[]
  /** O que esta marcado. Pode ter valor que nao esta (mais) na lista: veio da importacao ou a opcao foi desativada. */
  selecionados: string[]
  onChange: (selecionados: string[]) => void
  /** Ainda carregando a lista: nao mostra "nenhum tratamento cadastrado" por engano. */
  carregando?: boolean
}

/**
 * Varios tratamentos por receita: uma caixinha por opcao, em vez de escolher so um.
 * Valor antigo fora da lista continua aparecendo marcado (e pode ser desmarcado);
 * sem isso ele sumiria da tela e salvar apagaria o que ja estava gravado.
 */
export function TratamentosCampo({ opcoes, selecionados, onChange, carregando }: Props): ReactNode {
  const foraDaLista = selecionados.filter((s) => !opcoes.includes(s))
  const todas = [...opcoes, ...foraDaLista]

  function alternar(valor: string): void {
    const marcado = selecionados.includes(valor)
    const novos = marcado ? selecionados.filter((s) => s !== valor) : [...selecionados, valor]
    // Sempre na ordem da lista: o texto gravado nao depende da ordem dos cliques.
    onChange(todas.filter((t) => novos.includes(t)))
  }

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium text-[var(--ink-2)]">Tratamentos</legend>
      {todas.length === 0 ? (
        <p className="text-xs text-[var(--ink-3)]">
          {carregando ? 'Carregando…' : 'Nenhum tratamento cadastrado.'}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {todas.map((t) => {
            const marcado = selecionados.includes(t)
            return (
              <label
                key={t}
                className={cn(
                  'flex cursor-pointer select-none items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
                  'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--accent)]',
                  marcado
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--ink)]'
                    : 'border-[var(--rule-strong)] text-[var(--ink-2)] hover:bg-[var(--surface-2)]'
                )}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  checked={marcado}
                  onChange={() => alternar(t)}
                />
                {t}
                {foraDaLista.includes(t) && <span className="text-xs text-[var(--ink-3)]">(fora da lista)</span>}
              </label>
            )
          })}
        </div>
      )}
    </fieldset>
  )
}
