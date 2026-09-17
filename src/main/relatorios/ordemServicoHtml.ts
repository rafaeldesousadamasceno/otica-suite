import type { Empresa, OrdemServico, ReceitaOptica } from '@shared/types'

/**
 * RF-12 CA4: o sistema anterior imprimia a OS/receita via um relatorio
 * Jasper ("OS.jasper"), que nao esta disponivel aqui (nem o arquivo .jrxml
 * nem uma engine Jasper embutida). Este arquivo NAO e uma copia pixel-a-
 * pixel daquele layout - e um layout novo, limpo, pensado para impressao em
 * A4, cobrindo os mesmos campos que o antigo trazia (cabecalho da otica,
 * dados da OS, receita optica OD/OE e assinatura do cliente na entrega).
 */

function formatarDataBr(iso: string | null): string {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

function texto(valor: string | null | undefined): string {
  return valor && valor.trim() ? escapeHtml(valor) : '—'
}

function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function grau(valor: number | null): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—'
  const sinal = valor > 0 ? '+' : ''
  return `${sinal}${valor.toFixed(2)}`
}

function eixoOuDnp(valor: number | null): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—'
  return String(valor)
}

function montarLetterhead(empresa: Empresa): string {
  const logo = empresa.logoPath
    ? `<img src="${empresa.logoPath}" alt="Logo" class="logo" />`
    : ''
  const contatos = [empresa.telefone, empresa.whatsapp, empresa.email]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(' · ')
  const enderecoPartes = [
    empresa.logradouro,
    empresa.numero,
    empresa.bairro,
    empresa.cidade,
    empresa.uf
  ].filter((v): v is string => Boolean(v && v.trim()))
  const endereco = enderecoPartes.join(', ')

  return `
    <div class="letterhead">
      ${logo}
      <div class="empresa-info">
        <div class="empresa-nome">${escapeHtml(empresa.nomeFantasia)}</div>
        ${endereco ? `<div class="empresa-detalhe">${escapeHtml(endereco)}</div>` : ''}
        ${contatos ? `<div class="empresa-detalhe">${escapeHtml(contatos)}</div>` : ''}
      </div>
    </div>
  `
}

function montarTabelaReceita(receita: ReceitaOptica): string {
  return `
    <table class="receita">
      <thead>
        <tr>
          <th></th>
          <th colspan="4">Olho Direito (OD)</th>
          <th colspan="4">Olho Esquerdo (OE)</th>
        </tr>
        <tr>
          <th></th>
          <th>ESF</th><th>CIL</th><th>EIXO</th><th>DNP</th>
          <th>ESF</th><th>CIL</th><th>EIXO</th><th>DNP</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="rotulo">Longe</td>
          <td>${grau(receita.longeOdEsf)}</td>
          <td>${grau(receita.longeOdCil)}</td>
          <td>${eixoOuDnp(receita.longeOdEixo)}</td>
          <td>${eixoOuDnp(receita.longeOdDnp)}</td>
          <td>${grau(receita.longeOeEsf)}</td>
          <td>${grau(receita.longeOeCil)}</td>
          <td>${eixoOuDnp(receita.longeOeEixo)}</td>
          <td>${eixoOuDnp(receita.longeOeDnp)}</td>
        </tr>
        <tr>
          <td class="rotulo">Perto</td>
          <td>${grau(receita.pertoOdEsf)}</td>
          <td>${grau(receita.pertoOdCil)}</td>
          <td>${eixoOuDnp(receita.pertoOdEixo)}</td>
          <td>${eixoOuDnp(receita.pertoOdDnp)}</td>
          <td>${grau(receita.pertoOeEsf)}</td>
          <td>${grau(receita.pertoOeCil)}</td>
          <td>${eixoOuDnp(receita.pertoOeEixo)}</td>
          <td>${eixoOuDnp(receita.pertoOeDnp)}</td>
        </tr>
        <tr>
          <td class="rotulo">Adição</td>
          <td colspan="8">${grau(receita.adicao)}</td>
        </tr>
      </tbody>
    </table>
    <div class="receita-extra">
      ${receita.tipoLente ? `<p><strong>Tipo de lente:</strong> ${texto(receita.tipoLente)}</p>` : ''}
      ${receita.tratamentos ? `<p><strong>Tratamentos:</strong> ${texto(receita.tratamentos)}</p>` : ''}
      ${receita.armacao ? `<p><strong>Armação:</strong> ${texto(receita.armacao)}</p>` : ''}
      <p><strong>Responsável:</strong> ${texto(receita.profissionalNome)}</p>
      <p><strong>Data do exame:</strong> ${formatarDataBr(receita.dataExame)}</p>
    </div>
  `
}

