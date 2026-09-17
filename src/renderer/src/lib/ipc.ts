import type { ApiResult } from '@shared/types'

/** Erro amigavel derivado de um ApiResult com ok:false. */
export class ApiCallError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'ApiCallError'
  }
}

/**
 * Desembrulha um ApiResult: retorna o dado em caso de sucesso, ou lanca
 * um ApiCallError com a mensagem ja pronta para mostrar ao usuario. Toda
 * chamada a window.api passa por aqui - nenhuma tela trata `{ ok, data }`
 * manualmente.
 */
export async function unwrap<T>(promise: Promise<ApiResult<T>>): Promise<T> {
  const result = await promise
  if (result.ok) return result.data
  throw new ApiCallError(result.error.code, result.error.message)
}
