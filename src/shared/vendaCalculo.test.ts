import { describe, expect, it } from 'vitest'
import {
  type BandeiraConfig,
  type FormaPagamentoConfig,
  calcularDescontoAdicional,
  calcularPagamento,
  calcularTotaisVenda,
  calcularVencimentosPorIntervalo,
  comportamentoDoTipo,
  descreverAcrescimo,
  liquidoEstimado,
  resumirPagamentos,
  somarDiasISO,
  textoPercentual
} from './vendaCalculo'
import { percentualParaBp } from './dinheiro'

const forma = (extra: Partial<FormaPagamentoConfig>): FormaPagamentoConfig => ({
  id: 1,
  nome: 'FORMA',
  tipo: 'DINHEIRO',
  maxParcelas: null,
  intervaloDias: 30,
  acrescimoTipo: null,
  acrescimoValor: 0,
  ...extra
})

const visa: BandeiraConfig = {
  id: 7,
  nome: 'VISA',
  aceitaDebito: true,
  aceitaCredito: true,
  debitoTaxaBp: 199,
  debitoPrazoDias: 1,
  faixas: [
    { parcelas: 1, taxaBp: 349, prazoDias: 30, descontoClienteBp: 0 },
    { parcelas: 6, taxaBp: 899, prazoDias: 180, descontoClienteBp: 0 },
    { parcelas: 12, taxaBp: 1299, prazoDias: 360, descontoClienteBp: 500 }
  ]
}

describe('percentual no campo da tela', () => {
  it('mostra o valor exato com vírgula, só com as casas que ele tem', () => {
    expect(textoPercentual(899)).toBe('8,99')
    expect(textoPercentual(1000)).toBe('10')
    expect(textoPercentual(50)).toBe('0,5')
    expect(textoPercentual(10000)).toBe('100')
    expect(textoPercentual(0)).toBe('0')
    expect(textoPercentual(null)).toBe('')
  })

  it('o que a pessoa digita volta para pontos-base sem erro de ponto flutuante', () => {
    expect(percentualParaBp('8,99')).toBe(899)
    expect(percentualParaBp('0,29')).toBe(29)
    expect(percentualParaBp('1,15')).toBe(115)
    expect(percentualParaBp('abc')).toBeNull()
    expect(percentualParaBp('')).toBeNull()
  })
})

describe('tipo -> comportamento financeiro', () => {
  it('cada tipo segue a regra do documento', () => {
    expect(comportamentoDoTipo('DINHEIRO')).toBe('IMEDIATO')
    expect(comportamentoDoTipo('PIX')).toBe('IMEDIATO')
    expect(comportamentoDoTipo('TRANSFERENCIA')).toBe('IMEDIATO')
    expect(comportamentoDoTipo('OUTRO')).toBe('IMEDIATO')
    expect(comportamentoDoTipo('CARTAO_DEBITO')).toBe('OPERADORA')
    expect(comportamentoDoTipo('CARTAO_CREDITO')).toBe('OPERADORA')
    expect(comportamentoDoTipo('PROMISSORIA')).toBe('PARCELADO_CLIENTE')
    expect(comportamentoDoTipo('BOLETO')).toBe('PARCELADO_CLIENTE')
    expect(comportamentoDoTipo('CHEQUE')).toBe('PARCELADO_CLIENTE')
  })
})

