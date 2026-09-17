import type { SituacaoOS } from '@shared/types'

/** Cor semantica de cada estado do ciclo de vida da OS (RN-04). */
export const TOM_SITUACAO_OS: Record<SituacaoOS, 'neutral' | 'ok' | 'warn' | 'danger' | 'accent'> = {
  'EM ABERTO': 'neutral',
  LABORATÓRIO: 'warn',
  CHEGOU: 'accent',
  ENTREGUE: 'ok',
  CANCELADA: 'danger'
}
