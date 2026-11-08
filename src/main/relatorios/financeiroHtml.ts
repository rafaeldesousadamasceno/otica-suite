import type { ContaReceber, Empresa, FluxoCaixaResultado, LancamentoEntry, LucroPrejuizoResultado } from '@shared/types'
import { PALETA_VIZ, formatarBRLCompacto } from '@shared/graficos'
import { hojeLocal } from '@shared/data'
import { formatarDataBr, formatarMoeda, formatarPercentual, montarFiltroPeriodo, montarRelatorioTabela, texto } from './htmlUtils'
import { COR_CATEGORIA, LARGURA_UTIL, ROTULO_CATEGORIA, badge, type Tom } from './layout'
import { svgBarrasH, svgColunas, svgLinha, svgRosca } from './svgCharts'

type Periodo = { dataInicio: string; dataFim: string }

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const COR_RECEITAS = PALETA_VIZ.categorica[0]
const COR_DESPESAS = PALETA_VIZ.categorica[1]

/** Largura do SVG dentro do card de grafico (desconta o respiro interno do card). */
const larguraGrafico = (orientacao: 'retrato' | 'paisagem', metade = false): number =>
  Math.round((metade ? (LARGURA_UTIL[orientacao] - 10) / 2 : LARGURA_UTIL[orientacao]) - 24)

const tomResultado = (centavos: number): Tom => (centavos >= 0 ? 'ok' : 'perigo')

function diasEntre(inicio: string, fim: string): number {
  const [a1, m1, d1] = inicio.split('-').map(Number)
  const [a2, m2, d2] = fim.split('-').map(Number)
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000)
}

interface Balde {
  chave: string
  rotulo: string
}

/**
 * Baldes continuos do periodo: por dia ate 31 dias, por mes acima disso.
 * Dia sem lancamento continua aparecendo (com zero), para o grafico nao
 * esconder os buracos.
 */
function baldesDoPeriodo(periodo: Periodo): { porDia: boolean; baldes: Balde[] } {
  const porDia = diasEntre(periodo.dataInicio, periodo.dataFim) <= 31
  const baldes: Balde[] = []
  const [ano, mes, dia] = periodo.dataInicio.split('-').map(Number)
  const cursor = new Date(Date.UTC(ano, mes - 1, porDia ? dia : 1))
  const fim = periodo.dataFim
  for (let i = 0; i < 1200; i++) {
    const iso = cursor.toISOString().slice(0, 10)
    if (porDia ? iso > fim : iso.slice(0, 7) > fim.slice(0, 7)) break
    if (porDia) {
      baldes.push({ chave: iso, rotulo: `${iso.slice(8, 10)}/${iso.slice(5, 7)}` })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    } else {
      baldes.push({ chave: iso.slice(0, 7), rotulo: `${MESES_CURTOS[cursor.getUTCMonth()]}/${iso.slice(2, 4)}` })
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }
  }
  return { porDia, baldes }
}

function somarPorBalde(lancamentos: LancamentoEntry[], periodo: Periodo) {
  const { porDia, baldes } = baldesDoPeriodo(periodo)
  const indice = new Map(baldes.map((b, i) => [b.chave, i]))
  const receitas = baldes.map(() => 0)
  const despesas = baldes.map(() => 0)
  for (const l of lancamentos) {
    const i = indice.get(porDia ? l.data : l.data.slice(0, 7))
    if (i === undefined) continue
    if (l.tipo === 'RECEITA') receitas[i] += l.valorCentavos
    else despesas[i] += l.valorCentavos
  }
  return { porDia, baldes, receitas, despesas }
}

const badgeTipo = (l: LancamentoEntry): string =>
  badge(l.tipo === 'RECEITA' ? 'Receita' : 'Despesa', l.tipo === 'RECEITA' ? 'destaque' : 'neutro')