describe('desconto da venda (9.1)', () => {
  const item = (quantidade: number, preco: number, desconto = 0) => ({ quantidade, precoUnitarioCentavos: preco, descontoCentavos: desconto })

  it('R$ 500,00 com desconto de R$ 50,00 -> R$ 450,00', () => {
    const r = calcularTotaisVenda([item(1, 50000)], { tipo: 'VALOR', valor: 5000 })
    expect(r).toMatchObject({ ok: true, subtotalCentavos: 50000, descontoCentavos: 5000, totalCentavos: 45000 })
  })

  it('desconto de R$ 600,00 sobre R$ 500,00 -> erro', () => {
    const r = calcularTotaisVenda([item(1, 50000)], { tipo: 'VALOR', valor: 60000 })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erro).toContain('não pode ser maior que o subtotal')
  })

  it('10% sobre R$ 1.000,00 -> R$ 900,00', () => {
    const r = calcularTotaisVenda([item(1, 100000)], { tipo: 'PERCENTUAL', valor: 1000 })
    expect(r).toMatchObject({ ok: true, descontoAdicionalCentavos: 10000, totalCentavos: 90000 })
  })

  it('em %: 0 e 100 valem; acima de 100 é erro', () => {
    expect(calcularDescontoAdicional(10000, { tipo: 'PERCENTUAL', valor: 0 })).toEqual({ ok: true, centavos: 0 })
    expect(calcularDescontoAdicional(10000, { tipo: 'PERCENTUAL', valor: 10000 })).toEqual({ ok: true, centavos: 10000 })
    expect(calcularDescontoAdicional(10000, { tipo: 'PERCENTUAL', valor: 10001 }).ok).toBe(false)
  })

  it('em R$: o limite é o subtotal (igual vale, 1 centavo a mais não)', () => {
    expect(calcularDescontoAdicional(10000, { tipo: 'VALOR', valor: 10000 })).toEqual({ ok: true, centavos: 10000 })
    expect(calcularDescontoAdicional(10000, { tipo: 'VALOR', valor: 10001 }).ok).toBe(false)
  })

  it('o desconto adicional incide sobre o que sobra depois do desconto dos itens', () => {
    // 1.000,00 com 200,00 de desconto no item; 10% sobre os 800,00 que restam = 80,00
    const r = calcularTotaisVenda([item(1, 100000, 20000)], { tipo: 'PERCENTUAL', valor: 1000 })
    expect(r).toMatchObject({ ok: true, descontoItensCentavos: 20000, descontoAdicionalCentavos: 8000, descontoCentavos: 28000, totalCentavos: 72000 })
    // e em R$ nao pode passar dos 800,00 que restam
    expect(calcularTotaisVenda([item(1, 100000, 20000)], { tipo: 'VALOR', valor: 80001 }).ok).toBe(false)
  })

  it('desconto maior que o total do próprio item é erro', () => {
    expect(calcularTotaisVenda([item(2, 1000, 2001)]).ok).toBe(false)
  })

  it('percentual sobre o subtotal para o limite do vendedor', () => {
    const r = calcularTotaisVenda([item(1, 100000)], { tipo: 'PERCENTUAL', valor: 1250 })
    expect(r.ok && r.descontoPct).toBeCloseTo(12.5, 6)
  })
})

describe('datas e vencimentos', () => {
  it('soma dias de calendário, inclusive virando mês e ano', () => {
    expect(somarDiasISO('2026-01-31', 30)).toBe('2026-03-02')
    expect(somarDiasISO('2026-12-15', 30)).toBe('2027-01-14')
  })

  it('vencimentos a cada N dias a partir da venda', () => {
    expect(calcularVencimentosPorIntervalo('2026-11-23', 3, 30)).toEqual(['2026-12-23', '2027-01-22', '2027-02-21'])
    expect(calcularVencimentosPorIntervalo('2026-11-23', 2, 15)).toEqual(['2026-12-08', '2026-12-23'])
  })
})

describe('forma imediata', () => {
  it('Dinheiro/PIX entram como recebidos, sem parcelas', () => {
    const r = calcularPagamento({ forma: forma({ tipo: 'PIX' }), valorCentavos: 20000, parcelas: 5 }, '2026-11-23')
    expect(r).toMatchObject({ ok: true, pagamento: { comportamento: 'IMEDIATO', parcelas: 1, recebidoCentavos: 20000 } })
  })

  it('valor zero é erro', () => {
    expect(calcularPagamento({ forma: forma({}), valorCentavos: 0, parcelas: 1 }, '2026-11-23').ok).toBe(false)
  })
})

