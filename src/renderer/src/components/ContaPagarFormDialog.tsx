import { type ReactNode, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { contaPagarCriarSchema } from '@shared/ipc'
import { diaDeData, dataIsoValida, HORIZONTE_MESES } from '@shared/recorrencia'
import { toast } from '@renderer/state/toastStore'
import { enterAvancaCampo } from '@renderer/lib/enterAvancaCampo'
import type { FrequenciaRecorrencia } from '@shared/types'

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * RF-11.2: lancamento manual de despesa (aluguel, energia, salarios...). Marcada como recorrente, cria a
 * SERIE (primeiro vencimento, frequencia, fim opcional e valor) e o sistema mantem os proximos
 * 12 meses lancados, cada um com valor proprio.
 */
export function ContaPagarFormDialog({ open, onClose }: Props): ReactNode {
  const queryClient = useQueryClient()
  const [descricao, setDescricao] = useState('')
  const [categoria, setCategoria] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')
  const [valorTexto, setValorTexto] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [recorrente, setRecorrente] = useState(false)
  const [frequencia, setFrequencia] = useState<FrequenciaRecorrencia>('MENSAL')
  const [dataFim, setDataFim] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const categorias = useQuery({
    queryKey: ['listaValor', 'categoria_despesa'],
    queryFn: () => unwrap(window.api.listasValor.listByTipo({ tipo: 'categoria_despesa' })),
    enabled: open
  })

  const fornecedores = useQuery({
    queryKey: ['fornecedores', { apenasAtivos: true }],
    queryFn: () => unwrap(window.api.fornecedores.list({ apenasAtivos: true })),
    enabled: open
  })

  useEffect(() => {
    if (open) {
      setDescricao('')
      setCategoria('')
      setFornecedorId('')
      setValorTexto('')
      setVencimento('')
      setRecorrente(false)
      setFrequencia('MENSAL')
      setDataFim('')
      setErro(null)
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: () => {
      const entrada = contaPagarCriarSchema.safeParse({
        descricao,
        categoria,
        fornecedorId: fornecedorId ? Number(fornecedorId) : null,
        valorCentavos: valorTexto || '0',
        vencimento,
        recorrente,
        frequencia: recorrente ? frequencia : undefined,
        dataFim: recorrente ? dataFim : undefined
      })
      if (!entrada.success) throw new Error(entrada.error.issues[0]?.message ?? 'Confira os dados.')
      return unwrap(window.api.contasPagar.criar(entrada.data))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contasPagar'] })
      toast.ok(recorrente ? 'Despesa recorrente criada.' : 'Conta a pagar lançada.')
      onClose()
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  const dia = dataIsoValida(vencimento) ? diaDeData(vencimento) : null

  return (
    <Dialog open={open} onClose={onClose} title="Nova conta a pagar" className="max-w-md">
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
        <Field label="Descrição" required>
          <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} autoFocus required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
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
          <Field label="Fornecedor">
            <Select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
              <option value="">— nenhum —</option>
              {fornecedores.data?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.razaoSocial}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (R$)" required>
            <Input className="font-mono-tab" value={valorTexto} onChange={(e) => setValorTexto(e.target.value)} placeholder="0,00" />
          </Field>
          <Field label={recorrente ? 'Primeiro vencimento' : 'Vencimento'} required>
            <Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
          <input type="checkbox" checked={recorrente} onChange={(e) => setRecorrente(e.target.checked)} />
          Despesa recorrente (aluguel, energia, mensalidades…)
        </label>

        {recorrente && (
          <div className="flex flex-col gap-3 rounded-md border border-[var(--rule)] bg-[var(--surface-2)] p-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Frequência">
                <Select value={frequencia} onChange={(e) => setFrequencia(e.target.value as FrequenciaRecorrencia)}>
                  <option value="MENSAL">Mensal</option>
                  <option value="ANUAL">Anual</option>
                </Select>
              </Field>
              <Field label="Termina em" hint="Opcional: último vencimento.">
                <Input type="date" value={dataFim} min={vencimento || undefined} onChange={(e) => setDataFim(e.target.value)} />
              </Field>
            </div>
            <p className="text-xs text-[var(--ink-3)]">
              {dia !== null
                ? `Vence todo dia ${dia}${dia > 28 ? ' (em mês mais curto, no último dia)' : ''}. `
                : 'Escolha o primeiro vencimento: o dia dele vale para todos. '}
              O sistema mantém os próximos {HORIZONTE_MESES} meses lançados, cada conta com o seu valor. Depois dá para reajustar o valor ou encerrar a
              recorrência.
            </p>
          </div>
        )}

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex justify-end gap-2 border-t border-[var(--rule)] pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={!descricao.trim() || !valorTexto || !vencimento}>
            {recorrente ? 'Criar recorrência' : 'Lançar conta'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
