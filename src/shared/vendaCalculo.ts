/**
 * Calculo da venda (Fase 5), em funcoes PURAS: a tela, o servidor e a impressao usam estas mesmas
 * contas. Dinheiro em centavos (inteiro) e percentual em pontos-base (8,99% = 899), sempre com
 * arredondamento half-up (shared/dinheiro). O servidor NUNCA confia no que a tela calculou: ele
 * chama estas funcoes de novo e grava o resultado como snapshot (RG-02).
 *
 * Decisoes (documento de melhorias, secao 9 + decisoes do dono):
 *  - desconto da venda: em R$ (no maximo a base) ou em % (0 a 100), sobre o que sobra dos itens;
 *  - a forma de pagamento define o comportamento financeiro pelo TIPO:
 *      IMEDIATO          (Dinheiro, PIX, Transferencia, Outro): recebido na data da venda;
 *      OPERADORA         (Debito, Credito): UM recebivel da operadora, pelo valor liquido;
 *      PARCELADO_CLIENTE (Promissoria, Boleto, Cheque): N parcelas do cliente;
 *  - a diferenca de centavos das parcelas fica na PRIMEIRA parcela (shared/parcelamento).
 */
import {
  acrescentarPercentualBp,
  aplicarPercentualBp,
  descontarPercentualBp,
  formatarBp
} from './dinheiro'
import { calcularParcelas } from './parcelamento'

// ---------------------------------------------------------------------
// Tipos de forma de pagamento
// ---------------------------------------------------------------------

export const TIPOS_FORMA_PAGAMENTO = [
  'DINHEIRO',
  'PIX',
  'TRANSFERENCIA',
  'CARTAO_DEBITO',
  'CARTAO_CREDITO',
  'PROMISSORIA',
  'BOLETO',
  'CHEQUE',
  'OUTRO'
] as const
export type TipoFormaPagamento = (typeof TIPOS_FORMA_PAGAMENTO)[number]

export const ROTULO_TIPO_FORMA: Record<TipoFormaPagamento, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'PIX',
  TRANSFERENCIA: 'Transferência',
  CARTAO_DEBITO: 'Cartão de Débito',
  CARTAO_CREDITO: 'Cartão de Crédito',
  PROMISSORIA: 'Promissória',
  BOLETO: 'Boleto',
  CHEQUE: 'Cheque',
  OUTRO: 'Outro'
}

export type ComportamentoFinanceiro = 'IMEDIATO' | 'OPERADORA' | 'PARCELADO_CLIENTE'

export function comportamentoDoTipo(tipo: TipoFormaPagamento): ComportamentoFinanceiro {
  if (tipo === 'CARTAO_DEBITO' || tipo === 'CARTAO_CREDITO') return 'OPERADORA'
  if (tipo === 'PROMISSORIA' || tipo === 'BOLETO' || tipo === 'CHEQUE') return 'PARCELADO_CLIENTE'
  return 'IMEDIATO'
}

export const ROTULO_COMPORTAMENTO: Record<ComportamentoFinanceiro, string> = {
  IMEDIATO: 'Recebido na data da venda',
  OPERADORA: 'Recebível da operadora',
  PARCELADO_CLIENTE: 'Parcelas do cliente'
}

export type TipoAcrescimo = 'PERCENTUAL' | 'VALOR'

export const INTERVALO_PADRAO_DIAS = 30
export const MAX_PARCELAS_CLIENTE = 60
export const MAX_PARCELAS_CARTAO = 24

// ---------------------------------------------------------------------
// Resultado das contas: erro como valor, para a tela mostrar sem excecao
// ---------------------------------------------------------------------

export type Resultado<T> = ({ ok: true } & T) | { ok: false; erro: string }

/** R$ 1.234,56 (so para mensagens de erro: a tela tem o seu formatador). */
export function brl(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ')
}

/** 'AAAA-MM-DD' mais N dias (conta de calendario, sem fuso). */
export function somarDiasISO(dataISO: string, dias: number): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Vencimentos a cada `intervaloDias` a partir da data da venda: 1a parcela em +intervalo, 2a em +2x... */
export function calcularVencimentosPorIntervalo(dataVendaISO: string, numParcelas: number, intervaloDias: number): string[] {
  return Array.from({ length: numParcelas }, (_, i) => somarDiasISO(dataVendaISO, intervaloDias * (i + 1)))
}

// ---------------------------------------------------------------------
// Desconto e totais da venda (9.1)
// ---------------------------------------------------------------------

