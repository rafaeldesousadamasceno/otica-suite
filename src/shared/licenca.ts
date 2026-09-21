import type { EstadoLicenca } from './types'

/** Dias em que uma licenca vencida ainda edita, antes de virar somente leitura (RF-13.4). Mesmo valor do Visium. */
export const CARENCIA_DIAS = 7

/**
 * Estados em que o Administrador precisa agir (renovar/ativar). Alimenta o
 * ponto de alerta no item "Licenca" do menu. O teste em andamento nao entra:
 * ainda nao ha nada vencendo, e o alerta desde o primeiro dia viraria ruido.
 */
export function licencaPedeAtencao(estado: EstadoLicenca): boolean {
  return (
    estado === 'proxima_vencimento' ||
    estado === 'carencia' ||
    estado === 'vencida' ||
    estado === 'teste_encerrado'
  )
}