function cardsCaixa(resultado: FluxoCaixaResultado, rotuloSaldo: string) {
  return [
    { label: 'Total Receitas', valor: formatarMoeda(resultado.totalReceitasCentavos), tom: 'destaque' as const },
    { label: 'Total Despesas', valor: formatarMoeda(resultado.totalDespesasCentavos) },
    { label: rotuloSaldo, valor: formatarMoeda(resultado.saldoCentavos), tom: tomResultado(resultado.saldoCentavos) }
  ]
}

/** RF-12: "Receitas e despesas" - lista simples dos lancamentos do periodo (preserva `Receitas_Despesas.jasper`). */
export function montarHtmlReceitasDespesas(resultado: FluxoCaixaResultado, empresa: Empresa, periodo: Periodo): string {
  const agrupado = somarPorBalde(resultado.lancamentos, periodo)

  return montarRelatorioTabela({
    titulo: 'Receitas e Despesas',
    subtitulo: 'Lançamentos financeiros do período (regime de caixa).',
    empresa,
    filtroTexto: montarFiltroPeriodo(periodo.dataInicio, periodo.dataFim),
    resumo: cardsCaixa(resultado, 'Saldo'),
    graficos: [
      {
        titulo: agrupado.porDia ? 'Receitas e despesas por dia' : 'Receitas e despesas por mês',
        html: svgColunas({
          categorias: agrupado.baldes.map((b) => b.rotulo),
          series: [
            { nome: 'Receitas', cor: COR_RECEITAS, valores: agrupado.receitas },
            { nome: 'Despesas', cor: COR_DESPESAS, valores: agrupado.despesas }
          ],
          formatarEixo: formatarBRLCompacto,
          largura: larguraGrafico('paisagem'),
          descricao: 'Receitas e despesas ao longo do período'
        })
      }
    ],
    tituloTabela: 'Lançamentos',
    colunas: [
      { label: 'Data' },
      { label: 'Tipo' },
      { label: 'Categoria' },
      { label: 'Descrição' },
      { label: 'Valor', alinhar: 'direita' }
    ],
    linhas: resultado.lancamentos.map((l) => [
      formatarDataBr(l.data),
      badgeTipo(l),
      texto(l.categoria),
      texto(l.descricao),
      formatarMoeda(l.valorCentavos)
    ])
  })
}

/** RF-12: "Fluxo de caixa" - mesmos lancamentos, com destaque para o saldo acumulado do periodo. */
export function montarHtmlFluxoCaixa(resultado: FluxoCaixaResultado, empresa: Empresa, periodo: Periodo): string {
  let acumulado = 0
  const linhas = resultado.lancamentos.map((l) => {
    acumulado += l.tipo === 'RECEITA' ? l.valorCentavos : -l.valorCentavos
    return [formatarDataBr(l.data), badgeTipo(l), texto(l.descricao), formatarMoeda(l.valorCentavos), formatarMoeda(acumulado)]
  })

  const agrupado = somarPorBalde(resultado.lancamentos, periodo)
  let saldo = 0
  const pontos = agrupado.baldes.map((b, i) => {
    saldo += agrupado.receitas[i] - agrupado.despesas[i]
    return { rotulo: b.rotulo, valor: saldo }
  })

  return montarRelatorioTabela({
    titulo: 'Fluxo de Caixa',
    subtitulo: 'Entradas e saídas com o saldo acumulado no período.',
    empresa,
    filtroTexto: montarFiltroPeriodo(periodo.dataInicio, periodo.dataFim),
    resumo: cardsCaixa(resultado, 'Saldo do Período'),
    graficos:
      resultado.lancamentos.length > 0
        ? [
            {
              titulo: agrupado.porDia ? 'Saldo acumulado dia a dia' : 'Saldo acumulado mês a mês',
              html: svgLinha({
                pontos,
                cor: COR_RECEITAS,
                formatarEixo: formatarBRLCompacto,
                formatarValor: formatarMoeda,
                largura: larguraGrafico('paisagem'),
                descricao: 'Saldo acumulado ao longo do período'
              })
            }
          ]
        : [],
    tituloTabela: 'Lançamentos',
    colunas: [
      { label: 'Data' },
      { label: 'Tipo' },
      { label: 'Descrição' },
      { label: 'Valor', alinhar: 'direita' },
      { label: 'Saldo Acumulado', alinhar: 'direita' }
    ],
    linhas
  })
}

