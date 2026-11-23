import { type KeyboardEvent, type ReactNode, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { CHAVE_UNIDADES_MEDIDA } from '@renderer/lib/unidadesMedida'
import { toast } from '@renderer/state/toastStore'
import type { UnidadeMedida } from '@shared/types'

interface Props {
  onCriada: (unidade: UnidadeMedida) => void
  onCancelar?: () => void
  autoFocus?: boolean
}

/**
 * Sigla + descricao de uma unidade nova. Nao e um <form>: tambem aparece dentro
 * do formulario do produto, e Enter aqui cadastra a unidade em vez de pular de
 * campo ou salvar o produto.
 */
export function NovaUnidadeMedidaForm({ onCriada, onCancelar, autoFocus }: Props): ReactNode {
  const [sigla, setSigla] = useState('')
  const [descricao, setDescricao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    // A validacao fica no main, que devolve a mensagem pronta.
    mutationFn: () => unwrap(window.api.unidadesMedida.create({ sigla, descricao })),
    onSuccess: (unidade) => {
      queryClient.invalidateQueries({ queryKey: CHAVE_UNIDADES_MEDIDA })
      toast.ok(`Unidade ${unidade.sigla} cadastrada.`)
      setSigla('')
      setDescricao('')
      setErro(null)
      onCriada(unidade)
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return
    e.preventDefault()
    e.stopPropagation()
    if (!mutation.isPending) mutation.mutate()
  }

  return (
    <div className="flex flex-col gap-2" onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Sigla" className="w-24">
          <Input
            value={sigla}
            onChange={(e) => setSigla(e.target.value.toLocaleUpperCase('pt-BR'))}
            maxLength={6}
            placeholder="FR"
            autoFocus={autoFocus}
          />
        </Field>
        <Field label="Descrição" className="min-w-40 flex-1">
          <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={30} placeholder="Frasco" />
        </Field>
        <Button type="button" className="h-9" loading={mutation.isPending} onClick={() => mutation.mutate()}>
          Cadastrar
        </Button>
        {onCancelar && (
          <Button type="button" variant="ghost" className="h-9" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
      </div>
      {erro && <p className="text-xs text-[var(--danger)]">{erro}</p>}
    </div>
  )
}
