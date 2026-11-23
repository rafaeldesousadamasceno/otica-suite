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
import type { ContaReceber } from '@shared/types'
import { hojeLocal } from '@shared/data'
import { comportamentoDoTipo } from '@shared/vendaCalculo'
import { enterAvancaCampo } from '@renderer/lib/enterAvancaCampo'

interface Props {
  conta: ContaReceber | null
  onClose: () => void
}

/** RF-11.1: baixa (total ou parcial) de uma parcela em aberto. */
export function BaixaParcelaDialog({ conta, onClose }: Props): ReactNode {
  const queryClient = useQueryClient()
  const [valorTexto, setValorTexto] = useState('')
  const [data, setData] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const restanteCentavos = conta ? conta.valorCentavos - conta.valorRecebidoCentavos : 0

  // Como o dinheiro entrou: as formas ATIVAS do cadastro, menos as que parcelam (promissoria, boleto, cheque).
  const formasQuery = useQuery({
    queryKey: ['formasPagamento', { ativas: true }],
    queryFn: () => unwrap(window.api.formasPagamento.list({ apenasAtivos: true })),
    enabled: conta !== null
  })
  const formasPagamento = {
    data: formasQuery.data
      ?.filter((f) => comportamentoDoTipo(f.tipo) !== 'PARCELADO_CLIENTE')
      .map((f) => ({ id: f.id, valor: f.nome, tipo: f.tipo }))
  }

  useEffect(() => {
    if (conta) {
      setValorTexto(centavosParaTexto(conta.valorCentavos - conta.valorRecebidoCentavos))
      setData(hojeLocal())
      setErro(null)
    }
  }, [conta])

  useEffect(() => {
    if (formasPagamento.data?.[0] && !formaPagamento) {
      // O deposito da operadora costuma chegar por transferencia; o resto comeca na primeira forma da lista.
      const padrao = conta?.tipo === 'OPERADORA' ? formasPagamento.data.find((f) => f.tipo === 'TRANSFERENCIA') : undefined
      setFormaPagamento((padrao ?? formasPagamento.data[0]).valor)
    }
  }, [formasPagamento.data, formaPagamento, conta?.tipo])

  const mutation = useMutation({
    mutationFn: () =>
      unwrap(
        window.api.contasReceber.baixar({
          id: conta!.id,
          valorCentavos: textoParaCentavos(valorTexto),
          data,
          formaPagamento
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contasReceber'] })
      queryClient.invalidateQueries({ queryKey: ['venda'] })
      queryClient.invalidateQueries({ queryKey: ['vendas'] })
      toast.ok('Parcela baixada.')
      onClose()
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  if (!conta) return null

  const valorCentavos = textoParaCentavos(valorTexto)
  const podeSubmeter = valorCentavos > 0 && valorCentavos <= restanteCentavos && Boolean(formaPagamento) && Boolean(data)

  return (
    <Dialog
      open
      onClose={onClose}
      title={conta.tipo === 'OPERADORA' ? 'Baixar depósito da operadora' : `Baixar parcela ${conta.parcela}/${conta.totalParcelas}`}
      className="max-w-sm"
    >
      <form
        // Enter só passa para o próximo campo: o formulário só envia pelo botão.
        onKeyDown={enterAvancaCampo}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          setErro(null)
          mutation.mutate()
        }}
      >
        <p className="text-sm text-[var(--ink-2)]">
          Venda {conta.vendaNumero} · {conta.clienteNome}
          {conta.tipo === 'OPERADORA' && (
            <>
              <br />
              {conta.bandeiraNome} em {conta.operadoraParcelas}x (valor líquido, já sem a taxa)
            </>
          )}
          <br />
          Restante: <span className="font-mono-tab text-[var(--ink)]">{centavosParaBRL(restanteCentavos)}</span>
        </p>

        <Field label="Valor recebido (R$)" required>
          <Input className="font-mono-tab" value={valorTexto} onChange={(e) => setValorTexto(e.target.value)} autoFocus />
        </Field>
        <Field label="Data do recebimento" required>
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </Field>
        <Field label="Forma de recebimento" required>
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
            <CircleDollarSign className="size-4" /> Confirmar baixa
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
