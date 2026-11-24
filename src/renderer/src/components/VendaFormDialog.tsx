import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ShoppingCart } from 'lucide-react'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { Button } from '@renderer/components/ui/Button'
import { PercentualInput } from '@renderer/components/ui/PercentualInput'
import { ClienteBuscaInput } from '@renderer/components/ClienteBuscaInput'
import { ProdutoBuscaInput } from '@renderer/components/ProdutoBuscaInput'
import { AuthorizeAdminDialog } from '@renderer/components/AuthorizeAdminDialog'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { centavosParaBRL, centavosParaTexto, textoParaCentavos } from '@renderer/lib/dinheiro'
import { validarOuErro } from '@renderer/lib/validar'
import { vendaCreateSchema, type CredencialAdminInput } from '@shared/ipc'
import { toast } from '@renderer/state/toastStore'
import { hojeLocal } from '@shared/data'
import { formatarBp } from '@shared/dinheiro'
import {
  calcularPagamento,
  calcularTotaisVenda,
  comportamentoDoTipo,
  descreverAcrescimo,
  liquidoEstimado,
  resumirPagamentos,
  type PagamentoCalculado,
  type TipoDesconto
} from '@shared/vendaCalculo'
import type { Bandeira, ClienteResumo, FormaPagamento, Produto } from '@shared/types'
import { enterAvancaCampo } from '@renderer/lib/enterAvancaCampo'

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
  formaId: number | null
  valorTexto: string
  parcelas: string
  bandeiraId: string
}

interface Props {
  open: boolean
  onClose: () => void
  clienteFixo?: ClienteResumo
  onCreated?: (vendaId: number) => void
}

const dataBr = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('/')

/** Quem pode receber este cartao: a bandeira precisa aceitar a modalidade e ter taxa cadastrada para ela. */
function bandeirasDaForma(forma: FormaPagamento | undefined, bandeiras: Bandeira[]): Bandeira[] {
  if (!forma) return []
  if (forma.tipo === 'CARTAO_DEBITO') return bandeiras.filter((b) => b.aceitaDebito && b.debitoTaxaBp !== null)
  return bandeiras.filter((b) => b.aceitaCredito && b.faixas.length > 0)
}

const rotuloBandeira = (b: Bandeira): string => (b.adquirente ? `${b.nome} (${b.adquirente})` : b.nome)

