import { type ReactNode, useId } from 'react'
import { cn } from '@renderer/lib/cn'

interface Props {
  legenda: string
  opcoes: string[]
  /** Valor escolhido (`''` = nenhum). Pode nao estar mais na lista: aparece marcado como "fora da lista". */
  valor: string
  onChange: (valor: string) => void
  carregando?: boolean
  vazio?: string
}

/**
 * Escolha unica em botoes: clicar no que esta marcado desmarca. Um valor que ja
 * estava gravado e saiu da lista continua aparecendo (senao sumiria da tela e
 * salvar o apagaria).
 */
export function EscolhaUnica({ legenda, opcoes, valor, onChange, carregando, vazio }: Props): ReactNode {
  const nome = useId()
  const foraDaLista = valor !== '' && !opcoes.includes(valor)
  const todas = foraDaLista ? [...opcoes, valor] : opcoes

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-sm font-medium text-[var(--ink-2)]">{legenda}</legend>
      {todas.length === 0 ? (
        <p className="text-xs text-[var(--ink-3)]">{carregando ? 'Carregando…' : (vazio ?? 'Nenhuma opção cadastrada.')}</p>
      ) : (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={legenda}>
          {todas.map((o) => {
            const marcado = valor === o
            return (
              <label
                key={o}
                className={cn(
                  'flex cursor-pointer select-none items-center rounded-md border px-3 py-1.5 text-sm transition-colors',
                  'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--accent)]',
                  marcado
                    ? 'border-[var(--accent)]! bg-[var(--accent)]/10 font-medium text-[var(--ink)]'
                    : 'border-[var(--rule-strong)] text-[var(--ink-2)] hover:bg-[var(--surface-2)]'
                )}
              >
                <input
                  type="radio"
                  name={nome}
                  className="sr-only"
                  checked={marcado}
                  onChange={() => onChange(o)}
                  // Clicar de novo no marcado limpa a escolha.
                  onClick={() => {
                    if (marcado) onChange('')
                  }}
                />
                {o}
                {foraDaLista && o === valor && <span className="ml-1.5 text-xs text-[var(--ink-3)]">(fora da lista)</span>}
              </label>
            )
          })}
        </div>
      )}
    </fieldset>
  )
}