describe('cartão (9.4)', () => {
  const credito = forma({ tipo: 'CARTAO_CREDITO', nome: 'CARTÃO DE CRÉDITO' })
  const debito = forma({ tipo: 'CARTAO_DEBITO', nome: 'CARTÃO DE DÉBITO' })

  it('R$ 900,00 no crédito em 6x com taxa de 8,99% -> 1 recebível líquido de R$ 819,09 (e nenhuma parcela do cliente)', () => {
    const r = calcularPagamento({ forma: credito, valorCentavos: 90000, parcelas: 6, bandeira: visa }, '2026-11-23')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.pagamento).toMatchObject({
      comportamento: 'OPERADORA',
      modalidade: 'CREDITO',
      parcelas: 6,
      bandeiraNome: 'VISA',
      taxaBp: 899,
      brutoCentavos: 90000,
      taxaCentavos: 8091,
      liquidoCentavos: 81909,
      vencimento: '2027-05-22' // 23/11/2026 + 180 dias
    })
    // nao tem parcelas do cliente: so a estrutura da operadora
    expect(r.pagamento).not.toHaveProperty('valoresParcelas')
    const resumo = resumirPagamentos(90000, [r.pagamento])
    expect(resumo.aReceberClienteCentavos).toBe(0)
    expect(resumo.aReceberOperadoraCentavos).toBe(81909)
  })

  it('débito usa a taxa e o prazo do débito, sempre 1x', () => {
    const r = calcularPagamento({ forma: debito, valorCentavos: 10000, parcelas: 3, bandeira: visa }, '2026-11-23')
    expect(r).toMatchObject({ ok: true, pagamento: { modalidade: 'DEBITO', parcelas: 1, taxaBp: 199, brutoCentavos: 10000, taxaCentavos: 199, liquidoCentavos: 9801, vencimento: '2026-11-24' } })
  })

  it('exige a bandeira e a faixa cadastrada', () => {
    expect(calcularPagamento({ forma: credito, valorCentavos: 10000, parcelas: 1 }, '2026-11-23').ok).toBe(false)
    const semFaixa = calcularPagamento({ forma: credito, valorCentavos: 10000, parcelas: 5, bandeira: visa }, '2026-11-23')
    expect(!semFaixa.ok && semFaixa.erro).toContain('5x')
    expect(calcularPagamento({ forma: debito, valorCentavos: 10000, parcelas: 1, bandeira: { ...visa, aceitaDebito: false } }, '2026-11-23').ok).toBe(false)
    expect(calcularPagamento({ forma: credito, valorCentavos: 10000, parcelas: 1, bandeira: { ...visa, aceitaCredito: false } }, '2026-11-23').ok).toBe(false)
  })

  it('desconto ao cliente da faixa: sem efeito quando 0; quando > 0 reduz o bruto antes da taxa', () => {
    const sem = calcularPagamento({ forma: credito, valorCentavos: 100000, parcelas: 6, bandeira: visa }, '2026-11-23')
    expect(sem).toMatchObject({ ok: true, pagamento: { descontoClienteCentavos: 0, brutoCentavos: 100000 } })
    // 12x: 5% de desconto ao cliente (R$ 50,00) e taxa de 12,99% sobre os R$ 950,00
    const com = calcularPagamento({ forma: credito, valorCentavos: 100000, parcelas: 12, bandeira: visa }, '2026-11-23')
    expect(com).toMatchObject({ ok: true, pagamento: { descontoClienteBp: 500, descontoClienteCentavos: 5000, brutoCentavos: 95000, taxaCentavos: 12341, liquidoCentavos: 82659 } })
  })

  it('o snapshot não muda quando a taxa da bandeira muda depois (a conta usa o que foi passado)', () => {
    const antes = calcularPagamento({ forma: credito, valorCentavos: 90000, parcelas: 6, bandeira: visa }, '2026-11-23')
    const bandeiraNova = { ...visa, faixas: visa.faixas.map((f) => ({ ...f, taxaBp: 1500 })) }
    const depois = calcularPagamento({ forma: credito, valorCentavos: 90000, parcelas: 6, bandeira: bandeiraNova }, '2026-11-23')
    expect(antes.ok && antes.pagamento.comportamento === 'OPERADORA' && antes.pagamento.liquidoCentavos).toBe(81909)
    expect(depois.ok && depois.pagamento.comportamento === 'OPERADORA' && depois.pagamento.liquidoCentavos).toBe(76500)
  })

  it('líquido estimado para o select de parcelas', () => {
    expect(liquidoEstimado(90000, 899)).toBe(81909)
    expect(liquidoEstimado(100000, 1299, 500)).toBe(82659)
  })
})

