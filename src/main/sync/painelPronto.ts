import { calcularResumo } from '@main/services/dashboardService'
import { resolverPreset, type PresetPeriodo } from '@shared/periodos'

export type PeriodoPainel = 'hoje' | 'mes' | 'mes_anterior' | 'avisos'

/**
 * Snapshots do painel que o worker envia para a nuvem. Usa o mesmo calculo da
 * tela (`calcularResumo`), como administrador e sem completar recorrencias:
 * o worker nao tem sessao e nao pode escrever no banco.
 */
export function montarPaineis(hoje: string): Record<PeriodoPainel, unknown> {
  const resumo = (preset: PresetPeriodo) => {
    const p = resolverPreset(preset, hoje)
    return calcularResumo(
      { dataInicio: p.inicio, dataFim: p.fim, preset, comparar: true },
      { perfil: 'admin', usuarioId: 0, completarRecorrencias: false }
    )
  }
  const mes = resumo('esteMes')
  return {
    hoje: resumo('hoje'),
    mes,
    mes_anterior: resumo('mesAnterior'),
    avisos: { insights: mes.insights, posicao: mes.posicao }
  }
}
