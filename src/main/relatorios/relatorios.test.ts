import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { formatarMoeda } from './htmlUtils'
import {
  montarHtmlFluxoCaixa,
  montarHtmlInadimplencia,
  montarHtmlLucroPrejuizo,
  montarHtmlReceitasDespesas
} from './financeiroHtml'
import { calcularCurvaAbc, montarHtmlCurvaAbc, montarHtmlEstoque } from './estoqueHtml'
import { montarHtmlComissoes, montarHtmlRankingVendedores, montarHtmlVendasPorVendedor } from './vendedoresHtml'
import { montarHtmlAniversariantes } from './aniversariantesHtml'
import { montarHtmlComprovanteVenda, montarHtmlCarneParcelas } from './vendaHtml'
import { montarHtmlProtocoloSaida } from './protocoloSaidaHtml'
import { montarHtmlOrdemServico } from './ordemServicoHtml'
import {
  ANIVERSARIANTES_EXEMPLO,
  COMISSOES_EXEMPLO,
  EMPRESA_EXEMPLO as EMPRESA,
  ESTOQUE_EXEMPLO,
  FLUXO_EXEMPLO,
  INADIMPLENCIA_EXEMPLO,
  LUCRO_EXEMPLO,
  OS_EXEMPLO,
  PERIODO_EXEMPLO as PERIODO,
  RANKING_EXEMPLO,
  RECEITA_EXEMPLO,
  VENDAS_VENDEDOR_EXEMPLO,
  VENDA_EXEMPLO
} from './relatoriosExemplo'

/**
 * Testes de caracterizacao: fixam O QUE cada relatorio imprime (titulos,
 * valores, linhas, mensagem de lista vazia), nao COMO. A troca de visual dos
 * relatorios tem de manter todos verdes - e isso que garante que os dados
 * impressos nao mudaram.
 */

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-07T15:00:00Z'))
})
afterAll(() => {
  vi.useRealTimers()
})

/** Texto visivel, sem tags e com espacos normalizados (NBSP do Intl incluso). */
function textoVisivel(html: string): string {
  const corpo = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<title>[\s\S]*?<\/title>/gi, '')
  return corpo
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;| /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function moeda(centavos: number): string {
  return formatarMoeda(centavos).replace(/ /g, ' ')
}

function esperaTodos(html: string, trechos: string[]): void {
  const t = textoVisivel(html)
  for (const trecho of trechos) expect(t, `faltou "${trecho}"`).toContain(trecho)
}

describe('relatorios financeiros', () => {
  it('Receitas e despesas: totais, cada lancamento e o periodo', () => {
    const html = montarHtmlReceitasDespesas(FLUXO_EXEMPLO, EMPRESA, PERIODO)
    esperaTodos(html, [
      'Receitas e Despesas',
      '01/10/2026',
      '31/10/2026',
      moeda(384990),
      moeda(242050),
      moeda(142940),
      ...FLUXO_EXEMPLO.lancamentos.map((l) => moeda(l.valorCentavos))
    ])
    // Texto da origem e escapado, nunca vira tag.
    expect(html).toContain('Compra de lentes &lt;Lab &amp; Cia&gt;')
    expect(textoVisivel(html)).toContain('5')
  })

  it('Fluxo de caixa: saldo acumulado linha a linha', () => {
    const html = montarHtmlFluxoCaixa(FLUXO_EXEMPLO, EMPRESA, PERIODO)
    esperaTodos(html, ['Fluxo de Caixa', moeda(45000), moeda(45000 - 180000), moeda(45000 - 180000 + 129990), moeda(142940)])
  })

  it('Lucro / Prejuizo: os dois regimes e a margem por produto', () => {
    const html = montarHtmlLucroPrejuizo(LUCRO_EXEMPLO, EMPRESA, PERIODO)
    esperaTodos(html, [
      'Lucro / Prejuízo',
      moeda(142940),
      moeda(-40000),
      'Armação Ray-Ban RB5154',
      'Lente multifocal Varilux',
      moeda(90000),
      moeda(17000)
    ])
  })

  it('Lucro / Prejuizo sem vendas mostra a mensagem de lista vazia', () => {
    const html = montarHtmlLucroPrejuizo({ ...LUCRO_EXEMPLO, margemPorProduto: [] }, EMPRESA, PERIODO)
    esperaTodos(html, ['Nenhuma venda no período.'])
  })

  it('Inadimplencia: valor em aberto descontando o que ja foi recebido', () => {
    const html = montarHtmlInadimplencia(INADIMPLENCIA_EXEMPLO, EMPRESA)
    esperaTodos(html, [
      'Inadimplência',
      'Maria Aparecida Souza',
      'José Carlos Lima',
      'Ana Paula Ribeiro',
      moeda(30000),
      moeda(25000 + 30000 + 15000),
      '2/5'
    ])
    esperaTodos(montarHtmlInadimplencia([], EMPRESA), ['Nenhuma parcela vencida.'])
  })
})

