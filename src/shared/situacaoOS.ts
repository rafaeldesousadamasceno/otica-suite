import { FLUXO_SITUACAO_OS, type SituacaoOS } from './types'

/**
 * Maquina de estados da Ordem de Servico (RN-04).
 *
 * `EM ABERTO -> LABORATÓRIO -> CHEGOU -> ENTREGUE`, e `CANCELADA` a
 * partir de qualquer estado que ainda nao foi entregue.
 *
 * Fica em `shared/` de proposito: o renderer usa para decidir qual botao
 * mostrar, e o main usa para RECUSAR uma transicao invalida. A regra e a
 * mesma nos dois lados, mas quem manda e o main - o renderer so evita
 * oferecer um caminho que seria recusado.
 */
export function proximaSituacao(atual: SituacaoOS): SituacaoOS | null {
  const indice = FLUXO_SITUACAO_OS.indexOf(atual as (typeof FLUXO_SITUACAO_OS)[number])
  if (indice === -1) return null // CANCELADA nao avanca
  return FLUXO_SITUACAO_OS[indice + 1] ?? null // ENTREGUE e o fim da linha
}

export function podeCancelar(atual: SituacaoOS): boolean {
  return atual !== 'ENTREGUE' && atual !== 'CANCELADA'
}

export function transicaoValida(de: SituacaoOS, para: SituacaoOS): boolean {
  if (para === 'CANCELADA') return podeCancelar(de)
  return proximaSituacao(de) === para
}

/** Campo de data que a transicao preenche automaticamente, se houver. */
export function campoDataDaSituacao(situacao: SituacaoOS): 'dataEnvio' | 'dataChegada' | 'dataEntrega' | null {
  switch (situacao) {
    case 'LABORATÓRIO':
      return 'dataEnvio'
    case 'CHEGOU':
      return 'dataChegada'
    case 'ENTREGUE':
      return 'dataEntrega'
    default:
      return null
  }
}

/** Rotulo do botao que executa o avanco - fala a lingua do balcao. */
export function rotuloAvanco(atual: SituacaoOS): string | null {
  switch (proximaSituacao(atual)) {
    case 'LABORATÓRIO':
      return 'Enviar ao laboratório'
    case 'CHEGOU':
      return 'Registrar chegada'
    case 'ENTREGUE':
      return 'Entregar ao cliente'
    default:
      return null
  }
}
