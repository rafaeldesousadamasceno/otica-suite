import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { unwrap } from '@renderer/lib/ipc'
import type { UnidadeMedida } from '@shared/types'

export const CHAVE_UNIDADES_MEDIDA = ['unidadesMedida'] as const

/** Todas as unidades, inclusive as desativadas (cada tela filtra o que precisa). */
export function useUnidadesMedida(): UseQueryResult<UnidadeMedida[]> {
  return useQuery({
    queryKey: CHAVE_UNIDADES_MEDIDA,
    queryFn: () => unwrap(window.api.unidadesMedida.list())
  })
}

/** "CX – CAIXA". So a sigla quando a descricao falta ou repete a sigla ("PAR"). */
export function rotuloUnidade(u: Pick<UnidadeMedida, 'sigla' | 'descricao'>): string {
  return u.descricao && u.descricao !== u.sigla ? `${u.sigla} – ${u.descricao}` : u.sigla
}
