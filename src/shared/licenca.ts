import type { LicencaBanner, LicencaInfo } from './types'

/** Dias em que uma licenca vencida ainda edita, antes de virar somente leitura (RF-13.4). Mesmo valor do Visium. */
export const CARENCIA_DIAS = 7

/**
 * Reduz `LicencaInfo` ao que o banner mostra. Puro: e aqui (e nao na tela)
 * que se conta quantos dias de carencia restam, para a regra ficar ao lado da
 * constante que a define. `diasParaVencer` e negativo depois de vencer
 * (-1 = venceu ontem), e o ultimo dia de carencia e -CARENCIA_DIAS.
 */
export function paraBanner(info: LicencaInfo): LicencaBanner {
  const emCarencia = info.estado === 'carencia' && info.diasParaVencer !== null
  return {
    estado: info.estado,
    validade: info.validade,
    diasParaVencer: info.diasParaVencer,
    carenciaRestanteDias: emCarencia ? CARENCIA_DIAS + info.diasParaVencer! + 1 : null
  }
}

export type TomBanner = 'ok' | 'erro'

export interface TextoBanner {
  tom: TomBanner
  texto: string
  /** Rotulo do link para a tela Licenca; null quando quem le nao pode abri-la. */
  acao: string | null
}

export function formatarDataBr(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

function dias(n: number): string {
  return n === 1 ? '1 dia' : `${n} dias`
}

/**
 * Texto e cor do banner (mesma linha do Visium). Perto de vencer, em carencia
 * e vencida usam o mesmo vermelho de proposito: e o momento de agir.
 * `podeRenovar` = perfil com acesso a tela Licenca (Administrador); os demais
 * recebem o mesmo aviso, mandando falar com ele.
 */
export function descreverBanner(b: LicencaBanner, podeRenovar: boolean): TextoBanner {
  const quem = podeRenovar ? 'Renove e cadastre a nova chave em Licença' : 'Avise o administrador do sistema'
  const acao = podeRenovar ? 'Ativar / renovar' : null
  const ate = b.validade ? formatarDataBr(b.validade) : ''

  switch (b.estado) {
    case 'teste':
      return {
        tom: 'ok',
        texto: `Período de teste: ${b.diasParaVencer === 1 ? 'resta 1 dia' : `restam ${b.diasParaVencer ?? 0} dias`}. Depois disso o sistema fica somente leitura até ativar uma licença.`,
        acao
      }
    case 'teste_encerrado':
      return {
        tom: 'erro',
        texto: `O período de teste terminou e o sistema está em somente leitura — seus dados estão preservados. ${quem} para voltar a editar.`,
        acao
      }
    case 'proxima_vencimento':
      return {
        tom: 'erro',
        texto: `Faltam ${dias(b.diasParaVencer ?? 0)} para a licença vencer (${ate}). ${quem} — o tempo restante é somado.`,
        acao
      }
    case 'carencia':
      return {
        tom: 'erro',
        texto: `A licença venceu em ${ate}. Você ainda pode editar por mais ${dias(b.carenciaRestanteDias ?? 0)}. ${quem}.`,
        acao
      }
    case 'vencida':
      return {
        tom: 'erro',
        texto: `A licença venceu em ${ate} e o sistema está em somente leitura — seus dados estão preservados. ${quem} para voltar a editar.`,
        acao
      }
    case 'ativa':
      return {
        tom: 'ok',
        texto: b.validade
          ? `Licença ativa até ${ate} (${dias(b.diasParaVencer ?? 0)}).`
          : 'Licença perpétua ativa.',
        acao: null
      }
  }
}
