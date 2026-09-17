import type { Empresa } from '@shared/types'

/**
 * RF-12: utilitarios compartilhados entre todos os templates de relatorio.
 * Extraido depois que `ordemServicoHtml.ts` e `protocoloSaidaHtml.ts` ja
 * duplicavam exatamente estas mesmas funcoes - a partir do 3o relatorio
 * duplicar de novo deixa de valer a pena.
 */

export function formatarDataBr(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

export function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function texto(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '—'
  const s = String(valor)
  return s.trim() ? escapeHtml(s) : '—'
}

export function formatarMoeda(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function montarLetterhead(empresa: Empresa): string {
  const logo = empresa.logoPath ? `<img src="${empresa.logoPath}" alt="Logo" class="logo" />` : ''
  const contatos = [empresa.telefone, empresa.whatsapp, empresa.email]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(' · ')

  return `
    <div class="letterhead">
      ${logo}
      <div class="empresa-info">
        <div class="empresa-nome">${escapeHtml(empresa.nomeFantasia)}</div>
        ${contatos ? `<div class="empresa-detalhe">${escapeHtml(contatos)}</div>` : ''}
      </div>
    </div>
  `
}

const ESTILO_BASE = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 11px; margin: 0; }
  .letterhead { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #1a1a1a; padding-bottom: 8px; margin-bottom: 10px; }
  .logo { max-height: 48px; max-width: 100px; object-fit: contain; }
  .empresa-nome { font-size: 16px; font-weight: bold; }
  .empresa-detalhe { font-size: 9px; color: #444; }
  .titulo { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
  .titulo h1 { font-size: 15px; margin: 0; }
  .titulo .emitido { font-size: 9px; color: #555; }
  .filtro { font-size: 10px; color: #444; margin-bottom: 10px; }
  .resumo { display: flex; gap: 16px; margin-bottom: 12px; }
  .resumo .item { border: 1px solid #ccc; border-radius: 4px; padding: 6px 10px; }
  .resumo .item .label { font-size: 9px; color: #555; text-transform: uppercase; }
  .resumo .item .valor { font-size: 13px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; font-size: 10px; }
  thead th { background: #eee; text-transform: uppercase; font-size: 9px; }
  td.vazio { text-align: center; font-style: italic; color: #555; padding: 16px; }
  .rodape { margin-top: 10px; font-size: 9px; color: #555; display: flex; justify-content: space-between; }
  tfoot td { font-weight: bold; background: #f4f4f4; }
`

export interface ColunaRelatorio {
  label: string
  alinhar?: 'esquerda' | 'direita' | 'centro'
}

export interface ResumoCard {
  label: string
  valor: string
}

interface MontarRelatorioTabelaInput {
  titulo: string
  empresa: Empresa
  orientacao?: 'retrato' | 'paisagem'
  filtroTexto?: string
  resumo?: ResumoCard[]
  colunas: ColunaRelatorio[]
  /** Cada linha ja vem pronta em HTML (usar `texto`/`formatarMoeda` antes de montar). */
  linhas: string[][]
  linhaVazia?: string
  rodapeTexto?: string
  /** Linha de totais opcional, no mesmo formato de `linhas`. */
  totais?: string[]
}

const ALINHAMENTO: Record<NonNullable<ColunaRelatorio['alinhar']>, string> = {
  esquerda: 'left',
  direita: 'right',
  centro: 'center'
}

/**
 * Monta um relatorio tabular generico: cabecalho com logo, titulo, filtro
 * aplicado, cards de resumo opcionais e uma tabela. Cobre a maioria dos
 * relatorios do RF-12 (todos, exceto comprovante de venda e carne de
 * parcelas, que tem layout proprio - ver `vendaHtml.ts`).
 */
export function montarRelatorioTabela(input: MontarRelatorioTabelaInput): string {
  const emitidoEm = new Date().toLocaleString('pt-BR')
  const orientacao = input.orientacao ?? 'paisagem'

  const corpoTabela =
    input.linhas.length === 0
      ? `<tr><td colspan="${input.colunas.length}" class="vazio">${escapeHtml(
          input.linhaVazia ?? 'Nenhum registro encontrado.'
        )}</td></tr>`
      : input.linhas
          .map(
            (linha) =>
              `<tr>${linha
                .map((celula, i) => `<td style="text-align:${ALINHAMENTO[input.colunas[i]?.alinhar ?? 'esquerda']}">${celula}</td>`)
                .join('')}</tr>`
          )
          .join('')

  const linhaTotais = input.totais
    ? `<tfoot><tr>${input.totais
        .map((celula, i) => `<td style="text-align:${ALINHAMENTO[input.colunas[i]?.alinhar ?? 'esquerda']}">${celula}</td>`)
        .join('')}</tr></tfoot>`
    : ''

  const resumoHtml = input.resumo?.length
    ? `<div class="resumo">${input.resumo
        .map((r) => `<div class="item"><div class="label">${escapeHtml(r.label)}</div><div class="valor">${r.valor}</div></div>`)
        .join('')}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(input.titulo)}</title>
<style>
  @page { size: A4 ${orientacao === 'paisagem' ? 'landscape' : 'portrait'}; margin: 12mm; }
  ${ESTILO_BASE}
</style>
</head>
<body>
  ${montarLetterhead(input.empresa)}

  <div class="titulo">
    <h1>${escapeHtml(input.titulo)}</h1>
    <span class="emitido">Emitido em ${emitidoEm}</span>
  </div>
  ${input.filtroTexto ? `<div class="filtro">${escapeHtml(input.filtroTexto)}</div>` : ''}
  ${resumoHtml}

  <table>
    <thead>
      <tr>${input.colunas.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${corpoTabela}
    </tbody>
    ${linhaTotais}
  </table>

  <div class="rodape">
    <span>Total de registros: ${input.linhas.length}</span>
    ${input.rodapeTexto ? `<span>${escapeHtml(input.rodapeTexto)}</span>` : ''}
  </div>
</body>
</html>`
}

export function montarFiltroPeriodo(dataInicio: string, dataFim: string): string {
  return `Período: ${formatarDataBr(dataInicio)} a ${formatarDataBr(dataFim)}`
}