export function VendaFormDialog({ open, onClose, clienteFixo, onCreated }: Props): ReactNode {
  const queryClient = useQueryClient()
  const [cliente, setCliente] = useState<ClienteResumo | null>(clienteFixo ?? null)
  const [itens, setItens] = useState<LinhaItem[]>([])
  const [pagamentos, setPagamentos] = useState<LinhaPagamento[]>([])
  const [receitaOpticaId, setReceitaOpticaId] = useState('')
  const [ordemServicoId, setOrdemServicoId] = useState('')
  const [descontoTipo, setDescontoTipo] = useState<TipoDesconto>('VALOR')
  const [descontoTexto, setDescontoTexto] = useState('')
  const [descontoPercentualBp, setDescontoPercentualBp] = useState<number | null>(null)
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
      setDescontoTipo('VALOR')
      setDescontoTexto('')
      setDescontoPercentualBp(null)
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
  // So as ATIVAS: forma ou bandeira inativa nao serve para venda nova (as antigas continuam mostrando o que usaram).
  const formasQuery = useQuery({
    queryKey: ['formasPagamento', { ativas: true }],
    queryFn: () => unwrap(window.api.formasPagamento.list({ apenasAtivos: true })),
    enabled: open
  })
  const bandeirasQuery = useQuery({
    queryKey: ['bandeiras', { ativas: true }],
    queryFn: () => unwrap(window.api.bandeiras.list({ apenasAtivos: true })),
    enabled: open
  })
  const formas = useMemo(() => formasQuery.data ?? [], [formasQuery.data])
  const bandeiras = useMemo(() => bandeirasQuery.data ?? [], [bandeirasQuery.data])

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

  // Totais calculados ao vivo com as MESMAS funcoes do servidor (shared/vendaCalculo) - o backend recalcula tudo
  // de novo e e quem manda de verdade, isto e so para a pessoa ver o que esta montando.
  const itensParaTotal = useMemo(
    () =>
      itens.map((it) => ({
        quantidade: Math.round(Number(it.quantidadeTexto || '0')),
        precoUnitarioCentavos: textoParaCentavos(it.precoUnitarioTexto),
        descontoCentavos: textoParaCentavos(it.descontoTexto)
      })),
    [itens]
  )
  const descontoAdicional = useMemo(
    () => ({ tipo: descontoTipo, valor: descontoTipo === 'PERCENTUAL' ? (descontoPercentualBp ?? 0) : textoParaCentavos(descontoTexto) }),
    [descontoTipo, descontoPercentualBp, descontoTexto]
  )
  const totaisComDesconto = useMemo(() => calcularTotaisVenda(itensParaTotal, descontoAdicional), [itensParaTotal, descontoAdicional])
  const totaisSemExtra = useMemo(() => calcularTotaisVenda(itensParaTotal, { tipo: 'VALOR', valor: 0 }), [itensParaTotal])
  const erroDesconto = !totaisComDesconto.ok ? totaisComDesconto.erro : null
  const totais = totaisComDesconto.ok ? totaisComDesconto : totaisSemExtra.ok ? totaisSemExtra : null
  const subtotalCentavos = totais?.subtotalCentavos ?? 0
  const descontoTotalCentavos = totais?.descontoCentavos ?? 0
  const totalCentavos = totais?.totalCentavos ?? 0

  const dataVenda = useMemo(() => hojeLocal(), [open]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Cada linha com o calculo que o servidor vai fazer (ou a razao de ainda nao dar para calcular). */
  const linhas = useMemo(
    () =>
      pagamentos.map((p) => {
        const forma = formas.find((f) => f.id === p.formaId)
        const valorCentavos = textoParaCentavos(p.valorTexto)
        const bandeira = p.bandeiraId ? bandeiras.find((b) => b.id === Number(p.bandeiraId)) : undefined
        if (!forma) return { p, forma, bandeira, valorCentavos, calculo: null as PagamentoCalculado | null, erroCalculo: 'Escolha a forma de pagamento.' }
        const r = calcularPagamento({ forma, valorCentavos, parcelas: Number(p.parcelas || '1'), bandeira: bandeira ?? null }, dataVenda)
        return { p, forma, bandeira, valorCentavos, calculo: r.ok ? r.pagamento : null, erroCalculo: r.ok ? null : r.erro }
      }),
    [pagamentos, formas, bandeiras, dataVenda]
  )
  const calculados = linhas.flatMap((l) => (l.calculo ? [l.calculo] : []))
  const resumo = resumirPagamentos(totalCentavos, calculados)
  const somaPagamentosCentavos = linhas.reduce((s, l) => s + l.valorCentavos, 0)
  const restanteCentavos = totalCentavos - somaPagamentosCentavos

  function adicionarPagamento(): void {
    setPagamentos((atual) => [
      ...atual,
      {
        chave: `pg-${Date.now()}`,
        formaId: formas[0]?.id ?? null,
        valorTexto: centavosParaTexto(Math.max(restanteCentavos, 0)),
        parcelas: '1',
        bandeiraId: ''
      }
    ])
  }

  function atualizarPagamento(chave: string, parte: Partial<LinhaPagamento>): void {
    setPagamentos((atual) => atual.map((p) => (p.chave === chave ? { ...p, ...parte } : p)))
  }

  function removerPagamento(chave: string): void {
    setPagamentos((atual) => atual.filter((p) => p.chave !== chave))
  }

  function montarPayload(credencial: CredencialAdminInput | null) {
    return validarOuErro(vendaCreateSchema, {
      clienteId: cliente!.id,
      receitaOpticaId: receitaOpticaId ? Number(receitaOpticaId) : null,
      ordemServicoId: ordemServicoId ? Number(ordemServicoId) : null,
      descontoAdicional,
      itens: itens.map((it) => ({
        produtoId: it.produtoId,
        quantidade: Number(it.quantidadeTexto || '0'),
        precoUnitarioCentavos: it.precoUnitarioTexto || '0',
        descontoCentavos: it.descontoTexto || '0'
      })),
      pagamentos: linhas.map((l) => ({
        formaPagamentoId: l.p.formaId,
        valorCentavos: l.valorCentavos,
        parcelas: l.forma && comportamentoDoTipo(l.forma.tipo) === 'IMEDIATO' ? 1 : Number(l.p.parcelas || '1'),
        bandeiraId: l.p.bandeiraId ? Number(l.p.bandeiraId) : null
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
      queryClient.invalidateQueries({ queryKey: ['contasReceber'] })
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

  const todasCalculadas = linhas.every((l) => l.calculo !== null)
  const podeSubmeter =
    Boolean(cliente) && itens.length > 0 && pagamentos.length > 0 && restanteCentavos === 0 && todasCalculadas && erroDesconto === null && totalCentavos > 0

  return (
    <Dialog open={open} onClose={onClose} title="Nova venda" className="max-w-3xl">
      <form
        // Enter só passa para o próximo campo: o formulário só envia pelo botão.
        onKeyDown={enterAvancaCampo}
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
          <Field label="Prescrição vinculada" hint="Opcional">
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
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[var(--ink-2)]">Desconto adicional</span>
            <div className="flex items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-md border border-[var(--rule-strong)]" role="group" aria-label="Tipo do desconto">
                {(['VALOR', 'PERCENTUAL'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={descontoTipo === t}
                    onClick={() => setDescontoTipo(t)}
                    className={
                      descontoTipo === t
                        ? 'bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white'
                        : 'bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--ink-2)] hover:bg-[var(--surface-2)]'
                    }
                  >
                    {t === 'VALOR' ? 'R$' : '%'}
                  </button>
                ))}
              </div>
              <div className="w-36">
                {descontoTipo === 'PERCENTUAL' ? (
                  <PercentualInput value={descontoPercentualBp} aria-label="Desconto em porcentagem" placeholder="0" invalid={erroDesconto !== null} onChange={setDescontoPercentualBp} />
                ) : (
                  <Input
                    className={`text-right font-mono-tab ${erroDesconto ? 'border-[var(--danger)]!' : ''}`}
                    aria-label="Desconto em reais"
                    value={descontoTexto}
                    onChange={(e) => setDescontoTexto(e.target.value)}
                    placeholder="0,00"
                  />
                )}
              </div>
              {descontoTipo === 'PERCENTUAL' && totais && totaisComDesconto.ok && (
                <span className="font-mono-tab text-sm text-[var(--ink-3)]">= {centavosParaBRL(totaisComDesconto.descontoAdicionalCentavos)}</span>
              )}
            </div>
            {erroDesconto ? (
              <p className="text-xs text-[var(--danger)]">{erroDesconto}</p>
            ) : (
              <p className="text-xs text-[var(--ink-3)]">
                Além do desconto já aplicado item a item, se houver. Em %: de 0 a 100. Em R$: no máximo o subtotal.
              </p>
            )}
          </div>

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
            <Button type="button" variant="secondary" size="sm" onClick={adicionarPagamento} disabled={formas.length === 0}>
              <Plus className="size-3.5" /> Forma de pagamento
            </Button>
          </div>

          {linhas.map(({ p, forma, bandeira, valorCentavos, calculo, erroCalculo }) => {
            const comportamento = forma ? comportamentoDoTipo(forma.tipo) : null
            const disponiveis = bandeirasDaForma(forma, bandeiras)
            return (
              <div key={p.chave} className="flex flex-col gap-2 rounded-md border border-[var(--rule)] p-2.5">
                <div className="grid grid-cols-[1fr_9rem_2rem] items-end gap-2">
                  <Field label="Forma">
                    <Select
                      value={p.formaId ?? ''}
                      onChange={(e) => atualizarPagamento(p.chave, { formaId: Number(e.target.value), parcelas: '1', bandeiraId: '' })}
                    >
                      {formas.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Valor (R$)">
                    <Input
                      className="text-center font-mono-tab"
                      value={p.valorTexto}
                      onChange={(e) => atualizarPagamento(p.chave, { valorTexto: e.target.value })}
                      placeholder="0,00"
                    />
                  </Field>
                  <button
                    type="button"
                    title="Remover forma de pagamento"
                    aria-label="Remover forma de pagamento"
                    onClick={() => removerPagamento(p.chave)}
                    className="mb-1.5 rounded p-1 text-[var(--ink-3)] hover:bg-[var(--danger-wash)] hover:text-[var(--danger)]"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                {comportamento === 'OPERADORA' && forma && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Field label="Bandeira" required>
                      <Select value={p.bandeiraId} onChange={(e) => atualizarPagamento(p.chave, { bandeiraId: e.target.value, parcelas: '1' })}>
                        <option value="">— escolha —</option>
                        {disponiveis.map((b) => (
                          <option key={b.id} value={b.id}>
                            {rotuloBandeira(b)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    {forma.tipo === 'CARTAO_CREDITO' ? (
                      <Field label="Parcelas no cartão" required>
                        <Select value={p.parcelas} disabled={!bandeira} onChange={(e) => atualizarPagamento(p.chave, { parcelas: e.target.value })}>
                          {!bandeira && <option value="1">Escolha a bandeira</option>}
                          {bandeira?.faixas.map((f) => (
                            <option key={f.parcelas} value={f.parcelas}>
                              {f.parcelas}x · taxa {formatarBp(f.taxaBp)} · líquido {centavosParaBRL(liquidoEstimado(valorCentavos, f.taxaBp, f.descontoClienteBp))}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    ) : (
                      <Field label="Débito">
                        <p className="flex h-9 items-center text-sm text-[var(--ink-2)]">
                          {bandeira && bandeira.debitoTaxaBp !== null
                            ? `taxa ${formatarBp(bandeira.debitoTaxaBp)} · líquido ${centavosParaBRL(liquidoEstimado(valorCentavos, bandeira.debitoTaxaBp))}`
                            : 'Escolha a bandeira'}
                        </p>
                      </Field>
                    )}
                    {disponiveis.length === 0 && (
                      <p className="text-xs text-[var(--warn)] sm:col-span-2">
                        Nenhuma bandeira cadastrada para {forma.tipo === 'CARTAO_DEBITO' ? 'débito' : 'crédito'}. O Administrador cadastra em Bandeiras.
                      </p>
                    )}
                  </div>
                )}

                {comportamento === 'PARCELADO_CLIENTE' && forma && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Field label="Parcelas" required>
                      <Select value={p.parcelas} onChange={(e) => atualizarPagamento(p.chave, { parcelas: e.target.value })}>
                        {Array.from({ length: forma.maxParcelas ?? 12 }, (_, i) => i + 1).map((n) => {
                          const simulado = valorCentavos > 0 ? calcularPagamento({ forma, valorCentavos, parcelas: n }, dataVenda) : null
                          const parcela1 = simulado?.ok && simulado.pagamento.comportamento === 'PARCELADO_CLIENTE' ? simulado.pagamento.valoresParcelas[0] : null
                          return (
                            <option key={n} value={n}>
                              {n}x{parcela1 !== null ? ` de ${centavosParaBRL(parcela1)}` : ''}
                            </option>
                          )
                        })}
                      </Select>
                    </Field>
                    <p className="self-end pb-2 text-xs text-[var(--ink-3)]">
                      A cada {forma.intervaloDias} dias, a primeira em {dataBr(calculo && calculo.comportamento === 'PARCELADO_CLIENTE' ? calculo.vencimentos[0] : dataVenda)}.
                    </p>
                  </div>
                )}

                {/* O que este pagamento vai gerar, antes de confirmar: acrescimo explicito, liquido da operadora. */}
                {calculo?.comportamento === 'PARCELADO_CLIENTE' && (
                  <p className="rounded-md bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink-2)]">
                    <b className="text-[var(--ink)]">{descreverAcrescimo(calculo)}</b>
                    {calculo.acrescimoCentavos > 0 && (
                      <>
                        {' '}
                        sobre {centavosParaBRL(calculo.financiadoCentavos)}: o cliente paga {centavosParaBRL(calculo.totalComAcrescimoCentavos)} em {calculo.parcelas}x
                        {calculo.valoresParcelas[0] !== calculo.valoresParcelas[calculo.valoresParcelas.length - 1]
                          ? ` (${centavosParaBRL(calculo.valoresParcelas[0])} na primeira e ${centavosParaBRL(calculo.valoresParcelas[1] ?? calculo.valoresParcelas[0])} nas demais)`
                          : ` de ${centavosParaBRL(calculo.valoresParcelas[0])}`}
                        .
                      </>
                    )}
                  </p>
                )}
                {calculo?.comportamento === 'OPERADORA' && (
                  <p className="rounded-md bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink-2)]">
                    Um recebível da operadora de <b className="text-[var(--ink)]">{centavosParaBRL(calculo.liquidoCentavos)}</b> em {dataBr(calculo.vencimento)} (taxa {formatarBp(calculo.taxaBp)}
                    {calculo.descontoClienteCentavos > 0 ? `; desconto ao cliente de ${centavosParaBRL(calculo.descontoClienteCentavos)}` : ''}). Não gera parcelas para o cliente.
                  </p>
                )}
                {erroCalculo && valorCentavos > 0 && comportamento !== null && (
                  <p className="text-xs text-[var(--warn)]">{erroCalculo}</p>
                )}
              </div>
            )
          })}

          {pagamentos.length > 0 && restanteCentavos !== 0 && (
            <p className={restanteCentavos > 0 ? 'text-sm text-[var(--warn)]' : 'text-sm text-[var(--danger)]'}>
              {restanteCentavos > 0
                ? `Falta alocar ${centavosParaBRL(restanteCentavos)}.`
                : `Pagamentos excedem o total em ${centavosParaBRL(-restanteCentavos)}.`}
            </p>
          )}
        </div>

        {pagamentos.length > 0 && todasCalculadas && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border border-[var(--rule)] bg-[var(--surface-2)] p-3 text-sm sm:grid-cols-4">
            <p className="col-span-full text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">Resumo antes de concluir</p>
            <div>
              <p className="text-xs text-[var(--ink-3)]">Total da venda</p>
              <p className="font-mono-tab text-[var(--ink)]">{centavosParaBRL(totalCentavos)}</p>
            </div>
            {resumo.acrescimoCentavos > 0 && (
              <div>
                <p className="text-xs text-[var(--ink-3)]">Acréscimo do parcelamento</p>
                <p className="font-mono-tab text-[var(--ink)]">+ {centavosParaBRL(resumo.acrescimoCentavos)}</p>
              </div>
            )}
            {resumo.descontoClienteCentavos > 0 && (
              <div>
                <p className="text-xs text-[var(--ink-3)]">Desconto do cartão</p>
                <p className="font-mono-tab text-[var(--ink)]">− {centavosParaBRL(resumo.descontoClienteCentavos)}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-[var(--ink-3)]">O cliente paga</p>
              <p className="font-mono-tab text-base font-semibold text-[var(--accent)]">{centavosParaBRL(resumo.totalClienteCentavos)}</p>
            </div>
            {resumo.recebidoAgoraCentavos > 0 && (
              <div>
                <p className="text-xs text-[var(--ink-3)]">Recebido agora</p>
                <p className="font-mono-tab text-[var(--ink)]">{centavosParaBRL(resumo.recebidoAgoraCentavos)}</p>
              </div>
            )}
            {resumo.aReceberClienteCentavos > 0 && (
              <div>
                <p className="text-xs text-[var(--ink-3)]">Parcelas do cliente</p>
                <p className="font-mono-tab text-[var(--ink)]">{centavosParaBRL(resumo.aReceberClienteCentavos)}</p>
              </div>
            )}
            {resumo.aReceberOperadoraCentavos > 0 && (
              <div>
                <p className="text-xs text-[var(--ink-3)]">A receber da operadora (líquido)</p>
                <p className="font-mono-tab text-[var(--ink)]">{centavosParaBRL(resumo.aReceberOperadoraCentavos)}</p>
              </div>
            )}
          </div>
        )}

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
