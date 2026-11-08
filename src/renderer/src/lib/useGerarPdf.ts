import { useMutation, type UseMutationResult } from '@tanstack/react-query'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { toast } from '@renderer/state/toastStore'
import { usePdfViewerStore } from '@renderer/state/pdfViewerStore'
import type { ApiResult, PdfVisualizacao } from '@shared/types'

/**
 * Gera um PDF no main e abre no visualizador do sistema. Salvar e imprimir
 * ficam no proprio visualizador.
 */
export function useGerarPdf<TVars = void>(
  gerar: (vars: TVars) => Promise<ApiResult<PdfVisualizacao>>
): UseMutationResult<PdfVisualizacao, Error, TVars> {
  const abrir = usePdfViewerStore((s) => s.abrir)
  return useMutation({
    mutationFn: (vars: TVars) => unwrap(gerar(vars)),
    onSuccess: abrir,
    onError: (err) => toast.error(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })
}
