import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ShoppingCart } from 'lucide-react'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { Button } from '@renderer/components/ui/Button'
import { ClienteBuscaInput } from '@renderer/components/ClienteBuscaInput'
import { ProdutoBuscaInput } from '@renderer/components/ProdutoBuscaInput'
import { AuthorizeAdminDialog } from '@renderer/components/AuthorizeAdminDialog'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { centavosParaBRL, centavosParaTexto, textoParaCentavos } from '@renderer/lib/dinheiro'
import { vendaCreateSchema, type CredencialAdminInput } from '@shared/ipc'
import { toast } from '@renderer/state/toastStore'
import type { ClienteResumo, Produto } from '@shared/types'

interface LinhaItem {
  chave: string
  produtoId: number
  descricao: string
  quantidadeTexto: string
  precoUnitarioTexto: string
  descontoTexto: string
}

interface LinhaPagamento {
  chave: string
  formaPagamento: string
  valorTexto: string
  parcelas: string
}

interface Props {
  open: boolean
  onClose: () => void
  clienteFixo?: ClienteResumo
  onCreated?: (vendaId: number) => void
}

export function VendaFormDialog({ open, onClose, clienteFixo, onCreated }: Props): ReactNode {
  const queryClient = useQueryClient()
  const [cliente, setCliente] = useState<ClienteResumo | null>(clienteFixo ?? null)
  const [itens, setItens] = useState<LinhaItem[]>([])
  const [pagamentos, setPagamentos] = useState<LinhaPagamento[]>([])
  const [receitaOpticaId, setReceitaOpticaId] = useState('')
  const [ordemServicoId, setOrdemServicoId] = useState('')
  const [descontoAdicionalTexto, setDescontoAdicionalTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [motivoAutorizacao, setMotivoAutorizacao] = useState<string | null>(null)
  const [erroAutorizacao, setErroAutorizacao] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setCliente(clienteFixo ?? null)
      setItens([])
      setPagamentos([])
      setReceitaOpticaId('')
      setOrdemServicoId('')
      setDescontoAdicionalTexto('')
      setErro(null)
      setMotivoAutorizacao(null)
      setErroAutorizacao(null)
    }
  }, [open, clienteFixo])

  const receitas = useQuery({
    queryKey: ['receitas', cliente?.id],
    queryFn: () => unwrap(window.api.receitas.listByCliente({ clienteId: cliente!.id })),
    enabled: Boolean(cliente)
  })
  const ordensServico = useQuery({
    queryKey: ['ordensServico', 'cliente', cliente?.id],
    queryFn: () => unwrap(window.api.ordensServico.listByCliente({ clienteId: cliente!.id })),
    enabled: Boolean(cliente)
  })
  const formasPagamento = useQuery({
    queryKey: ['listaValor', 'forma_pagamento'],
    queryFn: () => unwrap(window.api.listasValor.listByTipo({ tipo: 'forma_pagamento' })),
    enabled: open
  })

  function adicionarItem(produto: Produto): void {
    setItens((atual) => [
      ...atual,
      {
        chave: `${produto.id}-${Date.now()}`,
        produtoId: produto.id,
        descricao: produto.descricao,
        quantidadeTexto: '1',
        precoUnitarioTexto: centavosParaTexto(produto.precoVendaCentavos),
        descontoTexto: '0'
      }
    ])
  }

  function atualizarItem(chave: string, campo: keyof LinhaItem, valor: string): void {
    setItens((atual) => atual.map((it) => (it.chave === chave ? { ...it, [campo]: valor } : it)))
  }

  function removerItem(chave: string): void {
    setItens((atual) => atual.filter((it) => it.chave !== chave))
  }

  // Totais calculados ao vivo - o backend recalcula tudo de novo e e quem
  // manda de verdade, isto e so para a pessoa ver o que esta montando.
  const subtotalCentavos = useMemo(
    () =>
      itens.reduce(
        (soma, it) => soma + Math.round(Number(it.quantidadeTexto || '0')) * textoParaCentavos(it.precoUnitarioTexto),
        0
      ),
    [itens]
  )
  const descontoItensCentavos = useMemo(
    () => itens.reduce((soma, it) => soma + textoParaCentavos(it.descontoTexto), 0),
    [itens]
  )
  const descontoAdicionalCentavos = textoParaCentavos(descontoAdicionalTexto)
  const descontoTotalCentavos = descontoItensCentavos + descontoAdicionalCentavos
  const totalCentavos = subtotalCentavos - descontoTotalCentavos
  const somaPagamentosCentavos = useMemo(
    () => pagamentos.reduce((soma, p) => soma + textoParaCentavos(p.valorTexto), 0),
    [pagamentos]
  )
  const restanteCentavos = totalCentavos - somaPagamentosCentavos

  function adicionarPagamento(): void {
    setPagamentos((atual) => [
      ...atual,
      {
        chave: `pg-${Date.now()}`,
        formaPagamento: formasPagamento.data?.[0]?.valor ?? '',
        valorTexto: centavosParaTexto(Math.max(restanteCentavos, 0)),
        parcelas: '1'
      }
    ])
  }

  function atualizarPagamento(chave: string, campo: keyof LinhaPagamento, valor: string): void {
    setPagamentos((atual) => atual.map((p) => (p.chave === chave ? { ...p, [campo]: valor } : p)))
  }

  function removerPagamento(chave: string): void {
    setPagamentos((atual) => atual.filter((p) => p.chave !== chave))
  }

  function montarPayload(credencial: CredencialAdminInput | null) {
    return vendaCreateSchema.parse({
      clienteId: cliente!.id,
      receitaOpticaId: receitaOpticaId ? Number(receitaOpticaId) : null,
      ordemServicoId: ordemServicoId ? Number(ordemServicoId) : null,
      descontoAdicionalCentavos: descontoAdicionalTexto || '0',
      itens: itens.map((it) => ({
        produtoId: it.produtoId,
        quantidade: Number(it.quantidadeTexto || '0'),
        precoUnitarioCentavos: it.precoUnitarioTexto || '0',
        descontoCentavos: it.descontoTexto || '0'
      })),
      pagamentos: pagamentos.map((p) => ({
        formaPagamento: p.formaPagamento,
        valorCentavos: p.valorTexto || '0',
        parcelas: Number(p.parcelas || '1')
      })),
      autorizacaoAdmin: credencial
    })
  }

  const mutation = useMutation({
    mutationFn: async (credencial: CredencialAdminInput | null) => {
      if (!cliente) throw new Error('Selecione o cliente.')
      return unwrap(window.api.vendas.create(montarPayload(credencial)))
    },
    onSuccess: (venda) => {
      queryClient.invalidateQueries({ queryKey: ['vendas'] })
      queryClient.invalidateQueries({ queryKey: ['produtos'] })
      queryClient.invalidateQueries({ queryKey: ['ordensServico'] })
      toast.ok(`Venda ${venda.numero} concluída.`)
      onCreated?.(venda.id)
      onClose()
    },
    onError: (err) => {
      const mensagem = err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.'

      if (err instanceof ApiCallError && err.code === 'AUTORIZACAO_ADMIN_NECESSARIA') {
        setMotivoAutorizacao(mensagem)
        return
      }
      // O dialogo de autorizacao ainda esta aberto e cobre o formulario -
      // se o erro veio de uma tentativa de autorizar (credencial errada),
      // ele tem que aparecer LA, nao aqui embaixo, escondido.
      if (motivoAutorizacao !== null) {
        setErroAutorizacao(mensagem)
        return
      }
      setErro(mensagem)
    }
  })

  const podeSubmeter = Boolean(cliente) && itens.length > 0 && pagamentos.length > 0 && restanteCentavos === 0

  return (
    <Dialog open={open} onClose={onClose} title="Nova venda" className="max-w-3xl">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          setErro(null)
          mutation.mutate(null)
        }}
      >
        <Field label="Cliente" required>
          {clienteFixo ? (
            <div className="rounded-md border border-[var(--rule-strong)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)]">
              {clienteFixo.nome}
            </div>
          ) : (
            <ClienteBuscaInput selecionado={cliente} onSelecionar={setCliente} />
          )}
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Receita óptica vinculada" hint="Opcional">
            <Select value={receitaOpticaId} onChange={(e) => setReceitaOpticaId(e.target.value)} disabled={!cliente}>
              <option value="">— nenhuma —</option>
              {receitas.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.dataExame.split('-').reverse().join('/')} · {r.tipoLente ?? 'sem tipo'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ordem de Serviço vinculada" hint="Opcional">
            <Select value={ordemServicoId} onChange={(e) => setOrdemServicoId(e.target.value)} disabled={!cliente}>
              <option value="">— nenhuma —</option>
              {ordensServico.data?.map((os) => (
                <option key={os.id} value={os.id}>
                  {os.numero} · {os.situacao}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">Itens</p>
          <ProdutoBuscaInput onSelecionar={adicionarItem} />

          {itens.length > 0 && (
            <div className="overflow-hidden rounded-md border border-[var(--rule)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-xs text-[var(--ink-3)]">
                    <th className="px-2 py-1.5 text-left">Produto</th>
                    <th className="w-16 px-2 py-1.5">Qtd</th>
                    <th className="w-24 px-2 py-1.5">Preço un.</th>
                    <th className="w-24 px-2 py-1.5">Desconto</th>
                    <th className="w-24 px-2 py-1.5 text-right">Total</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((it) => {
                    const totalItem =
                      Math.round(Number(it.quantidadeTexto || '0')) * textoParaCentavos(it.precoUnitarioTexto) -
                      textoParaCentavos(it.descontoTexto)
                    return (
                      <tr key={it.chave} className="border-b border-[var(--rule)] last:border-0">
                        <td className="px-2 py-1.5 text-[var(--ink)]">{it.descricao}</td>
                        <td className="px-1 py-1">
                          <Input
                            className="text-center font-mono-tab"
                            value={it.quantidadeTexto}
                            onChange={(e) => atualizarItem(it.chave, 'quantidadeTexto', e.target.value)}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            className="text-center font-mono-tab"
                            value={it.precoUnitarioTexto}
                            onChange={(e) => atualizarItem(it.chave, 'precoUnitarioTexto', e.target.value)}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            className="text-center font-mono-tab"
                            value={it.descontoTexto}
                            onChange={(e) => atualizarItem(it.chave, 'descontoTexto', e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono-tab text-[var(--ink)]">
                          {centavosParaBRL(totalItem)}
                        </td>
                        <td className="px-1 py-1">
                          <button
                            type="button"
                            onClick={() => removerItem(it.chave)}
                            className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--danger-wash)] hover:text-[var(--danger)]"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-md border border-[var(--rule)] p-3">
          <Field label="Desconto adicional (R$)" hint="Além do desconto já aplicado item a item, se houver." className="max-w-[220px]">
            <Input
              className="font-mono-tab"
              value={descontoAdicionalTexto}
              onChange={(e) => setDescontoAdicionalTexto(e.target.value)}
              placeholder="0,00"
            />
          </Field>

          <div className="grid grid-cols-3 gap-4 border-t border-[var(--rule)] pt-3 text-sm">
            <div>
              <p className="text-xs text-[var(--ink-3)]">Subtotal</p>
              <p className="font-mono-tab text-[var(--ink)]">{centavosParaBRL(subtotalCentavos)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--ink-3)]">Desconto total</p>
              <p className="font-mono-tab text-[var(--ink)]">{centavosParaBRL(descontoTotalCentavos)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--ink-3)]">Total da venda</p>
              <p className="font-mono-tab text-base font-semibold text-[var(--accent)]">
                {centavosParaBRL(totalCentavos)}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">Pagamento</p>
            <Button type="button" variant="secondary" size="sm" onClick={adicionarPagamento}>
              <Plus className="size-3.5" /> Forma de pagamento
            </Button>
          </div>

          {pagamentos.length > 0 && (
            <div className="overflow-hidden rounded-md border border-[var(--rule)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-xs text-[var(--ink-3)]">
                    <th className="px-2 py-1.5 text-left">Forma</th>
                    <th className="w-32 px-2 py-1.5">Valor total (R$)</th>
                    <th className="px-2 py-1.5">Parcelas</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {pagamentos.map((p) => {
                    const numParcelas = Math.max(1, Number(p.parcelas || '1'))
                    const valorTotalPagamento = textoParaCentavos(p.valorTexto)
                    const valorPorParcela = numParcelas > 1 ? Math.round(valorTotalPagamento / numParcelas) : null

                    return (
                      <tr key={p.chave} className="border-b border-[var(--rule)] last:border-0">
                        <td className="px-2 py-1.5">
                          <Select
                            value={p.formaPagamento}
                            onChange={(e) => atualizarPagamento(p.chave, 'formaPagamento', e.target.value)}
                          >
                            {formasPagamento.data?.map((f) => (
                              <option key={f.id} value={f.valor}>
                                {f.valor}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            className="text-center font-mono-tab"
                            value={p.valorTexto}
                            onChange={(e) => atualizarPagamento(p.chave, 'valorTexto', e.target.value)}
                            placeholder="0,00"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center justify-center gap-1.5">
                            <Input
                              className="w-14 text-center font-mono-tab"
                              value={p.parcelas}
                              onChange={(e) => atualizarPagamento(p.chave, 'parcelas', e.target.value)}
                            />
                            <span className="text-xs text-[var(--ink-3)]">x</span>
                            {valorPorParcela !== null && (
                              <span className="whitespace-nowrap font-mono-tab text-xs text-[var(--ink-3)]">
                                de {centavosParaBRL(valorPorParcela)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-1 py-1">
                          <button
                            type="button"
                            onClick={() => removerPagamento(p.chave)}
                            className="rounded p-1 text-[var(--ink-3)] hover:bg-[var(--danger-wash)] hover:text-[var(--danger)]"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {pagamentos.length > 0 && restanteCentavos !== 0 && (
            <p className={restanteCentavos > 0 ? 'text-sm text-[var(--warn)]' : 'text-sm text-[var(--danger)]'}>
              {restanteCentavos > 0
                ? `Falta alocar ${centavosParaBRL(restanteCentavos)}.`
                : `Pagamentos excedem o total em ${centavosParaBRL(-restanteCentavos)}.`}
            </p>
          )}
        </div>

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex justify-end gap-2 border-t border-[var(--rule)] pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={!podeSubmeter}>
            <ShoppingCart className="size-4" /> Concluir venda
          </Button>
        </div>
      </form>

      <AuthorizeAdminDialog
        open={motivoAutorizacao !== null}
        motivo={motivoAutorizacao ?? ''}
        erro={erroAutorizacao}
        loading={mutation.isPending}
        onClose={() => {
          setMotivoAutorizacao(null)
          setErroAutorizacao(null)
        }}
        onConfirm={(credencial) => {
          setErroAutorizacao(null)
          mutation.mutate(credencial)
        }}
      />
    </Dialog>
  )
}
