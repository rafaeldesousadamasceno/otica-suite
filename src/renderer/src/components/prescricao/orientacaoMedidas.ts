import type { MedidaArmacao } from '@shared/prescricao'

/** Como medir cada parte da armacao e os erros que mais acontecem (na ordem das imagens 1, 2 e 3). */
export interface Orientacao {
  definicao: string
  erros: [string, string, string]
}

export const ORIENTACAO_MEDIDAS: Record<MedidaArmacao, Orientacao> = {
  ponte: {
    definicao: 'Menor distância entre as lentes, na parte nasal.',
    erros: [
      'Medir pela parte de fora da armação.',
      'Medir fora da menor distância entre as lentes.',
      'Medir pela parte de fora da armação e fora da menor distância.'
    ]
  },
  horizontal: {
    definicao: 'Distância entre a borda nasal e a temporal da lente, em linha horizontal, sem incluir a armação.',
    erros: ['Medir fora da maior distância horizontal.', 'Medir de forma inclinada.', 'Incluir a armação na medida.']
  },
  vertical: {
    definicao: 'Distância entre a borda superior e a inferior da lente, em linha vertical, sem incluir a armação.',
    erros: ['Medir fora da maior distância vertical.', 'Medir de forma inclinada.', 'Incluir a armação na medida.']
  },
  diagonalMaior: {
    definicao: 'Maior distância entre dois pontos opostos da lente, em linha diagonal, sem incluir a armação.',
    erros: [
      'Incluir as bordas da armação na medida.',
      'Incluir uma das bordas na medida.',
      'Não medir na maior diagonal.'
    ]
  }
}