export type TipoDesconto = 'VALOR' | 'PERCENTUAL'

/** `valor`: centavos quando VALOR, pontos-base quando PERCENTUAL (10% = 1000). */
export interface DescontoAdicional {
  tipo: TipoDesconto
  valor: number
}

/**
 * Desconto adicional sobre a `baseCentavos` (subtotal menos os descontos dos itens).
 * Em %: de 0 a 100. Em R$: no maximo a base.
 */
export function calcularDescontoAdicional(baseCentavos: number, desconto: DescontoAdicional): Resultado<{ centavos: number }> {
  if (!Number.isInteger(desconto.valor) || desconto.valor < 0) return { ok: false, erro: 'Informe um desconto válido.' }
  if (desconto.tipo === 'PERCENTUAL') {
    if (desconto.valor > 10000) return { ok: false, erro: 'O desconto em % vai de 0 a 100.' }
    return { ok: true, centavos: aplicarPercentualBp(baseCentavos, desconto.valor) }
  }
  if (desconto.valor > baseCentavos) {
    return { ok: false, erro: `O desconto (${brl(desconto.valor)}) não pode ser maior que o subtotal (${brl(baseCentavos)}).` }
  }
  return { ok: true, centavos: desconto.valor }
}

export interface ItemParaTotal {
  quantidade: number
  precoUnitarioCentavos: number
  descontoCentavos: number
}

export interface TotaisVenda {
  subtotalCentavos: number
  descontoItensCentavos: number
  descontoAdicionalCentavos: number
  /** Itens + adicional: e o que fica em `venda.desconto_centavos`. */
  descontoCentavos: number
  totalCentavos: number
  /** Desconto total sobre o subtotal, em % (para o limite do vendedor). */
  descontoPct: number
}

export function calcularTotaisVenda(itens: ItemParaTotal[], adicional: DescontoAdicional = { tipo: 'VALOR', valor: 0 }): Resultado<TotaisVenda> {
  let subtotalCentavos = 0
  let descontoItensCentavos = 0
  for (const item of itens) {
    const bruto = item.quantidade * item.precoUnitarioCentavos
    if (item.descontoCentavos > bruto) {
      return { ok: false, erro: `O desconto de um item (${brl(item.descontoCentavos)}) não pode ser maior que o total dele (${brl(bruto)}).` }
    }
    subtotalCentavos += bruto
    descontoItensCentavos += item.descontoCentavos
  }
  const base = subtotalCentavos - descontoItensCentavos
  const extra = calcularDescontoAdicional(base, adicional)
  if (!extra.ok) return extra
  const descontoCentavos = descontoItensCentavos + extra.centavos
  return {
    ok: true,
    subtotalCentavos,
    descontoItensCentavos,
    descontoAdicionalCentavos: extra.centavos,
    descontoCentavos,
    totalCentavos: subtotalCentavos - descontoCentavos,
    descontoPct: subtotalCentavos > 0 ? (descontoCentavos / subtotalCentavos) * 100 : 0
  }
}

// ---------------------------------------------------------------------
// Pagamento: cada linha segue a regra da sua forma (9.2 a 9.5)
// ---------------------------------------------------------------------

export interface FormaPagamentoConfig {
  id: number
  nome: string
  tipo: TipoFormaPagamento
  /** So PARCELADO_CLIENTE. */
  maxParcelas: number | null
  intervaloDias: number
  acrescimoTipo: TipoAcrescimo | null
  /** Pontos-base quando PERCENTUAL, centavos quando VALOR. */
  acrescimoValor: number
}

export interface FaixaCredito {
  parcelas: number
  taxaBp: number
  prazoDias: number
  /** Desconto comercial ao cliente nesta quantidade de parcelas (0 = sem efeito). */
  descontoClienteBp: number
}

export interface BandeiraConfig {
  id: number
  nome: string
  aceitaDebito: boolean
  aceitaCredito: boolean
  debitoTaxaBp: number | null
  debitoPrazoDias: number | null
  faixas: FaixaCredito[]
}

export interface PagamentoEntrada {
  forma: FormaPagamentoConfig
  /** Parte do total da venda que esta linha paga (antes de acrescimo ou desconto da faixa). */
  valorCentavos: number
  parcelas: number
  bandeira?: BandeiraConfig | null
}

export interface PagamentoImediato {
  comportamento: 'IMEDIATO'
  valorCentavos: number
  parcelas: 1
  recebidoCentavos: number
}

