import type { Empresa } from '@shared/types'
import type { BlocoAjuda, SecaoAjuda } from '@shared/ajuda'
import { escapeHtml, formatarDataBr } from './formatacao'
import { montarDocumento, tabela } from './layout'

/**
 * PDF do manual do usuario, gerado do mesmo conteudo da pagina de Ajuda:
 * capa, sumario e as secoes que o perfil pode ver.
 */

const ESTILO_MANUAL = `
  .capa {
    height: 255mm; display: flex; flex-direction: column; justify-content: center; align-items: flex-start;
    background: var(--rel-base); color: var(--rel-tinta); border-radius: 14px; padding: 0 22mm;
    break-after: page;
  }
  .capa .logo { width: 72px; height: 72px; margin-bottom: 28px; }
  .capa .logo-inicial { font-size: 32px; }
  .capa .marca { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.85; }
  .capa h1 { font-size: 40px; line-height: 1.1; margin: 8px 0 12px; letter-spacing: -0.02em; }
  .capa .descricao { font-size: 13px; max-width: 120mm; opacity: 0.92; }
  .capa .rodape-capa { margin-top: 48px; font-size: 10.5px; opacity: 0.85; line-height: 1.6; }

  .sumario { break-after: page; }
  .sumario h2 { font-size: 18px; color: var(--rel-forte); margin: 0 0 12px; }
  .sumario ol { margin: 0; padding: 0; list-style: none; counter-reset: item; }
  .sumario li { counter-increment: item; display: flex; gap: 10px; padding: 4px 0; border-bottom: 1px solid var(--rel-linha); font-size: 11px; }
  .sumario li::before { content: counter(item); width: 22px; font-weight: 700; color: var(--rel-forte); text-align: right; flex: none; }
  .sumario .titulo-item { font-weight: 600; }
  .sumario .resumo-item { color: var(--rel-ink-3); font-size: 9.5px; }

  .manual-secao { margin: 0 0 20px; }
  .manual-secao > h2 {
    font-size: 17px; color: var(--rel-forte); margin: 0 0 4px; padding-bottom: 6px;
    border-bottom: 2px solid var(--rel-borda); break-after: avoid;
  }
  .manual-secao > .resumo-secao { margin: 0 0 10px; color: var(--rel-ink-3); font-size: 10px; font-style: italic; break-after: avoid; }
  .manual-secao p { margin: 0 0 8px; font-size: 10.5px; line-height: 1.5; }
  .manual-secao ol, .manual-secao ul { margin: 0 0 10px; padding-left: 20px; font-size: 10.5px; line-height: 1.5; }
  .manual-secao li { margin-bottom: 3px; break-inside: avoid; }
  .manual-secao table.dados { margin: 0 0 10px; }
  .manual-secao table.dados td { font-size: 9.5px; }
  .aviso { border-radius: 6px; padding: 8px 12px; margin: 0 0 10px; font-size: 10px; line-height: 1.5; break-inside: avoid; border-left: 4px solid; }
  .aviso strong { display: block; font-size: 10px; margin-bottom: 2px; }
  .aviso.dica { background: var(--rel-suave); border-color: var(--rel-base); }
  .aviso.atencao { background: #f6eedc; border-color: #8a6414; }
`

function bloco(b: BlocoAjuda): string {
  switch (b.tipo) {
    case 'paragrafo':
      return `<p>${escapeHtml(b.texto)}</p>`
    case 'passos':
      return `<ol>${b.itens.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ol>`
    case 'lista':
      return `<ul>${b.itens.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
    case 'dica':
    case 'atencao':
      return `<div class="aviso ${b.tipo}">${b.titulo ? `<strong>${escapeHtml(b.titulo)}</strong>` : ''}${escapeHtml(b.texto)}</div>`
    case 'tabela':
      return tabela({
        colunas: b.colunas.map((label) => ({ label })),
        linhas: b.linhas.map((l) => l.map((c) => escapeHtml(c)))
      })
  }
}

export function montarHtmlManual(
  secoes: SecaoAjuda[],
  empresa: Empresa,
  opcoes: { versao: string; geradoEm: string }
): string {
  const logo = empresa.logoPath
    ? `<div class="logo"><img src="${escapeHtml(empresa.logoPath)}" alt="" /></div>`
    : `<div class="logo logo-inicial">${escapeHtml((empresa.nomeFantasia.trim()[0] ?? 'O').toUpperCase())}</div>`

  const capa = `<section class="capa">
    ${logo}
    <div class="marca">${escapeHtml(empresa.nomeFantasia)}</div>
    <h1>Manual do Usuário</h1>
    <p class="descricao">OptiAleph: clientes, receitas, ordens de serviço, vendas, estoque e financeiro, tudo em um só lugar.</p>
    <div class="rodape-capa">Versão ${escapeHtml(opcoes.versao)}<br />Gerado em ${escapeHtml(formatarDataBr(opcoes.geradoEm))}</div>
  </section>`

  const sumario = `<section class="sumario">
    <h2>Neste manual</h2>
    <ol>${secoes
      .map((s) => `<li><span><span class="titulo-item">${escapeHtml(s.titulo)}</span><br /><span class="resumo-item">${escapeHtml(s.resumo)}</span></span></li>`)
      .join('')}</ol>
  </section>`

  const corpo = secoes
    .map(
      (s) => `<section class="manual-secao" id="${escapeHtml(s.id)}">
      <h2>${escapeHtml(s.titulo)}</h2>
      <p class="resumo-secao">${escapeHtml(s.resumo)}</p>
      ${s.blocos.map(bloco).join('\n')}
    </section>`
    )
    .join('\n')

  return montarDocumento({
    titulo: 'Manual do Usuário',
    empresa,
    orientacao: 'retrato',
    estiloExtra: ESTILO_MANUAL,
    semCabecalho: true,
    corpo: [capa, sumario, corpo].join('\n')
  })
}
