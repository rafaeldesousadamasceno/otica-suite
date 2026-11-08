import type { Empresa, OrdemServico } from '@shared/types'
import { escapeHtml, formatarDataBr, montarRelatorioTabela, texto } from './htmlUtils'
import { TOM_SITUACAO_OS, badge } from './layout'

/**
 * RF-06/RF-12: reproduz o "Protocolo de Saída" ("Protocolo.jasper" no
 * sistema anterior) como uma tabela simples, sem copiar o layout Jasper
 * pixel a pixel (nao temos o .jrxml original nem uma engine Jasper aqui).
 *
 * Equivalencia de campo assumida: o Jasper antigo tinha uma coluna "data da
 * compra", que nao existe como campo direto em `OrdemServico` no sistema
 * novo - usamos `dataAbertura` (data de abertura da OS) no lugar dela.
 */

function montarFiltroTexto(filtro: { dataInicio?: string | null; dataFim?: string | null; situacao?: string }): string {
  const partes: string[] = []
  if (filtro.dataInicio || filtro.dataFim) {
    partes.push(`Período: ${filtro.dataInicio ? formatarDataBr(filtro.dataInicio) : '—'} a ${filtro.dataFim ? formatarDataBr(filtro.dataFim) : '—'}`)
  }
  if (filtro.situacao && filtro.situacao.trim()) {
    partes.push(`Situação: ${filtro.situacao}`)
  }
  return partes.join(' · ')
}

export function montarHtmlProtocoloSaida(
  itens: OrdemServico[],
  empresa: Empresa,
  filtro: { dataInicio?: string | null; dataFim?: string | null; situacao?: string }
): string {
  return montarRelatorioTabela({
    titulo: 'Protocolo de Saída',
    subtitulo: 'Pares enviados ao laboratório e ainda não entregues.',
    empresa,
    orientacao: 'paisagem',
    filtroTexto: montarFiltroTexto(filtro),
    colunas: [
      { label: 'Cliente' },
      { label: 'Nº OS' },
      { label: 'Laboratório' },
      { label: 'Tipo de lente' },
      { label: 'Data da compra' },
      { label: 'Data de saída' },
      { label: 'Data de chegada' },
      { label: 'Situação' },
      { label: 'Celular' }
    ],
    linhas: itens.map((os) => [
      texto(os.clienteNome),
      escapeHtml(os.numero),
      texto(os.laboratorio),
      texto(os.receitaTipoLente),
      formatarDataBr(os.dataAbertura),
      formatarDataBr(os.dataEnvio),
      formatarDataBr(os.dataChegada),
      badge(os.situacao, TOM_SITUACAO_OS[os.situacao] ?? 'neutro'),
      texto(os.clienteCelular)
    ]),
    linhaVazia: 'Nenhuma ordem de serviço encontrada.'
  })
}
