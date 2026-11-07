import type { Empresa } from '@shared/types'
import { derivarTonsDestaque } from '@shared/cores'
import { PALETA_VIZ } from '@shared/graficos'
import { escapeHtml, formatarContatos, formatarEndereco } from './formatacao'

/**
 * Identidade visual unica de todos os relatorios em PDF: faixa de cabecalho na
 * cor da otica, titulo com chips de filtro, cards de resumo, tabelas zebradas,
 * selos de situacao, graficos e rodape com "Pagina X de Y".
 *
 * Cada relatorio monta so o miolo com os blocos daqui e entrega para
 * `montarDocumento`; ninguem mais escreve CSS proprio.
 */

export type Orientacao = 'retrato' | 'paisagem'
export type Tom = 'neutro' | 'destaque' | 'ok' | 'perigo' | 'atencao'

/** Largura util da pagina A4 (margens de 12 mm), em px CSS: base para o tamanho dos graficos. */
export const LARGURA_UTIL: Record<Orientacao, number> = { retrato: 700, paisagem: 1030 }

/** Cores de estado (mesmos valores do tema claro do app). */
const ESTADO = {
  ok: { cor: '#2e6b45', fundo: '#e4f0e8' },
  perigo: { cor: '#9e2f2a', fundo: '#f8e7e5' },
  atencao: { cor: '#8a6414', fundo: '#f6eedc' },
  neutro: { cor: '#43585f', fundo: '#eef2f2' }
} as const

