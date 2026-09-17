import { type ReactNode, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { contaPagarCriarSchema } from '@shared/ipc'
import { toast } from '@renderer/state/toastStore'

interface Props {
  open: boolean
  onClose: () => void
}

/** RF-11.2: lancamento manual de despesa (aluguel, energia, salarios…), com opcao de repeticao mensal. */
export function ContaPagarFormDialog({ open, onClose }: Props): ReactNode {
  const queryClient = useQueryClient()
  const [descricao, setDescricao] = useState('')
  const [categoria, setCategoria] = useState('')
  const [valorTexto, setValorTexto] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [recorrente, setRecorrente] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const categorias = useQuery({
    queryKey: ['listaValor', 'categoria_despesa'],
    queryFn: () => unwrap(window.api.listasValor.listByTipo({ tipo: 'categoria_despesa' })),
    enabled: open
  })

  useEffect(() => {
    if (open) {
      setDescricao('')
      setCategoria('')
      setValorTexto('')
      setVencimento('')
      setRecorrente(false)
      setErro(null)
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: () =>
      unwrap(
        window.api.contasPagar.criar(
          contaPagarCriarSchema.parse({ descricao, categoria, valorCentavos: valorTexto || '0', vencimento, recorrente })
        )
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contasPagar'] })
      toast.ok('Conta a pagar lançada.')
      onClose()
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  return (
    <Dialog open={open} onClose={onClose} title="Nova conta a pagar" className="max-w-md">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          setErro(null)
          mutation.mutate()
        }}
      >
        <Field label="Descrição" required>
          <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} autoFocus required />
        </Field>
        <Field label="Categoria">
          <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">— sem categoria —</option>
            {categorias.data?.map((c) => (
              <option key={c.id} value={c.valor}>
                {c.valor}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (R$)" required>
            <Input className="font-mono-tab" value={valorTexto} onChange={(e) => setValorTexto(e.target.value)} placeholder="0,00" />
          </Field>
          <Field label="Vencimento" required>
            <Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
          <input type="checkbox" checked={recorrente} onChange={(e) => setRecorrente(e.target.checked)} />
          Despesa recorrente (gera a próxima ocorrência automaticamente ao pagar)
        </label>

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex justify-end gap-2 border-t border-[var(--rule)] pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={!descricao.trim() || !valorTexto || !vencimento}>
            Lançar conta
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