describe('promissória (9.3)', () => {
  const promissoria = forma({ tipo: 'PROMISSORIA', nome: 'PROMISSÓRIA', maxParcelas: 6, intervaloDias: 30 })

  it('R$ 900,00 com acréscimo de 5% em 3x -> 3 x R$ 315,00', () => {
    const r = calcularPagamento({ forma: { ...promissoria, acrescimoTipo: 'PERCENTUAL', acrescimoValor: 500 }, valorCentavos: 90000, parcelas: 3 }, '2026-11-23')
    expect(r.ok).toBe(true)
    if (!r.ok || r.pagamento.comportamento !== 'PARCELADO_CLIENTE') return
    expect(r.pagamento.acrescimoCentavos).toBe(4500)
    expect(r.pagamento.totalComAcrescimoCentavos).toBe(94500)
    expect(r.pagamento.valoresParcelas).toEqual([31500, 31500, 31500])
    expect(r.pagamento.vencimentos).toEqual(['2026-12-23', '2027-01-22', '2027-02-21'])
  })

  it('R$ 1.000,00 em 3x sem acréscimo -> 333,34 + 333,33 + 333,33 (a diferença fica na primeira)', () => {
    const r = calcularPagamento({ forma: promissoria, valorCentavos: 100000, parcelas: 3 }, '2026-11-23')
    expect(r.ok && r.pagamento.comportamento === 'PARCELADO_CLIENTE' && r.pagamento.valoresParcelas).toEqual([33334, 33333, 33333])
    expect(r.ok && r.pagamento.comportamento === 'PARCELADO_CLIENTE' && r.pagamento.acrescimoCentavos).toBe(0)
  })

  it('acréscimo em R$ é somado UMA vez ao total, não por parcela', () => {
    const r = calcularPagamento({ forma: { ...promissoria, acrescimoTipo: 'VALOR', acrescimoValor: 3000 }, valorCentavos: 90000, parcelas: 3 }, '2026-11-23')
    expect(r.ok && r.pagamento.comportamento === 'PARCELADO_CLIENTE' && r.pagamento.totalComAcrescimoCentavos).toBe(93000)
    expect(r.ok && r.pagamento.comportamento === 'PARCELADO_CLIENTE' && r.pagamento.valoresParcelas).toEqual([31000, 31000, 31000])
  })

  it('o acréscimo incide sobre o valor da PRÓPRIA linha (a entrada fica de fora)', () => {
    // venda de R$ 1.000,00: R$ 400,00 de entrada em dinheiro + R$ 600,00 na promissória com 10%
    const entrada = calcularPagamento({ forma: forma({ tipo: 'DINHEIRO' }), valorCentavos: 40000, parcelas: 1 }, '2026-11-23')
    const prom = calcularPagamento({ forma: { ...promissoria, acrescimoTipo: 'PERCENTUAL', acrescimoValor: 1000 }, valorCentavos: 60000, parcelas: 2 }, '2026-11-23')
    expect(entrada.ok && prom.ok).toBe(true)
    if (!entrada.ok || !prom.ok) return
    expect(prom.pagamento.comportamento === 'PARCELADO_CLIENTE' && prom.pagamento.acrescimoCentavos).toBe(6000)
    const resumo = resumirPagamentos(100000, [entrada.pagamento, prom.pagamento])
    expect(resumo).toMatchObject({ alocadoCentavos: 100000, acrescimoCentavos: 6000, totalClienteCentavos: 106000, recebidoAgoraCentavos: 40000, aReceberClienteCentavos: 66000 })
  })

  it('respeita o máximo de parcelas e o intervalo configurados', () => {
    expect(calcularPagamento({ forma: promissoria, valorCentavos: 100000, parcelas: 7 }, '2026-11-23').ok).toBe(false)
    const r = calcularPagamento({ forma: { ...promissoria, intervaloDias: 15 }, valorCentavos: 100000, parcelas: 2 }, '2026-11-23')
    expect(r.ok && r.pagamento.comportamento === 'PARCELADO_CLIENTE' && r.pagamento.vencimentos).toEqual(['2026-12-08', '2026-12-23'])
  })

  it('boleto e cheque funcionam como a promissória', () => {
    for (const tipo of ['BOLETO', 'CHEQUE'] as const) {
      const r = calcularPagamento({ forma: forma({ tipo, maxParcelas: 4, acrescimoTipo: 'PERCENTUAL', acrescimoValor: 200 }), valorCentavos: 50000, parcelas: 2 }, '2026-11-23')
      expect(r.ok && r.pagamento.comportamento === 'PARCELADO_CLIENTE' && r.pagamento.valoresParcelas).toEqual([25500, 25500])
    }
  })

  it('a soma das parcelas é sempre o total com acréscimo', () => {
    const r = calcularPagamento({ forma: { ...promissoria, maxParcelas: 12, acrescimoTipo: 'PERCENTUAL', acrescimoValor: 899 }, valorCentavos: 100001, parcelas: 7 }, '2026-11-23')
    expect(r.ok).toBe(true)
    if (!r.ok || r.pagamento.comportamento !== 'PARCELADO_CLIENTE') return
    expect(r.pagamento.valoresParcelas.reduce((a, b) => a + b, 0)).toBe(r.pagamento.totalComAcrescimoCentavos)
  })

  it('descreve o acréscimo de forma explícita, com o % exato', () => {
    expect(descreverAcrescimo({ acrescimoTipo: 'PERCENTUAL', acrescimoValor: 899, acrescimoCentavos: 8091 })).toBe('Acréscimo de 8,99% (R$ 80,91)')
    expect(descreverAcrescimo({ acrescimoTipo: 'VALOR', acrescimoValor: 2000, acrescimoCentavos: 2000 })).toBe('Acréscimo de R$ 20,00')
    expect(descreverAcrescimo({ acrescimoTipo: null, acrescimoValor: 0, acrescimoCentavos: 0 })).toBe('Sem acréscimo')
  })
})