/** RF-12: "Lucro / Prejuízo" - os dois regimes (RN-12) lado a lado, mais margem por produto. */
export function montarHtmlLucroPrejuizo(resultado: LucroPrejuizoResultado, empresa: Empresa, periodo: Periodo): string {
  const receitaProdutos = resultado.margemPorProduto.reduce((s, m) => s + m.receitaCentavos, 0)
  const margemProdutos = resultado.margemPorProduto.reduce((s, m) => s + m.margemCentavos, 0)

  const porCategoria = new Map<string, number>()
  for (const m of resultado.margemPorProduto) {
    porCategoria.set(m.categoria, (porCategoria.get(m.categoria) ?? 0) + m.receitaCentavos)
  }
  const topMargem = [...resultado.margemPorProduto].sort((a, b) => b.margemCentavos - a.margemCentavos).slice(0, 8)

  return montarRelatorioTabela({
    titulo: 'Lucro / Prejuízo',
    subtitulo: 'Resultado pelos dois regimes e margem bruta por produto.',
    empresa,
    filtroTexto: montarFiltroPeriodo(periodo.dataInicio, periodo.dataFim),
    resumo: [
      {
        label: 'Resultado (Caixa)',
        valor: formatarMoeda(resultado.caixa.resultadoCentavos),
        tom: tomResultado(resultado.caixa.resultadoCentavos),
        detalhe: `Receitas ${formatarMoeda(resultado.caixa.receitasCentavos)} · Despesas ${formatarMoeda(resultado.caixa.despesasCentavos)}`
      },
      {
        label: 'Resultado (Competência)',
        valor: formatarMoeda(resultado.competencia.resultadoCentavos),
        tom: tomResultado(resultado.competencia.resultadoCentavos),
        detalhe: `Receitas ${formatarMoeda(resultado.competencia.receitasCentavos)} · Despesas ${formatarMoeda(resultado.competencia.despesasCentavos)}`
      },
      {
        label: 'Margem bruta dos produtos',
        valor: receitaProdutos > 0 ? formatarPercentual((margemProdutos / receitaProdutos) * 100) : '—',
        tom: 'destaque',
        detalhe: `${formatarMoeda(margemProdutos)} sobre ${formatarMoeda(receitaProdutos)} vendidos`
      }
    ],
    graficosLadoALado: true,
    graficos:
      resultado.margemPorProduto.length > 0
        ? [
            {
              titulo: 'Receita por categoria',
              html: svgRosca({
                fatias: [...porCategoria.entries()].map(([categoria, valor]) => ({
                  rotulo: ROTULO_CATEGORIA[categoria] ?? categoria,
                  valor,
                  cor: COR_CATEGORIA[categoria] ?? PALETA_VIZ.outros
                })),
                formatarValor: formatarMoeda,
                centro: { valor: formatarBRLCompacto(receitaProdutos), rotulo: 'vendidos' },
                descricao: 'Participação de cada categoria na receita dos produtos'
              })
            },
            {
              titulo: 'Produtos com maior margem',
              html: svgBarrasH({
                itens: topMargem.map((m) => ({
                  rotulo: m.descricao,
                  valor: m.margemCentavos,
                  cor: COR_CATEGORIA[m.categoria] ?? PALETA_VIZ.outros
                })),
                formatarValor: formatarMoeda,
                largura: larguraGrafico('paisagem', true),
                descricao: 'Os produtos que mais deixaram margem no período'
              })
            }
          ]
        : [],
    tituloTabela: 'Margem por produto',
    colunas: [
      { label: 'Produto' },
      { label: 'Qtd', alinhar: 'direita' },
      { label: 'Receita', alinhar: 'direita' },
      { label: 'Custo', alinhar: 'direita' },
      { label: 'Margem', alinhar: 'direita' }
    ],
    linhas: resultado.margemPorProduto.map((m) => [
      texto(m.descricao),
      texto(m.quantidadeVendida),
      formatarMoeda(m.receitaCentavos),
      formatarMoeda(m.custoCentavos),
      formatarMoeda(m.margemCentavos)
    ]),
    linhaVazia: 'Nenhuma venda no período.',
    rodapeTexto: 'Margem calculada com o custo cadastrado do produto.'
  })
}

