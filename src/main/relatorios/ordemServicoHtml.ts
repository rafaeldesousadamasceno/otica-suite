import type { Empresa, OrdemServico, ReceitaOptica } from '@shared/types'
import { formatarDataBr, texto } from './formatacao'
import { TOM_SITUACAO_OS, assinatura, badge, campos, montarDocumento, secao } from './layout'

/**
 * RF-12 CA4: o sistema anterior imprimia a OS/receita via um relatorio
 * Jasper ("OS.jasper"), que nao esta disponivel aqui (nem o arquivo .jrxml
 * nem uma engine Jasper embutida). Este arquivo NAO e uma copia pixel-a-
 * pixel daquele layout - e um layout novo, limpo, pensado para impressao em
 * A4, cobrindo os mesmos campos que o antigo trazia (cabecalho da otica,
 * dados da OS, receita optica OD/OE e assinatura do cliente na entrega).
 */

/** Grau com sinal e virgula: +0,75 / -1,25. */
function grau(valor: number | null): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—'
  const sinal = valor > 0 ? '+' : ''
  return `${sinal}${valor.toFixed(2).replace('.', ',')}`
}

/** Eixo, DNP e DP: sem sinal, com virgula decimal (31,5). */
function eixoOuMedida(valor: number | null): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—'
  return String(valor).replace('.', ',')
}

const ESTILO_RECEITA = `
  table.receita { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 10px; }
  table.receita th {
    background: var(--rel-base); color: var(--rel-tinta);
    font-size: 8px; font-weight: 700; letter-spacing: 0.05em; padding: 5px 4px; text-align: center;
  }
  table.receita thead tr:first-child th { font-size: 8.5px; }
  table.receita thead tr:first-child th:first-child { border-top-left-radius: 5px; }
  table.receita thead tr:first-child th:last-child { border-top-right-radius: 5px; }
  table.receita thead tr + tr th { background: var(--rel-suave); color: var(--rel-forte); }
  table.receita th.olho-oe, table.receita td.olho-oe { border-left: 2px solid var(--rel-borda); }
  table.receita td {
    padding: 6px 4px; text-align: center; font-size: 10.5px; font-variant-numeric: tabular-nums;
    border-bottom: 1px solid var(--rel-linha);
  }
  table.receita td.rotulo { text-align: left; font-weight: 700; color: var(--rel-forte); padding-left: 8px; }
`

function linhaGrau(rotulo: string, valores: (number | null)[][]): string {
  // valores: [OD (esf, cil, eixo, dnp, dp), OE (...)]
  const [od, oe] = valores
  const celulas = (olho: (number | null)[], classeOe: boolean): string =>
    olho
      .map((v, i) => {
        const conteudo = i < 2 ? grau(v) : eixoOuMedida(v)
        return `<td${classeOe && i === 0 ? ' class="olho-oe"' : ''}>${conteudo}</td>`
      })
      .join('')
  return `<tr><td class="rotulo">${rotulo}</td>${celulas(od, false)}${celulas(oe, true)}</tr>`
}

function montarTabelaReceita(receita: ReceitaOptica): string {
  const cabecalhoOlho = (oe: boolean): string =>
    ['ESF', 'CIL', 'EIXO', 'DNP', 'DP'].map((c, i) => `<th${oe && i === 0 ? ' class="olho-oe"' : ''}>${c}</th>`).join('')

  return `
    <table class="receita">
      <thead>
        <tr><th></th><th colspan="5">Olho Direito (OD)</th><th colspan="5" class="olho-oe">Olho Esquerdo (OE)</th></tr>
        <tr><th></th>${cabecalhoOlho(false)}${cabecalhoOlho(true)}</tr>
      </thead>
      <tbody>
        ${linhaGrau('Longe', [
          [receita.longeOdEsf, receita.longeOdCil, receita.longeOdEixo, receita.longeOdDnp, receita.longeOdDp],
          [receita.longeOeEsf, receita.longeOeCil, receita.longeOeEixo, receita.longeOeDnp, receita.longeOeDp]
        ])}
        ${linhaGrau('Perto', [
          [receita.pertoOdEsf, receita.pertoOdCil, receita.pertoOdEixo, receita.pertoOdDnp, receita.pertoOdDp],
          [receita.pertoOeEsf, receita.pertoOeCil, receita.pertoOeEixo, receita.pertoOeDnp, receita.pertoOeDp]
        ])}
        <tr><td class="rotulo">Adição</td><td colspan="10">${grau(receita.adicao)}</td></tr>
      </tbody>
    </table>
    ${campos([
      { rotulo: 'Tipo de lente', valor: texto(receita.tipoLente) },
      { rotulo: 'Tratamentos', valor: texto(receita.tratamentos) },
      { rotulo: 'Armação', valor: texto(receita.armacao) },
      { rotulo: 'Responsável', valor: texto(receita.profissionalNome) },
      { rotulo: 'Data do exame', valor: formatarDataBr(receita.dataExame) }
    ])}
  `
}

export function montarHtmlOrdemServico(os: OrdemServico, receita: ReceitaOptica | null, empresa: Empresa): string {
  const corpo = [
    secao(
      'Cliente',
      campos([
        { rotulo: 'Nome', valor: texto(os.clienteNome) },
        { rotulo: 'Celular', valor: texto(os.clienteCelular) }
      ])
    ),
    secao(
      'Dados da OS',
      campos([
        { rotulo: 'Situação', valor: badge(os.situacao, TOM_SITUACAO_OS[os.situacao] ?? 'neutro') },
        { rotulo: 'Laboratório', valor: texto(os.laboratorio) },
        { rotulo: 'Data de abertura', valor: formatarDataBr(os.dataAbertura) },
        { rotulo: 'Data de envio', valor: formatarDataBr(os.dataEnvio) },
        { rotulo: 'Previsão', valor: formatarDataBr(os.dataPrevisao) },
        { rotulo: 'Data de chegada', valor: formatarDataBr(os.dataChegada) },
        { rotulo: 'Data de entrega', valor: formatarDataBr(os.dataEntrega) }
      ]) + (os.observacao ? `<p class="nota"><strong>Observações:</strong> ${texto(os.observacao)}</p>` : '')
    ),
    secao(
      'Receita óptica',
      receita ? montarTabelaReceita(receita) : '<p class="nota">Sem receita óptica vinculada.</p>'
    ),
    assinatura('Assinatura do cliente')
  ].join('\n')

  return montarDocumento({
    titulo: `Ordem de Serviço ${os.numero}`,
    chips: os.atrasada ? ['Atrasada'] : [],
    empresa,
    orientacao: 'retrato',
    estiloExtra: ESTILO_RECEITA,
    corpo
  })
}