export function montarHtmlOrdemServico(
  os: OrdemServico,
  receita: ReceitaOptica | null,
  empresa: Empresa
): string {
  const emitidoEm = new Date().toLocaleString('pt-BR')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Ordem de Serviço ${escapeHtml(os.numero)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #1a1a1a;
    font-size: 12px;
    margin: 0;
  }
  .letterhead {
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 10px;
    margin-bottom: 14px;
  }
  .logo { max-height: 56px; max-width: 120px; object-fit: contain; }
  .empresa-nome { font-size: 18px; font-weight: bold; }
  .empresa-detalhe { font-size: 10px; color: #444; }
  .titulo {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 14px;
  }
  .titulo h1 { font-size: 16px; margin: 0; }
  .titulo .emitido { font-size: 10px; color: #555; }
  section { margin-bottom: 16px; }
  h2 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid #ccc;
    padding-bottom: 4px;
    margin: 0 0 8px 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px 16px;
  }
  .campo .rotulo-campo { font-size: 9px; text-transform: uppercase; color: #666; }
  .campo .valor-campo { font-size: 12px; }
  .observacao { white-space: pre-wrap; }
  table.receita { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  table.receita th, table.receita td {
    border: 1px solid #999;
    padding: 5px 6px;
    text-align: center;
    font-size: 11px;
  }
  table.receita td.rotulo, table.receita th:first-child { text-align: left; font-weight: bold; }
  .receita-extra p { margin: 3px 0; font-size: 11px; }
  .sem-receita { font-style: italic; color: #555; }
  .assinatura {
    margin-top: 60px;
    display: flex;
    justify-content: center;
  }
  .assinatura .linha {
    width: 320px;
    text-align: center;
  }
  .assinatura .linha .traco {
    border-top: 1px solid #1a1a1a;
    margin-bottom: 4px;
  }
</style>
</head>
<body>
  ${montarLetterhead(empresa)}

  <div class="titulo">
    <h1>Ordem de Serviço ${escapeHtml(os.numero)}</h1>
    <span class="emitido">Impresso em ${emitidoEm}</span>
  </div>

  <section>
    <h2>Cliente</h2>
    <div class="grid">
      <div class="campo">
        <div class="rotulo-campo">Nome</div>
        <div class="valor-campo">${texto(os.clienteNome)}</div>
      </div>
      <div class="campo">
        <div class="rotulo-campo">Celular</div>
        <div class="valor-campo">${texto(os.clienteCelular)}</div>
      </div>
    </div>
  </section>

  <section>
    <h2>Dados da OS</h2>
    <div class="grid">
      <div class="campo">
        <div class="rotulo-campo">Situação</div>
        <div class="valor-campo">${texto(os.situacao)}</div>
      </div>
      <div class="campo">
        <div class="rotulo-campo">Laboratório</div>
        <div class="valor-campo">${texto(os.laboratorio)}</div>
      </div>
      <div class="campo">
        <div class="rotulo-campo">Data de abertura</div>
        <div class="valor-campo">${formatarDataBr(os.dataAbertura)}</div>
      </div>
      <div class="campo">
        <div class="rotulo-campo">Data de envio</div>
        <div class="valor-campo">${formatarDataBr(os.dataEnvio)}</div>
      </div>
      <div class="campo">
        <div class="rotulo-campo">Previsão</div>
        <div class="valor-campo">${formatarDataBr(os.dataPrevisao)}</div>
      </div>
      <div class="campo">
        <div class="rotulo-campo">Data de chegada</div>
        <div class="valor-campo">${formatarDataBr(os.dataChegada)}</div>
      </div>
      <div class="campo">
        <div class="rotulo-campo">Data de entrega</div>
        <div class="valor-campo">${formatarDataBr(os.dataEntrega)}</div>
      </div>
    </div>
    ${os.observacao ? `<p class="observacao"><strong>Observações:</strong> ${texto(os.observacao)}</p>` : ''}
  </section>

  <section>
    <h2>Receita óptica</h2>
    ${receita ? montarTabelaReceita(receita) : '<p class="sem-receita">Sem receita óptica vinculada.</p>'}
  </section>

  <div class="assinatura">
    <div class="linha">
      <div class="traco"></div>
      <div>Assinatura do cliente</div>
    </div>
  </div>
</body>
</html>`
}