/** Faixas de atraso da inadimplencia, da mais recente para a mais antiga. */
const FAIXAS_ATRASO = [
  { rotulo: '1 a 30 dias', ate: 30 },
  { rotulo: '31 a 60 dias', ate: 60 },
  { rotulo: '61 a 90 dias', ate: 90 },
  { rotulo: 'Mais de 90 dias', ate: Infinity }
]

/** RF-12: "Inadimplência" - parcelas vencidas e ainda em aberto. */
export function montarHtmlInadimplencia(parcelas: ContaReceber[], empresa: Empresa, hoje: string = hojeLocal()): string {
  const emAberto = (p: ContaReceber): number => p.valorCentavos - p.valorRecebidoCentavos
  const totalCentavos = parcelas.reduce((soma, p) => soma + emAberto(p), 0)
  const atraso = (p: ContaReceber): number => Math.max(0, diasEntre(p.vencimento, hoje))

  const porFaixa = FAIXAS_ATRASO.map(() => 0)
  for (const p of parcelas) {
    const i = FAIXAS_ATRASO.findIndex((f) => atraso(p) <= f.ate)
    porFaixa[i === -1 ? FAIXAS_ATRASO.length - 1 : i] += emAberto(p)
  }
  // Rampa ordinal: quanto mais antigo o atraso, mais escuro.
  const coresFaixa = [PALETA_VIZ.ordinal[0], PALETA_VIZ.ordinal[1], PALETA_VIZ.ordinal[2], '#104281']
  const clientes = new Set(parcelas.map((p) => p.clienteId)).size

  return montarRelatorioTabela({
    titulo: 'Inadimplência',
    subtitulo: `Parcelas vencidas e ainda em aberto em ${formatarDataBr(hoje)}.`,
    empresa,
    resumo: [
      { label: 'Parcelas vencidas', valor: String(parcelas.length), tom: 'atencao', detalhe: `${clientes} cliente(s)` },
      { label: 'Total em aberto', valor: formatarMoeda(totalCentavos), tom: parcelas.length ? 'perigo' : 'ok' }
    ],
    graficos:
      parcelas.length > 0
        ? [
            {
              titulo: 'Valor em aberto por tempo de atraso',
              html: svgBarrasH({
                itens: FAIXAS_ATRASO.map((f, i) => ({ rotulo: f.rotulo, valor: porFaixa[i], cor: coresFaixa[i] })),
                formatarValor: formatarMoeda,
                largura: larguraGrafico('paisagem'),
                descricao: 'Valor em aberto agrupado pelo tempo de atraso'
              })
            }
          ]
        : [],
    tituloTabela: 'Parcelas',
    colunas: [
      { label: 'Cliente' },
      { label: 'Venda' },
      { label: 'Vendedor' },
      { label: 'Parcela' },
      { label: 'Vencimento' },
      { label: 'Dias em atraso', alinhar: 'direita' },
      { label: 'Valor', alinhar: 'direita' }
    ],
    linhas: parcelas.map((p) => [
      texto(p.clienteNome),
      texto(p.vendaNumero),
      texto(p.vendedorNome),
      `${p.parcela}/${p.totalParcelas}`,
      formatarDataBr(p.vencimento),
      String(atraso(p)),
      formatarMoeda(emAberto(p))
    ]),
    linhaVazia: 'Nenhuma parcela vencida.'
  })
}