export interface PagamentoOperadora {
  comportamento: 'OPERADORA'
  valorCentavos: number
  parcelas: number
  modalidade: 'DEBITO' | 'CREDITO'
  bandeiraId: number
  bandeiraNome: string
  taxaBp: number
  prazoDias: number
  /** Desconto comercial da faixa (pontos-base) e o quanto ele tirou, em centavos. */
  descontoClienteBp: number
  descontoClienteCentavos: number
  /** O que o cliente paga na maquininha. */
  brutoCentavos: number
  taxaCentavos: number
  liquidoCentavos: number
  /** Data da venda + prazo da faixa. */
  vencimento: string
}

export interface PagamentoParceladoCliente {
  comportamento: 'PARCELADO_CLIENTE'
  valorCentavos: number
  parcelas: number
  intervaloDias: number
  /** Valor da linha (ja com desconto da venda), sobre o qual o acrescimo incide. */
  financiadoCentavos: number
  acrescimoTipo: TipoAcrescimo | null
  acrescimoValor: number
  /** Aplicado UMA vez sobre o total financiado, nunca por parcela. */
  acrescimoCentavos: number
  totalComAcrescimoCentavos: number
  valoresParcelas: number[]
  vencimentos: string[]
}

export type PagamentoCalculado = PagamentoImediato | PagamentoOperadora | PagamentoParceladoCliente

export function calcularPagamento(entrada: PagamentoEntrada, dataVendaISO: string): Resultado<{ pagamento: PagamentoCalculado }> {
  const { forma, valorCentavos } = entrada
  if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) {
    return { ok: false, erro: `Informe um valor maior que zero para ${forma.nome}.` }
  }
  const parcelas = Number.isInteger(entrada.parcelas) && entrada.parcelas >= 1 ? entrada.parcelas : 1
  const comportamento = comportamentoDoTipo(forma.tipo)

  if (comportamento === 'IMEDIATO') {
    return { ok: true, pagamento: { comportamento, valorCentavos, parcelas: 1, recebidoCentavos: valorCentavos } }
  }

  if (comportamento === 'OPERADORA') {
    const bandeira = entrada.bandeira
    if (!bandeira) return { ok: false, erro: `Escolha a bandeira do cartão em ${forma.nome}.` }
    const debito = forma.tipo === 'CARTAO_DEBITO'
    let taxaBp: number
    let prazoDias: number
    let descontoClienteBp = 0
    let qtdParcelas = 1
    if (debito) {
      if (!bandeira.aceitaDebito || bandeira.debitoTaxaBp === null || bandeira.debitoPrazoDias === null) {
        return { ok: false, erro: `A bandeira ${bandeira.nome} não está configurada para débito.` }
      }
      taxaBp = bandeira.debitoTaxaBp
      prazoDias = bandeira.debitoPrazoDias
    } else {
      if (!bandeira.aceitaCredito) return { ok: false, erro: `A bandeira ${bandeira.nome} não aceita crédito.` }
      const faixa = bandeira.faixas.find((f) => f.parcelas === parcelas)
      if (!faixa) return { ok: false, erro: `A bandeira ${bandeira.nome} não tem taxa cadastrada para ${parcelas}x no crédito.` }
      taxaBp = faixa.taxaBp
      prazoDias = faixa.prazoDias
      descontoClienteBp = faixa.descontoClienteBp
      qtdParcelas = faixa.parcelas
    }
    const descontoClienteCentavos = descontoClienteBp > 0 ? aplicarPercentualBp(valorCentavos, descontoClienteBp) : 0
    const brutoCentavos = valorCentavos - descontoClienteCentavos
    const liquidoCentavos = descontarPercentualBp(brutoCentavos, taxaBp)
    return {
      ok: true,
      pagamento: {
        comportamento,
        valorCentavos,
        parcelas: qtdParcelas,
        modalidade: debito ? 'DEBITO' : 'CREDITO',
        bandeiraId: bandeira.id,
        bandeiraNome: bandeira.nome,
        taxaBp,
        prazoDias,
        descontoClienteBp,
        descontoClienteCentavos,
        brutoCentavos,
        taxaCentavos: brutoCentavos - liquidoCentavos,
        liquidoCentavos,
        vencimento: somarDiasISO(dataVendaISO, prazoDias)
      }
    }
  }

  // PARCELADO_CLIENTE
  const maximo = forma.maxParcelas ?? MAX_PARCELAS_CLIENTE
  if (parcelas > maximo) {
    return { ok: false, erro: `${forma.nome} aceita no máximo ${maximo} parcela${maximo === 1 ? '' : 's'}.` }
  }
  const intervaloDias = forma.intervaloDias >= 1 ? forma.intervaloDias : INTERVALO_PADRAO_DIAS
  const acrescimoCentavos = acrescimoDaForma(forma, valorCentavos)
  const totalComAcrescimoCentavos = valorCentavos + acrescimoCentavos
  return {
    ok: true,
    pagamento: {
      comportamento,
      valorCentavos,
      parcelas,
      intervaloDias,
      financiadoCentavos: valorCentavos,
      acrescimoTipo: forma.acrescimoTipo,
      acrescimoValor: forma.acrescimoValor,
      acrescimoCentavos,
      totalComAcrescimoCentavos,
      valoresParcelas: calcularParcelas(totalComAcrescimoCentavos, parcelas),
      vencimentos: calcularVencimentosPorIntervalo(dataVendaISO, parcelas, intervaloDias)
    }
  }
}

