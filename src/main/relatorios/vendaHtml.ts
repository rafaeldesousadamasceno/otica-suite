import type { Empresa, VendaDetalhada } from '@shared/types'
import { escapeHtml, formatarDataBr, formatarMoeda, montarLetterhead, texto } from './htmlUtils'

const ESTILO_BASE = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 11px; margin: 0; }
  .letterhead { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #1a1a1a; padding-bottom: 8px; margin-bottom: 10px; }
  .logo { max-height: 48px; max-width: 100px; object-fit: contain; }
  .empresa-nome { font-size: 16px; font-weight: bold; }
  .empresa-detalhe { font-size: 9px; color: #444; }
  h1 { font-size: 15px; margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; font-size: 10px; }
  thead th { background: #eee; text-transform: uppercase; font-size: 9px; }
  .totais { display: flex; justify-content: flex-end; gap: 20px; margin-bottom: 10px; }
  .totais .item { text-align: right; }
  .totais .label { font-size: 9px; color: #555; text-transform: uppercase; }
  .totais .valor { font-size: 13px; font-weight: bold; }
  .assinatura { margin-top: 40px; border-top: 1px solid #333; width: 60%; padding-top: 4px; font-size: 9px; text-align: center; }
`

/** RF-12: "Comprovante de venda" - itens, pagamentos e total, para entregar ao cliente. */
export function montarHtmlComprovanteVenda(venda: VendaDetalhada, empresa: Empresa): string {
  const linhasItens = venda.itens
    .map(
      (it) => `<tr>
        <td>${texto(it.descricao)}</td>
        <td style="text-align:center">${it.quantidade}</td>
        <td style="text-align:right">${formatarMoeda(it.precoUnitarioCentavos)}</td>
        <td style="text-align:right">${formatarMoeda(it.descontoCentavos)}</td>
        <td style="text-align:right">${formatarMoeda(it.totalCentavos)}</td>
      </tr>`
    )
    .join('')

  const linhasPagamento = venda.pagamentos
    .map(
      (p) => `<tr>
        <td>${texto(p.formaPagamento)}${p.parcelas > 1 ? ` em ${p.parcelas}x` : ''}</td>
        <td style="text-align:right">${formatarMoeda(p.valorCentavos)}</td>
      </tr>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Comprovante de Venda ${escapeHtml(venda.numero)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  ${ESTILO_BASE}
</style>
</head>
<body>
  ${montarLetterhead(empresa)}

  <h1>Comprovante de Venda ${escapeHtml(venda.numero)}</h1>
  <p style="margin:0 0 10px;font-size:10px;color:#444;">
    Cliente: ${texto(venda.clienteNome)} · Data: ${formatarDataBr(venda.data)} · Vendedor(a): ${texto(venda.vendedorNome)}
  </p>

  <table>
    <thead>
      <tr><th>Item</th><th>Qtd</th><th>Unitário</th><th>Desconto</th><th>Total</th></tr>
    </thead>
    <tbody>${linhasItens}</tbody>
  </table>

  <div class="totais">
    <div class="item"><div class="label">Subtotal</div><div class="valor">${formatarMoeda(venda.subtotalCentavos)}</div></div>
    <div class="item"><div class="label">Desconto</div><div class="valor">${formatarMoeda(venda.descontoCentavos)}</div></div>
    <div class="item"><div class="label">Total</div><div class="valor">${formatarMoeda(venda.totalCentavos)}</div></div>
  </div>

  <table>
    <thead><tr><th>Forma de Pagamento</th><th style="text-align:right">Valor</th></tr></thead>
    <tbody>${linhasPagamento}</tbody>
  </table>

  <div class="assinatura">Assinatura do cliente</div>
</body>
</html>`
}

/** RF-12: "Carnê de parcelas" - um "canhoto" por parcela em aberto, para o cliente parcelado levar. */
export function montarHtmlCarneParcelas(venda: VendaDetalhada, empresa: Empresa): string {
  const canhotos = venda.parcelas
    .map(
      (p) => `
      <div class="canhoto">
        ${montarLetterhead(empresa)}
        <p class="linha"><strong>${texto(venda.clienteNome)}</strong></p>
        <p class="linha">Venda ${escapeHtml(venda.numero)} · Parcela ${p.parcela}/${p.totalParcelas}</p>
        <p class="linha">Vencimento: <strong>${formatarDataBr(p.vencimento)}</strong></p>
        <p class="linha valor">${formatarMoeda(p.valorCentavos)}</p>
        <p class="linha situacao">${p.situacao}</p>
      </div>`
    )
    .join('<div class="corte"></div>')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Carnê de Parcelas ${escapeHtml(venda.numero)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 11px; margin: 0; }
  .letterhead { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .logo { max-height: 32px; max-width: 70px; object-fit: contain; }
  .empresa-nome { font-size: 12px; font-weight: bold; }
  .canhoto { border: 1px dashed #999; border-radius: 4px; padding: 10px; margin-bottom: 4px; }
  .linha { margin: 2px 0; }
  .valor { font-size: 14px; font-weight: bold; }
  .situacao { font-size: 9px; text-transform: uppercase; color: #555; }
  .corte { text-align: center; font-size: 9px; color: #999; margin: 4px 0; }
</style>
</head>
<body>
  ${venda.parcelas.length === 0 ? '<p>Esta venda não possui parcelas.</p>' : canhotos}
</body>
</html>`
}
