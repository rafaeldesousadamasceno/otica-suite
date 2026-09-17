import type { Empresa, OrdemServico } from '@shared/types'

/**
 * RF-06/RF-12: reproduz o "Protocolo de Saída" ("Protocolo.jasper" no
 * sistema anterior) como uma tabela simples, sem copiar o layout Jasper
 * pixel a pixel (nao temos o .jrxml original nem uma engine Jasper aqui).
 *
 * Equivalencia de campo assumida: o Jasper antigo tinha uma coluna "data da
 * compra", que nao existe como campo direto em `OrdemServico` no sistema
 * novo - usamos `dataAbertura` (data de abertura da OS) no lugar dela.
 */

function formatarDataBr(iso: string | null): string {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function texto(valor: string | null | undefined): string {
  return valor && valor.trim() ? escapeHtml(valor) : '—'
}

function montarLetterhead(empresa: Empresa): string {
  const logo = empresa.logoPath
    ? `<img src="${empresa.logoPath}" alt="Logo" class="logo" />`
    : ''
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

function montarFiltroTexto(filtro: { dataInicio?: string | null; dataFim?: string | null; situacao?: string }): string {
  const partes: string[] = []
  if (filtro.dataInicio || filtro.dataFim) {
    partes.push(`Período: ${filtro.dataInicio ? formatarDataBr(filtro.dataInicio) : '—'} a ${filtro.dataFim ? formatarDataBr(filtro.dataFim) : '—'}`)
  }
  if (filtro.situacao && filtro.situacao.trim()) {
    partes.push(`Situação: ${escapeHtml(filtro.situacao)}`)
  }
  return partes.join(' · ')
}

function montarLinha(os: OrdemServico): string {
  return `
    <tr>
      <td>${texto(os.clienteNome)}</td>
      <td>${escapeHtml(os.numero)}</td>
      <td>${texto(os.laboratorio)}</td>
      <td>${texto(os.receitaTipoLente)}</td>
      <td>${formatarDataBr(os.dataAbertura)}</td>
      <td>${formatarDataBr(os.dataEnvio)}</td>
      <td>${formatarDataBr(os.dataChegada)}</td>
      <td>${texto(os.situacao)}</td>
      <td>${texto(os.clienteCelular)}</td>
    </tr>
  `
}

export function montarHtmlProtocoloSaida(
  itens: OrdemServico[],
  empresa: Empresa,
  filtro: { dataInicio?: string | null; dataFim?: string | null; situacao?: string }
): string {
  const emitidoEm = new Date().toLocaleString('pt-BR')
  const filtroTexto = montarFiltroTexto(filtro)

  const corpoTabela =
    itens.length === 0
      ? `<tr><td colspan="9" class="vazio">Nenhuma ordem de serviço encontrada.</td></tr>`
      : itens.map(montarLinha).join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Protocolo de Saída</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #1a1a1a;
    font-size: 11px;
    margin: 0;
  }
  .letterhead {
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 8px;
    margin-bottom: 10px;
  }
  .logo { max-height: 48px; max-width: 100px; object-fit: contain; }
  .empresa-nome { font-size: 16px; font-weight: bold; }
  .empresa-detalhe { font-size: 9px; color: #444; }
  .titulo {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 4px;
  }
  .titulo h1 { font-size: 15px; margin: 0; }
  .titulo .emitido { font-size: 9px; color: #555; }
  .filtro { font-size: 10px; color: #444; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; }
  th, td {
    border: 1px solid #999;
    padding: 4px 6px;
    text-align: left;
    font-size: 10px;
  }
  thead th { background: #eee; text-transform: uppercase; font-size: 9px; }
  td.vazio { text-align: center; font-style: italic; color: #555; padding: 16px; }
  .rodape { margin-top: 10px; font-size: 9px; color: #555; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  ${montarLetterhead(empresa)}

  <div class="titulo">
    <h1>Protocolo de Saída</h1>
    <span class="emitido">Emitido em ${emitidoEm}</span>
  </div>
  ${filtroTexto ? `<div class="filtro">${filtroTexto}</div>` : ''}

  <table>
    <thead>
      <tr>
        <th>Cliente</th>
        <th>Nº OS</th>
        <th>Laboratório</th>
        <th>Tipo de lente</th>
        <th>Data da compra</th>
        <th>Data de saída</th>
        <th>Data de chegada</th>
        <th>Situação</th>
        <th>Celular</th>
      </tr>
    </thead>
    <tbody>
      ${corpoTabela}
    </tbody>
  </table>

  <div class="rodape">
    <span>Total de ordens de serviço: ${itens.length}</span>
  </div>
</body>
</html>`
}