/** Acrescimo da forma sobre o valor financiado: % (arredondado no centavo) ou R$ fixo; sem configuracao, zero. */
export function acrescimoDaForma(forma: Pick<FormaPagamentoConfig, 'acrescimoTipo' | 'acrescimoValor'>, financiadoCentavos: number): number {
  if (forma.acrescimoTipo === 'PERCENTUAL') return acrescentarPercentualBp(financiadoCentavos, forma.acrescimoValor) - financiadoCentavos
  if (forma.acrescimoTipo === 'VALOR') return forma.acrescimoValor
  return 0
}

/** "Acréscimo de 5% (R$ 45,00)" / "Acréscimo de R$ 20,00" / "Sem acréscimo": o texto do resumo da venda. */
export function descreverAcrescimo(p: Pick<PagamentoParceladoCliente, 'acrescimoTipo' | 'acrescimoValor' | 'acrescimoCentavos'>): string {
  if (p.acrescimoCentavos <= 0) return 'Sem acréscimo'
  if (p.acrescimoTipo === 'PERCENTUAL') return `Acréscimo de ${formatarBp(p.acrescimoValor)} (${brl(p.acrescimoCentavos)})`
  return `Acréscimo de ${brl(p.acrescimoCentavos)}`
}

// ---------------------------------------------------------------------
// Resumo da venda (o que a tela mostra antes de confirmar e o comprovante imprime)
// ---------------------------------------------------------------------

export interface ResumoPagamentos {
  /** Soma do que cada linha paga do total da venda (precisa ser igual ao total). */
  alocadoCentavos: number
  acrescimoCentavos: number
  descontoClienteCentavos: number
  /** Total da venda + acrescimo - desconto da faixa do cartao: o que o cliente de fato paga. */
  totalClienteCentavos: number
  recebidoAgoraCentavos: number
  aReceberClienteCentavos: number
  aReceberOperadoraCentavos: number
  taxasOperadoraCentavos: number
}

export function resumirPagamentos(totalVendaCentavos: number, pagamentos: PagamentoCalculado[]): ResumoPagamentos {
  const r: ResumoPagamentos = {
    alocadoCentavos: 0,
    acrescimoCentavos: 0,
    descontoClienteCentavos: 0,
    totalClienteCentavos: 0,
    recebidoAgoraCentavos: 0,
    aReceberClienteCentavos: 0,
    aReceberOperadoraCentavos: 0,
    taxasOperadoraCentavos: 0
  }
  for (const p of pagamentos) {
    r.alocadoCentavos += p.valorCentavos
    if (p.comportamento === 'IMEDIATO') r.recebidoAgoraCentavos += p.recebidoCentavos
    else if (p.comportamento === 'OPERADORA') {
      r.descontoClienteCentavos += p.descontoClienteCentavos
      r.aReceberOperadoraCentavos += p.liquidoCentavos
      r.taxasOperadoraCentavos += p.taxaCentavos
    } else {
      r.acrescimoCentavos += p.acrescimoCentavos
      r.aReceberClienteCentavos += p.totalComAcrescimoCentavos
    }
  }
  r.totalClienteCentavos = totalVendaCentavos + r.acrescimoCentavos - r.descontoClienteCentavos
  return r
}

/** Liquido estimado de um valor no credito/debito (o select de parcelas mostra isto antes de escolher). */
export function liquidoEstimado(valorCentavos: number, taxaBp: number, descontoClienteBp = 0): number {
  const bruto = valorCentavos - (descontoClienteBp > 0 ? aplicarPercentualBp(valorCentavos, descontoClienteBp) : 0)
  return descontarPercentualBp(bruto, taxaBp)
}
