import type { Empresa, VendaDetalhada } from '@shared/types'
import { escapeHtml, formatarContatos, formatarDataBr, formatarMoeda, texto } from './formatacao'
import { assinatura, badge, campos, montarDocumento, resumoCards, secao, tabela, type Tom } from './layout'

const TOM_PARCELA: Record<string, Tom> = { ABERTA: 'atencao', PAGA: 'ok', CANCELADA: 'perigo' }

/** RF-12: "Comprovante de venda" - itens, pagamentos e total, para entregar ao cliente. */
export function montarHtmlComprovanteVenda(venda: VendaDetalhada, empresa: Empresa): string {
  const itens = tabela({
    colunas: [
      { label: 'Item' },
      { label: 'Qtd', alinhar: 'centro' },
      { label: 'Unitário', alinhar: 'direita' },
      { label: 'Desconto', alinhar: 'direita' },
      { label: 'Total', alinhar: 'direita' }
    ],
    linhas: venda.itens.map((it) => [
      texto(it.descricao),
      String(it.quantidade),
      formatarMoeda(it.precoUnitarioCentavos),
      formatarMoeda(it.descontoCentavos),
      formatarMoeda(it.totalCentavos)
    ]),
    vazio: 'Venda sem itens.'
  })

  const pagamentos = tabela({
    colunas: [{ label: 'Forma de pagamento' }, { label: 'Valor', alinhar: 'direita' }],
    linhas: venda.pagamentos.map((p) => [
      `${texto(p.formaPagamento)}${p.parcelas > 1 ? ` em ${p.parcelas}x` : ''}`,
      formatarMoeda(p.valorCentavos)
    ]),
    vazio: 'Nenhum pagamento registrado.'
  })

  const corpo = [
    secao(
      'Venda',
      campos([
        { rotulo: 'Cliente', valor: texto(venda.clienteNome) },
        { rotulo: 'Data', valor: formatarDataBr(venda.data) },
        { rotulo: 'Vendedor(a)', valor: texto(venda.vendedorNome) },
        ...(venda.situacao === 'CANCELADA' ? [{ rotulo: 'Situação', valor: badge('Cancelada', 'perigo') }] : [])
      ])
    ),
    secao('Itens', itens),
    resumoCards([
      { label: 'Subtotal', valor: formatarMoeda(venda.subtotalCentavos) },
      { label: 'Desconto', valor: formatarMoeda(venda.descontoCentavos) },
      { label: 'Total', valor: formatarMoeda(venda.totalCentavos), tom: 'destaque' }
    ]),
    secao('Pagamento', pagamentos),
    assinatura('Assinatura do cliente')
  ].join('\n')

  return montarDocumento({
    titulo: `Comprovante de Venda ${venda.numero}`,
    empresa,
    orientacao: 'retrato',
    corpo
  })
}

const ESTILO_CARNE = `
  .canhoto {
    display: flex; align-items: stretch; gap: 14px;
    border: 1px solid var(--rel-linha); border-left: 5px solid var(--rel-base);
    border-radius: 6px; padding: 9px 12px; break-inside: avoid;
  }
  .canhoto .ident { flex: 1; }
  .canhoto .loja { font-size: 8px; color: var(--rel-ink-3); margin-bottom: 3px; }
  .canhoto .loja strong { color: var(--rel-forte); font-size: 9px; }
  .canhoto .cliente { font-size: 11px; font-weight: 700; }
  .canhoto .linha { margin-top: 2px; color: var(--rel-ink-2); }
  .canhoto .valores { text-align: right; min-width: 150px; display: flex; flex-direction: column; justify-content: space-between; gap: 4px; }
  .canhoto .venc { font-size: 8px; color: var(--rel-ink-3); text-transform: uppercase; letter-spacing: 0.05em; }
  .canhoto .venc strong { display: block; font-size: 11px; color: var(--rel-ink); letter-spacing: 0; }
  .canhoto .valor-parcela { font-size: 16px; font-weight: 700; color: var(--rel-forte); font-variant-numeric: tabular-nums; }
  .canhoto .recebido { margin-top: 6px; font-size: 8px; color: var(--rel-ink-3); }
  .corte { border-top: 1px dashed #b6c7c7; margin: 9px 0; position: relative; }
  .corte::after { content: '✂'; position: absolute; left: -2px; top: -8px; font-size: 10px; color: #8a9a9e; background: #fff; padding-right: 3px; }
`

/** RF-12: "Carnê de parcelas" - um canhoto por parcela, para o cliente parcelado levar. */
export function montarHtmlCarneParcelas(venda: VendaDetalhada, empresa: Empresa): string {
  const contatos = formatarContatos(empresa)
  const canhotos = venda.parcelas
    .map(
      (p) => `
      <div class="canhoto">
        <div class="ident">
          <div class="loja"><strong>${escapeHtml(empresa.nomeFantasia)}</strong>${contatos ? ` · ${escapeHtml(contatos)}` : ''}</div>
          <div class="cliente">${texto(venda.clienteNome)}</div>
          <div class="linha">Venda ${escapeHtml(venda.numero)} · Parcela ${p.parcela}/${p.totalParcelas}</div>
          <div class="recebido">Recebido em ____/____/______ por ______________________________</div>
        </div>
        <div class="valores">
          <div class="venc">Vencimento <strong>${formatarDataBr(p.vencimento)}</strong></div>
          <div class="valor-parcela">${formatarMoeda(p.valorCentavos)}</div>
          <div>${badge(p.situacao, TOM_PARCELA[p.situacao] ?? 'neutro')}</div>
        </div>
      </div>`
    )
    .join('<div class="corte"></div>')

  return montarDocumento({
    titulo: `Carnê de Parcelas ${venda.numero}`,
    subtitulo: `${venda.clienteNome} · ${venda.parcelas.length} parcela(s)`,
    empresa,
    orientacao: 'retrato',
    estiloExtra: ESTILO_CARNE,
    corpo: venda.parcelas.length === 0 ? '<p>Esta venda não possui parcelas.</p>' : canhotos
  })
}