describe('relatorios de estoque', () => {
  it('Posicao de estoque: saldo, minimo e situacao de cada produto', () => {
    const html = montarHtmlEstoque('Posição de Estoque', ESTOQUE_EXEMPLO, EMPRESA)
    esperaTodos(html, ['Posição de Estoque', 'Armação Ray-Ban RB5154', 'Normal', 'Abaixo do mínimo', 'Zerado', 'Ray-Ban'])
    esperaTodos(montarHtmlEstoque('Produtos Abaixo do Mínimo', [], EMPRESA), ['Nenhum produto encontrado.'])
  })

  it('Curva ABC: classe e percentual acumulado', () => {
    const curva = calcularCurvaAbc(LUCRO_EXEMPLO.margemPorProduto)
    expect(curva.map((c) => c.classe)).toEqual(['A', 'B', 'C', 'C'])
    const html = montarHtmlCurvaAbc(curva, EMPRESA, PERIODO)
    esperaTodos(html, ['Curva ABC de Produtos', '01/10/2026', '48,5%', moeda(180000)])
  })
})

describe('relatorios de vendedores', () => {
  it('Vendas por vendedor: quantidade e total', () => {
    const html = montarHtmlVendasPorVendedor(VENDAS_VENDEDOR_EXEMPLO, EMPRESA, PERIODO)
    esperaTodos(html, ['Vendas por Vendedor', 'Beto Souza', 'Cida Moraes', '19', moeda(845000 + 512300)])
  })

  it('Ranking: posicao e total vendido', () => {
    const html = montarHtmlRankingVendedores(RANKING_EXEMPLO, EMPRESA, PERIODO)
    esperaTodos(html, ['Ranking de Vendedores', 'Davi Nunes', moeda(98000)])
    esperaTodos(montarHtmlRankingVendedores([], EMPRESA, PERIODO), ['Nenhuma venda no período.'])
  })

  it('Comissoes: total sem as canceladas e situacao por linha', () => {
    const html = montarHtmlComissoes(COMISSOES_EXEMPLO, EMPRESA, PERIODO)
    esperaTodos(html, ['Comissões', moeda(2250 + 6500), 'Liberada', 'Provisionada', 'Cancelada', '5%'])
  })
})

describe('outros documentos', () => {
  it('Aniversariantes: mes e clientes', () => {
    const html = montarHtmlAniversariantes(ANIVERSARIANTES_EXEMPLO, EMPRESA, 11)
    esperaTodos(html, ['Aniversariantes', 'Maria Aparecida Souza', '21/11/1975', '123.456.789-00'])
    esperaTodos(montarHtmlAniversariantes([], EMPRESA, null), ['Todos os meses', 'Nenhum aniversariante encontrado.'])
  })

  it('Comprovante de venda: itens, totais e pagamentos', () => {
    const html = montarHtmlComprovanteVenda(VENDA_EXEMPLO, EMPRESA)
    esperaTodos(html, [
      'Comprovante de Venda 2026-00007',
      'Maria Aparecida Souza',
      'Beto Souza',
      '05/11/2026',
      'Lente multifocal Varilux',
      moeda(130000),
      moeda(10000),
      moeda(120000),
      'PROMISSÓRIA em 4x',
      'Assinatura do cliente'
    ])
  })

  it('Carne: um canhoto por parcela', () => {
    const html = montarHtmlCarneParcelas(VENDA_EXEMPLO, EMPRESA)
    esperaTodos(html, ['Parcela 1/4', 'Parcela 4/4', '05/03/2027', moeda(25000)])
    expect(textoVisivel(html).match(/Parcela \d\/4/g)).toHaveLength(4)
    esperaTodos(montarHtmlCarneParcelas({ ...VENDA_EXEMPLO, parcelas: [] }, EMPRESA), ['Esta venda não possui parcelas.'])
  })

  it('Protocolo de saida: filtro e ordens', () => {
    const html = montarHtmlProtocoloSaida([OS_EXEMPLO], EMPRESA, { dataInicio: '2026-11-01', dataFim: '2026-11-07', situacao: 'LABORATÓRIO' })
    esperaTodos(html, ['Protocolo de Saída', '01/11/2026', 'Situação: LABORATÓRIO', 'Maria Aparecida Souza', '2026-00042', 'Lab Visão', '06/11/2026'])
    esperaTodos(montarHtmlProtocoloSaida([], EMPRESA, {}), ['Nenhuma ordem de serviço encontrada.'])
  })

  it('Ordem de servico: dados da OS e receita com DP', () => {
    const html = montarHtmlOrdemServico(OS_EXEMPLO, RECEITA_EXEMPLO, EMPRESA)
    esperaTodos(html, [
      'Ordem de Serviço 2026-00042',
      'Rua das Flores',
      'Lab Visão',
      '12/11/2026',
      'Cliente prefere retirar à tarde.',
      'DNP',
      'DP',
      '31,5',
      '-1,25',
      '+2,00',
      'MULTIFOCAL',
      'Joana Lima',
      'Assinatura do cliente'
    ])
    // A altura (legado) nao sai mais no PDF.
    expect(textoVisivel(html)).not.toMatch(/altura/i)
    esperaTodos(montarHtmlOrdemServico(OS_EXEMPLO, null, EMPRESA), ['Sem receita óptica vinculada.'])
  })
})