function estilo(empresa: Empresa, orientacao: Orientacao, emitidoEm: string): string {
  const tons = derivarTonsDestaque(empresa.corDestaque)
  const raioLogo = empresa.logoFormato === 'circulo' ? '50%' : empresa.logoFormato === 'quadrado_arredondado' ? '8px' : '2px'
  // Texto dentro de `content:` do CSS: sem aspas nem barra invertida soltas.
  const emitido = emitidoEm.replace(/["\\]/g, '')

  return `
  @page {
    size: A4 ${orientacao === 'paisagem' ? 'landscape' : 'portrait'};
    margin: 12mm 12mm 15mm 12mm;
    @bottom-left {
      content: "Emitido em ${emitido} · OptiAleph";
      font-family: Inter, 'Segoe UI', Arial, sans-serif; font-size: 7.5pt; color: #6e858c;
    }
    @bottom-right {
      content: "Página " counter(page) " de " counter(pages);
      font-family: Inter, 'Segoe UI', Arial, sans-serif; font-size: 7.5pt; color: #6e858c;
    }
  }
  :root {
    --rel-base: ${tons.base};
    --rel-tinta: ${tons.tinta};
    --rel-forte: ${tons.forte};
    --rel-suave: ${tons.suave};
    --rel-borda: ${tons.borda};
    --rel-zebra: ${tons.zebra};
    --rel-ink: #17242a;
    --rel-ink-2: #43585f;
    --rel-ink-3: #6e858c;
    --rel-linha: #dde5e5;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    font-family: Inter, 'Segoe UI', Arial, sans-serif;
    font-size: 9.5px;
    line-height: 1.35;
    color: var(--rel-ink);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .num { font-variant-numeric: tabular-nums; white-space: nowrap; }

  .cabecalho {
    display: flex; align-items: center; gap: 12px;
    background: var(--rel-base); color: var(--rel-tinta);
    border-radius: 8px; padding: 10px 14px;
  }
  .logo {
    width: 44px; height: 44px; flex: none; overflow: hidden;
    border-radius: ${raioLogo}; background: #fff;
    display: flex; align-items: center; justify-content: center;
  }
  .logo img { width: 100%; height: 100%; object-fit: contain; }
  .logo-inicial { color: var(--rel-forte); font-size: 20px; font-weight: 700; }
  .empresa-nome { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
  .empresa-detalhe { font-size: 8.5px; opacity: 0.88; margin-top: 1px; }

  .titulo-doc {
    display: flex; justify-content: space-between; align-items: flex-end; gap: 16px;
    margin: 14px 0 12px; padding-bottom: 8px; border-bottom: 2px solid var(--rel-borda);
  }
  .titulo-doc h1 { font-size: 18px; line-height: 1.15; margin: 0; color: var(--rel-forte); letter-spacing: -0.01em; }
  .titulo-doc .subtitulo { margin: 3px 0 0; color: var(--rel-ink-2); font-size: 9.5px; }
  .chips { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 5px; }
  .chip {
    background: var(--rel-suave); color: var(--rel-forte);
    border-radius: 999px; padding: 3px 9px; font-size: 8.5px; font-weight: 600; white-space: nowrap;
  }

  .resumo { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-bottom: 14px; }
  .card { border-radius: 6px; padding: 8px 11px; border-left: 4px solid var(--card-cor); background: var(--card-fundo); break-inside: avoid; }
  .card .rotulo { font-size: 7.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--rel-ink-2); }
  .card .valor { font-size: 15px; font-weight: 700; margin-top: 2px; color: var(--card-valor); font-variant-numeric: tabular-nums; }
  .card .detalhe { font-size: 8px; color: var(--rel-ink-3); margin-top: 1px; }
  .tom-neutro { --card-cor: #b6c7c7; --card-fundo: #f4f7f7; --card-valor: var(--rel-ink); }
  .tom-destaque { --card-cor: var(--rel-base); --card-fundo: var(--rel-suave); --card-valor: var(--rel-forte); }
  .tom-ok { --card-cor: ${ESTADO.ok.cor}; --card-fundo: ${ESTADO.ok.fundo}; --card-valor: ${ESTADO.ok.cor}; }
  .tom-perigo { --card-cor: ${ESTADO.perigo.cor}; --card-fundo: ${ESTADO.perigo.fundo}; --card-valor: ${ESTADO.perigo.cor}; }
  .tom-atencao { --card-cor: ${ESTADO.atencao.cor}; --card-fundo: ${ESTADO.atencao.fundo}; --card-valor: ${ESTADO.atencao.cor}; }

  .secao { margin: 0 0 14px; }
  .secao > h2 {
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em;
    color: var(--rel-forte); margin: 0 0 7px; display: flex; align-items: center; gap: 6px;
  }
  .secao > h2::before { content: ''; width: 3px; height: 11px; border-radius: 2px; background: var(--rel-base); }

  .graficos { display: grid; gap: 10px; margin-bottom: 14px; }
  .graficos.colunas-2 { grid-template-columns: 1fr 1fr; }
  .grafico { border: 1px solid var(--rel-linha); border-radius: 6px; padding: 9px 11px 7px; break-inside: avoid; }
  .grafico h3 { margin: 0 0 6px; font-size: 9.5px; font-weight: 700; color: var(--rel-ink); }
  .grafico svg { display: block; width: 100%; height: auto; overflow: visible; }
  .grafico svg text { font-family: Inter, 'Segoe UI', Arial, sans-serif; }
  .grafico-vazio { color: var(--rel-ink-3); font-style: italic; text-align: center; padding: 24px 0; }
  .legenda { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0 0 6px; font-size: 8.5px; color: var(--rel-ink-2); }
  .legenda .item { display: inline-flex; align-items: center; gap: 5px; }
  .legenda .marca { width: 9px; height: 9px; border-radius: 2px; flex: none; }
  .rosca { display: flex; align-items: center; gap: 18px; }
  .rosca svg { width: 150px; flex: none; }
  .rosca .lista { flex: 1; border-collapse: collapse; font-size: 9px; }
  .rosca .lista td { padding: 3px 0; border-bottom: 1px solid var(--rel-linha); }
  .rosca .lista td + td { text-align: right; padding-left: 10px; }

  table.dados { width: 100%; border-collapse: separate; border-spacing: 0; }
  table.dados thead { display: table-header-group; }
  table.dados tr { break-inside: avoid; }
  table.dados th {
    background: var(--rel-base); color: var(--rel-tinta);
    font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
    padding: 6px 8px; text-align: left;
  }
  table.dados th:first-child { border-top-left-radius: 5px; }
  table.dados th:last-child { border-top-right-radius: 5px; }
  table.dados td { padding: 5px 8px; border-bottom: 1px solid var(--rel-linha); vertical-align: top; }
  table.dados tbody tr:nth-child(even) td { background: var(--rel-zebra); }
  table.dados tfoot td { font-weight: 700; background: var(--rel-suave); border-top: 2px solid var(--rel-borda); border-bottom: none; }
  table.dados td.vazio { text-align: center; font-style: italic; color: var(--rel-ink-3); padding: 18px; }
  .direita { text-align: right !important; }
  .centro { text-align: center !important; }

  .badge {
    display: inline-block; border-radius: 999px; padding: 1px 7px;
    font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap;
  }
  .badge.tom-neutro { background: ${ESTADO.neutro.fundo}; color: ${ESTADO.neutro.cor}; }
  .badge.tom-destaque { background: var(--rel-suave); color: var(--rel-forte); }
  .badge.tom-ok { background: ${ESTADO.ok.fundo}; color: ${ESTADO.ok.cor}; }
  .badge.tom-perigo { background: ${ESTADO.perigo.fundo}; color: ${ESTADO.perigo.cor}; }
  .badge.tom-atencao { background: ${ESTADO.atencao.fundo}; color: ${ESTADO.atencao.cor}; }

  .campos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 16px; }
  .campo .rotulo { font-size: 7.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--rel-ink-3); }
  .campo .valor { font-size: 10.5px; margin-top: 1px; }
  .nota { margin: 8px 0 0; padding: 7px 10px; border-radius: 6px; background: #f4f7f7; white-space: pre-wrap; }

  .rodape { margin-top: 8px; font-size: 8.5px; color: var(--rel-ink-3); display: flex; justify-content: space-between; gap: 16px; }
  .assinatura { margin: 56px auto 0; width: 300px; text-align: center; font-size: 9px; color: var(--rel-ink-2); }
  .assinatura .traco { border-top: 1px solid var(--rel-ink); margin-bottom: 4px; }
  `
}

function cabecalho(empresa: Empresa): string {
  const endereco = formatarEndereco(empresa)
  const contatos = [empresa.cnpj ? `CNPJ ${empresa.cnpj}` : '', formatarContatos(empresa)].filter(Boolean).join(' · ')
  const logo = empresa.logoPath
    ? `<div class="logo"><img src="${escapeHtml(empresa.logoPath)}" alt="" /></div>`
    : `<div class="logo logo-inicial">${escapeHtml((empresa.nomeFantasia.trim()[0] ?? 'O').toUpperCase())}</div>`

  return `<header class="cabecalho">
    ${logo}
    <div>
      <div class="empresa-nome">${escapeHtml(empresa.nomeFantasia)}</div>
      ${endereco ? `<div class="empresa-detalhe">${escapeHtml(endereco)}</div>` : ''}
      ${contatos ? `<div class="empresa-detalhe">${escapeHtml(contatos)}</div>` : ''}
    </div>
  </header>`
}

export interface MontarDocumentoInput {
  titulo: string
  subtitulo?: string
  /** Filtros aplicados (periodo, situacao...), mostrados como etiquetas ao lado do titulo. */
  chips?: string[]
  empresa: Empresa
  orientacao?: Orientacao
  /** Miolo ja montado com os blocos deste arquivo. */
  corpo: string
  /** CSS so deste documento (ex.: canhotos do carne), alem do padrao. */
  estiloExtra?: string
  /** Documento com capa propria (ex.: o manual): sem a faixa de cabecalho nem o titulo padrao. */
  semCabecalho?: boolean
}

export function montarDocumento(input: MontarDocumentoInput): string {
  const orientacao = input.orientacao ?? 'retrato'
  const emitidoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  const chips = (input.chips ?? []).filter((c) => c.trim())

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(input.titulo)}</title>
<style>${estilo(input.empresa, orientacao, emitidoEm)}${input.estiloExtra ?? ''}</style>
</head>
<body>
  ${
    input.semCabecalho
      ? ''
      : `${cabecalho(input.empresa)}
  <div class="titulo-doc">
    <div>
      <h1>${escapeHtml(input.titulo)}</h1>
      ${input.subtitulo ? `<p class="subtitulo">${escapeHtml(input.subtitulo)}</p>` : ''}
    </div>
    ${chips.length ? `<div class="chips">${chips.map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join('')}</div>` : ''}
  </div>`
  }
  ${input.corpo}
</body>
</html>`
}

// ------------------------------------------------------------------ blocos

export interface ResumoCard {
  label: string
  /** Ja em HTML (use `formatarMoeda`/`texto` antes). */
  valor: string
  tom?: Tom
  detalhe?: string
}

export function resumoCards(cards: ResumoCard[]): string {
  if (!cards.length) return ''
  return `<div class="resumo">${cards
    .map(
      (c) => `<div class="card tom-${c.tom ?? 'neutro'}">
        <div class="rotulo">${escapeHtml(c.label)}</div>
        <div class="valor">${c.valor}</div>
        ${c.detalhe ? `<div class="detalhe">${escapeHtml(c.detalhe)}</div>` : ''}
      </div>`
    )
    .join('')}</div>`
}

export interface ColunaTabela {
  label: string
  alinhar?: 'esquerda' | 'direita' | 'centro'
}

const CLASSE_ALINHAMENTO: Record<NonNullable<ColunaTabela['alinhar']>, string> = {
  esquerda: '',
  direita: 'direita num',
  centro: 'centro'
}

export function tabela(input: {
  colunas: ColunaTabela[]
  /** Celulas ja em HTML. */
  linhas: string[][]
  totais?: string[]
  vazio?: string
}): string {
  const classe = (i: number): string => CLASSE_ALINHAMENTO[input.colunas[i]?.alinhar ?? 'esquerda']
  const celula = (conteudo: string, i: number): string => {
    const c = classe(i)
    return c ? `<td class="${c}">${conteudo}</td>` : `<td>${conteudo}</td>`
  }

  const corpo =
    input.linhas.length === 0
      ? `<tr><td colspan="${input.colunas.length}" class="vazio">${escapeHtml(input.vazio ?? 'Nenhum registro encontrado.')}</td></tr>`
      : input.linhas.map((linha) => `<tr>${linha.map(celula).join('')}</tr>`).join('')

  return `<table class="dados">
    <thead><tr>${input.colunas
      .map((c, i) => (classe(i) ? `<th class="${classe(i)}">${escapeHtml(c.label)}</th>` : `<th>${escapeHtml(c.label)}</th>`))
      .join('')}</tr></thead>
    <tbody>${corpo}</tbody>
    ${input.totais ? `<tfoot><tr>${input.totais.map(celula).join('')}</tr></tfoot>` : ''}
  </table>`
}

export function badge(textoBadge: string, tom: Tom = 'neutro'): string {
  return `<span class="badge tom-${tom}">${escapeHtml(textoBadge)}</span>`
}

export function secao(titulo: string, conteudo: string): string {
  return `<section class="secao"><h2>${escapeHtml(titulo)}</h2>${conteudo}</section>`
}

export function campos(itens: { rotulo: string; valor: string }[]): string {
  return `<div class="campos">${itens
    .map((c) => `<div class="campo"><div class="rotulo">${escapeHtml(c.rotulo)}</div><div class="valor">${c.valor}</div></div>`)
    .join('')}</div>`
}

export interface GraficoRelatorio {
  titulo: string
  /** SVG (e legenda) ja montados por `svgCharts`. */
  html: string
}

/** Graficos lado a lado (dois por linha) ou um embaixo do outro. */
export function graficos(lista: GraficoRelatorio[], colunas: 1 | 2 = 1): string {
  if (!lista.length) return ''
  return `<div class="graficos${colunas === 2 ? ' colunas-2' : ''}">${lista
    .map((g) => `<div class="grafico"><h3>${escapeHtml(g.titulo)}</h3>${g.html}</div>`)
    .join('')}</div>`
}

export function rodape(esquerda: string, direita?: string): string {
  return `<div class="rodape"><span>${escapeHtml(esquerda)}</span>${direita ? `<span>${escapeHtml(direita)}</span>` : ''}</div>`
}

export function assinatura(rotulo: string): string {
  return `<div class="assinatura"><div class="traco"></div>${escapeHtml(rotulo)}</div>`
}

/** Cores fixas por categoria de produto (a cor segue a categoria, nunca a posicao). */
export const COR_CATEGORIA: Record<string, string> = {
  armacao: PALETA_VIZ.categorica[0],
  lente: PALETA_VIZ.categorica[1],
  acessorio: PALETA_VIZ.categorica[2],
  servico: PALETA_VIZ.categorica[3],
  outros: PALETA_VIZ.outros
}

export const ROTULO_CATEGORIA: Record<string, string> = {
  armacao: 'Armações',
  lente: 'Lentes',
  acessorio: 'Acessórios',
  servico: 'Serviços',
  outros: 'Outros'
}

/** Mesmo tom de cada situacao da OS usado nas telas do app. */
export const TOM_SITUACAO_OS: Record<string, Tom> = {
  'EM ABERTO': 'neutro',
  LABORATÓRIO: 'atencao',
  CHEGOU: 'destaque',
  ENTREGUE: 'ok',
  CANCELADA: 'perigo'
}
