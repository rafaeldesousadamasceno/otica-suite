import type { ReactNode } from 'react'
import type { Olho } from '@shared/prescricao'

/**
 * Oculos de frente com um olho em destaque (a lente com a sigla) e uma mao cobrindo o
 * outro - o jeito de lembrar que a medida e de um olho de cada vez. No Direito a lente
 * em destaque fica a esquerda; no Esquerdo, a direita (como o paciente e visto de frente).
 * Desenho proprio, nas cores do sistema.
 */
export function IconeOlho({ olho, className }: { olho: Olho; className?: string }): ReactNode {
  const sigla = olho === 'Od' ? 'OD' : 'OE'
  const xDestaque = olho === 'Od' ? 17 : 63
  const xCoberta = olho === 'Od' ? 63 : 17
  // A mao aponta para o lado de dentro do desenho: palma sobre a lente coberta e dedos para cima.
  return (
    <svg viewBox="0 0 80 44" role="img" aria-label={`Olho ${olho === 'Od' ? 'direito' : 'esquerdo'}`} className={className} xmlns="http://www.w3.org/2000/svg">
      {/* hastes e ponte */}
      <path d="M 4 14 L 1 12 M 76 14 L 79 12" stroke="var(--ink-2)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M 33 17 Q 40 11 47 17" stroke="var(--ink-2)" strokeWidth="3" strokeLinecap="round" fill="none" />
      {/* lente em destaque */}
      <ellipse cx={xDestaque} cy="22" rx="15" ry="13" fill="var(--accent)" fillOpacity="0.14" stroke="var(--accent)" strokeWidth="3" />
      <text x={xDestaque} y="26" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--accent)" fontFamily="Inter, sans-serif">
        {sigla}
      </text>
      {/* lente coberta */}
      <ellipse cx={xCoberta} cy="22" rx="15" ry="13" fill="var(--surface)" stroke="var(--ink-3)" strokeWidth="3" />
      {/* mao: palma e quatro dedos */}
      <g fill="var(--ink-3)" stroke="var(--surface)" strokeWidth="1.2" strokeLinejoin="round">
        <rect x={xCoberta - 10} y="16" width="20" height="21" rx="7" />
        <rect x={xCoberta - 10} y="6" width="4.6" height="16" rx="2.3" />
        <rect x={xCoberta - 4.6} y="3" width="4.6" height="19" rx="2.3" />
        <rect x={xCoberta + 0.8} y="4" width="4.6" height="18" rx="2.3" />
        <rect x={xCoberta + 6} y="8" width="4.6" height="14" rx="2.3" />
      </g>
    </svg>
  )
}
