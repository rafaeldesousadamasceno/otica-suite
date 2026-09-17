import { type ReactNode, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleDollarSign } from 'lucide-react'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { centavosParaBRL, centavosParaTexto, textoParaCentavos } from '@renderer/lib/dinheiro'
import { toast } from '@renderer/state/toastStore'
import type { ContaPagar } from '@shared/types'

interface Props {
  conta: ContaPagar | null
  onClose: () => void
}

/** RF-11.2: baixa (total ou parcial) de uma conta a pagar em aberto. */
export function PagarContaDialog({ conta, onClose }: Props): ReactNode {
  const queryClient = useQueryClient()
  const [valorTexto, setValorTexto] = useState('')
  const [data, setData] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const restanteCentavos = conta ? conta.valorCentavos - conta.valorPagoCentavos : 0

  const formasPagamento = useQuery({
    queryKey: ['listaValor', 'forma_pagamento'],
    queryFn: () => unwrap(window.api.listasValor.listByTipo({ tipo: 'forma_pagamento' })),
    enabled: conta !== null
  })

  useEffect(() => {
    if (conta) {
      setValorTexto(centavosParaTexto(conta.valorCentavos - conta.valorPagoCentavos))
      setData(new Date().toISOString().slice(0, 10))
      setErro(null)
    }
  }, [conta])

  useEffect(() => {
    if (formasPagamento.data?.[0] && !formaPagamento) {
      setFormaPagamento(formasPagamento.data[0].valor)
    }
  }, [formasPagamento.data, formaPagamento])

  const mutation = useMutation({
    mutationFn: () =>
      unwrap(
        window.api.contasPagar.pagar({
          id: conta!.id,
          valorCentavos: textoParaCentavos(valorTexto),
          data,
          formaPagamento
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contasPagar'] })
      toast.ok('Conta paga.')
      onClose()
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  if (!conta) return null

  const valorCentavos = textoParaCentavos(valorTexto)
  const podeSubmeter = valorCentavos > 0 && valorCentavos <= restanteCentavos && Boolean(formaPagamento) && Boolean(data)

  return (
    <Dialog open onClose={onClose} title={`Pagar - ${conta.descricao}`} className="max-w-sm">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          setErro(null)
          mutation.mutate()
        }}
      >
        <p className="text-sm text-[var(--ink-2)]">
          {conta.fornecedorNome ? `${conta.fornecedorNome} · ` : ''}
          Restante: <span className="font-mono-tab text-[var(--ink)]">{centavosParaBRL(restanteCentavos)}</span>
        </p>

        <Field label="Valor pago (R$)" required>
          <Input className="font-mono-tab" value={valorTexto} onChange={(e) => setValorTexto(e.target.value)} autoFocus />
        </Field>
        <Field label="Data do pagamento" required>
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </Field>
        <Field label="Forma de pagamento" required>
          <Select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
            {formasPagamento.data?.map((f) => (
              <option key={f.id} value={f.valor}>
                {f.valor}
              </option>
            ))}
          </Select>
        </Field>

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={!podeSubmeter}>
            <CircleDollarSign className="size-4" /> Confirmar pagamento
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
