import type { ReactNode } from 'react'
import type { MedidaArmacao } from '@shared/prescricao'

export type VarianteMedida = 'correto' | 'erro1' | 'erro2' | 'erro3'

export const COR_CORRETO = '#2E7D32'
export const COR_ERRO = '#C62828'

type Ponto = [number, number]
interface Linha {
  de: Ponto
  ate: Ponto
}

/**
 * Armacao de frente, 400 x 200. Lente do lado direito da imagem = onde se mede (a Ponte
 * fica no centro). Aro grosso, lentes um pouco trapezoidais (mais estreitas embaixo no lado
 * do nariz, por isso o vao da ponte e menor em cima), ponte no centro e hastes curtas.
 *
 * Todas as coordenadas abaixo sao em pixels do desenho. `LENTE` e o centro do aro (12 de
 * espessura); a "borda da lente" e 6 para dentro e a "borda de fora do aro" e 6 para fora.
 */
const LENTE_DIREITA: Ponto[] = [
  [214, 60], // topo, lado do nariz
  [342, 58], // topo, lado da haste
  [338, 148], // base, lado da haste
  [230, 138] // base, lado do nariz
]
const ESPELHO = (p: Ponto): Ponto => [400 - p[0], p[1]]
const ARO = 12
const RAIO_CANTO = 20

/** Poligono com os cantos arredondados (curvas quadraticas com o vertice como controle). */
function poligonoArredondado(pontos: Ponto[], raio: number): string {
  const n = pontos.length
  const partes: string[] = []
  for (let i = 0; i < n; i++) {
    const anterior = pontos[(i + n - 1) % n]
    const atual = pontos[i]
    const proximo = pontos[(i + 1) % n]
    const recuo = (a: Ponto, b: Ponto): Ponto => {
      const dx = a[0] - b[0]
      const dy = a[1] - b[1]
      const comprimento = Math.hypot(dx, dy)
      const r = Math.min(raio, comprimento / 2)
      return [b[0] + (dx / comprimento) * r, b[1] + (dy / comprimento) * r]
    }
    const entrada = recuo(anterior, atual)
    const saida = recuo(proximo, atual)
    partes.push(`${i === 0 ? 'M' : 'L'} ${entrada[0].toFixed(1)} ${entrada[1].toFixed(1)} Q ${atual[0]} ${atual[1]} ${saida[0].toFixed(1)} ${saida[1].toFixed(1)}`)
  }
  return `${partes.join(' ')} Z`
}

const LINHAS: Record<MedidaArmacao, Record<VarianteMedida, Linha>> = {
  ponte: {
    // Entre as bordas das lentes, onde estao mais proximas (parte de cima da ponte).
    correto: { de: [177, 74], ate: [223, 74] },
    // So o vao, entre as bordas de fora dos aros.
    erro1: { de: [189, 74], ate: [211, 74] },
    // Entre as bordas das lentes, mas mais embaixo, onde a distancia e maior.
    erro2: { de: [168, 120], ate: [232, 120] },
    // Mais embaixo e pelas bordas de fora.
    erro3: { de: [180, 120], ate: [220, 120] }
  },
  horizontal: {
    // Borda a borda da lente, na altura de maior largura.
    correto: { de: [223, 76], ate: [335, 76] },
    // Mais embaixo, onde a lente e mais estreita.
    erro1: { de: [234, 128], ate: [333, 128] },
    // Inclinada: sobe do nariz para a haste.
    erro2: { de: [224, 108], ate: [335, 76] },
    // Na altura certa, mas avancando sobre o aro dos dois lados.
    erro3: { de: [211, 76], ate: [347, 76] }
  },
  vertical: {
    // Borda a borda da lente, no ponto de maior altura.
    correto: { de: [320, 64], ate: [320, 140] },
    // Perto do nariz, onde a lente e mais baixa.
    erro1: { de: [244, 66], ate: [244, 133] },
    // Inclinada.
    erro2: { de: [290, 66], ate: [335, 140] },
    // Na posicao certa, mas avancando sobre o aro em cima e embaixo.
    erro3: { de: [320, 52], ate: [320, 152] }
  },
  diagonalMaior: {
    // Do canto de cima (nariz) ao de baixo (haste), de borda a borda.
    correto: { de: [224, 69], ate: [329, 139] },
    // A mesma diagonal, avancando sobre o aro nas duas pontas.
    erro1: { de: [212, 57], ate: [341, 152] },
    // A mesma diagonal, avancando sobre o aro em uma das pontas.
    erro2: { de: [212, 57], ate: [329, 139] },
    // A outra diagonal (de baixo, no nariz, a cima, na haste), que e mais curta.
    erro3: { de: [236, 131], ate: [334, 66] }
  }
}

const ROTULO_MEDIDA: Record<MedidaArmacao, string> = {
  ponte: 'ponte',
  horizontal: 'horizontal',
  vertical: 'vertical',
  diagonalMaior: 'diagonal maior'
}

interface Props {
  medida?: MedidaArmacao
  variante?: VarianteMedida
  className?: string
}

/**
 * Armacao base, com a linha da medida por cima (verde = jeito certo, vermelha = erro comum).
 * Sem `medida`/`variante` desenha so a armacao.
 */
export function ArmacaoIlustracao({ medida, variante, className }: Props): ReactNode {
  const direita = poligonoArredondado(LENTE_DIREITA, RAIO_CANTO)
  const esquerda = poligonoArredondado(LENTE_DIREITA.map(ESPELHO), RAIO_CANTO)
  const linha = medida && variante ? LINHAS[medida][variante] : null
  const cor = variante === 'correto' ? COR_CORRETO : COR_ERRO

  const descricao = linha
    ? `Armação com a medida ${ROTULO_MEDIDA[medida!]} ${variante === 'correto' ? 'feita do jeito certo' : `feita do jeito errado (${variante!.replace('erro', 'imagem ')})`}`
    : 'Armação de óculos vista de frente'

  return (
    <svg viewBox="10 38 380 128" role="img" aria-label={descricao} className={className} xmlns="http://www.w3.org/2000/svg">
      <title>{descricao}</title>
      {/* hastes curtas */}
      <path d="M 342 68 L 376 74 M 58 68 L 24 74" stroke="#3b464b" strokeWidth="9" strokeLinecap="round" fill="none" />
      {/* ponte */}
      <path d="M 183 78 Q 200 62 217 78" stroke="#3b464b" strokeWidth="9" strokeLinecap="round" fill="none" />
      {/* aros: lente vazia (fundo branco) */}
      <path d={esquerda} fill="#ffffff" stroke="#3b464b" strokeWidth={ARO} strokeLinejoin="round" />
      <path d={direita} fill="#ffffff" stroke="#3b464b" strokeWidth={ARO} strokeLinejoin="round" />
      {linha && (
        <g stroke={cor} fill={cor}>
          <line x1={linha.de[0]} y1={linha.de[1]} x2={linha.ate[0]} y2={linha.ate[1]} strokeWidth="3" strokeLinecap="round" />
          <circle cx={linha.de[0]} cy={linha.de[1]} r="4" stroke="none" />
          <circle cx={linha.ate[0]} cy={linha.ate[1]} r="4" stroke="none" />
        </g>
      )}
    </svg>
  )
}
