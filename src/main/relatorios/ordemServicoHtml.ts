import type { Empresa, OrdemServico, ReceitaOptica } from '@shared/types'
import { formatarDataBr, texto } from './formatacao'
import { mascararTelefoneBr } from '@shared/telefone'
import { TOM_SITUACAO_OS, assinatura, badge, campos, montarDocumento, secao } from './layout'
import { ESTILO_PRESCRICAO, montarBlocoPrescricao, type OpcoesPrescricao } from './prescricaoHtml'

/**
 * RF-12 CA4: o sistema anterior imprimia a OS/receita via um relatorio
 * Jasper ("OS.jasper"), que nao esta disponivel aqui (nem o arquivo .jrxml
 * nem uma engine Jasper embutida). Este arquivo NAO e uma copia pixel-a-
 * pixel daquele layout - e um layout novo, limpo, pensado para impressao em
 * A4, cobrindo os mesmos campos que o antigo trazia (cabecalho da otica,
 * dados da OS, prescricao OD/OE e assinatura do cliente na entrega).
 */

export function montarHtmlOrdemServico(os: OrdemServico, receita: ReceitaOptica | null, empresa: Empresa, opcoes: OpcoesPrescricao = {}): string {
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
        ...(os.entregadorNome || os.entregadorContato
          ? [{ rotulo: 'Entregador', valor: texto([os.entregadorNome, os.entregadorContato ? mascararTelefoneBr(os.entregadorContato) : null].filter(Boolean).join(' · ')) }]
          : []),
        { rotulo: 'Data de abertura', valor: formatarDataBr(os.dataAbertura) },
        { rotulo: 'Data de envio', valor: formatarDataBr(os.dataEnvio) },
        { rotulo: 'Previsão', valor: formatarDataBr(os.dataPrevisao) },
        { rotulo: 'Data de chegada', valor: formatarDataBr(os.dataChegada) },
        { rotulo: 'Data de entrega', valor: formatarDataBr(os.dataEntrega) }
      ]) + (os.observacao ? `<p class="nota"><strong>Observações:</strong> ${texto(os.observacao)}</p>` : '')
    ),
    secao('Prescrição', receita ? montarBlocoPrescricao(receita, opcoes) : '<p class="nota">Sem prescrição vinculada.</p>'),
    assinatura('Assinatura do cliente')
  ].join('\n')

  return montarDocumento({
    titulo: `Ordem de Serviço ${os.numero}`,
    chips: os.atrasada ? ['Atrasada'] : [],
    empresa,
    orientacao: 'retrato',
    estiloExtra: ESTILO_PRESCRICAO,
    corpo
  })
}
