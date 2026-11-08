import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { hojeLocal } from '@shared/data'
import { PRESETS_PERIODO, resolverPreset, validarPeriodo, type Periodo, type PresetPeriodo } from '@shared/periodos'
import type { DashboardQuery } from '@shared/ipc'

const PRESET_PADRAO: PresetPeriodo = 'esteMes'

export interface FiltroDashboard {
  preset: PresetPeriodo
  periodo: Periodo
  comparar: boolean
  vendedorId: number | null
  /** Erro de validacao do periodo personalizado (o painel continua no ultimo periodo valido). */
  erroPeriodo: string | null
  query: DashboardQuery
  setPreset: (preset: PresetPeriodo) => void
  setPersonalizado: (inicio: string, fim: string) => void
  setComparar: (comparar: boolean) => void
  setVendedor: (vendedorId: number | null) => void
}

/**
 * Filtro do painel guardado na URL (`?p=esteMes&cmp=0&v=2&de=...&ate=...`).
 * Assim abrir uma lista pelo painel e voltar mantem o periodo, e o atalho
 * ("este mes") e sempre recalculado contra o "hoje" de verdade.
 */
export function useFiltroDashboard(): FiltroDashboard {
  const [params, setParams] = useSearchParams()

  const presetParam = params.get('p')
  const preset: PresetPeriodo = PRESETS_PERIODO.includes(presetParam as PresetPeriodo) ? (presetParam as PresetPeriodo) : PRESET_PADRAO
  const de = params.get('de') ?? ''
  const ate = params.get('ate') ?? ''
  const comparar = params.get('cmp') !== '0'
  const vendedorParam = Number(params.get('v'))
  const vendedorId = Number.isInteger(vendedorParam) && vendedorParam > 0 ? vendedorParam : null

  const hoje = hojeLocal()
  const { periodo, erroPeriodo } = useMemo(() => {
    if (preset !== 'personalizado') return { periodo: resolverPreset(preset, hoje), erroPeriodo: null }
    const escolhido = { inicio: de, fim: ate }
    const erro = de && ate ? validarPeriodo(escolhido) : 'Informe as duas datas.'
    return { periodo: erro ? resolverPreset('esteMes', hoje) : escolhido, erroPeriodo: erro }
  }, [preset, de, ate, hoje])

  const atualizar = useCallback(
    (mudar: (p: URLSearchParams) => void) =>
      setParams(
        (atual) => {
          const novo = new URLSearchParams(atual)
          mudar(novo)
          return novo
        },
        { replace: true }
      ),
    [setParams]
  )

  return {
    preset,
    periodo,
    comparar,
    vendedorId,
    erroPeriodo,
    query: { dataInicio: periodo.inicio, dataFim: periodo.fim, preset, comparar, vendedorId: vendedorId ?? undefined },
    setPreset: (novo) =>
      atualizar((p) => {
        p.set('p', novo)
        if (novo === 'personalizado' && !p.get('de')) {
          // Comeca o personalizado de onde o atalho atual estava.
          p.set('de', periodo.inicio)
          p.set('ate', periodo.fim)
        }
      }),
    setPersonalizado: (inicio, fim) =>
      atualizar((p) => {
        p.set('p', 'personalizado')
        p.set('de', inicio)
        p.set('ate', fim)
      }),
    setComparar: (valor) => atualizar((p) => (valor ? p.delete('cmp') : p.set('cmp', '0'))),
    setVendedor: (id) => atualizar((p) => (id === null ? p.delete('v') : p.set('v', String(id))))
  }
}
