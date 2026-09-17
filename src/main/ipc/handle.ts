import { ipcMain } from 'electron'
import type { ZodType } from 'zod'
import { AppError } from '@main/errors'
import type { ApiResult } from '@shared/types'

/**
 * Registra um handler de IPC que:
 *  1. valida o payload com o schema Zod informado (quando ha um) - o
 *     renderer e sempre tratado como nao confiavel;
 *  2. converte qualquer excecao em ApiResult, nunca deixando o objeto de
 *     erro cru (stack trace, mensagem interna) vazar para a UI - o
 *     sistema anterior fazia `JOptionPane.showMessageDialog(null, e)` em
 *     mais de 30 pontos.
 */
export function handleIpc<TInput, TOutput>(
  channel: string,
  schema: ZodType<TInput> | null,
  fn: (input: TInput) => Promise<TOutput> | TOutput
): void {
  ipcMain.handle(channel, async (_event, rawInput): Promise<ApiResult<TOutput>> => {
    try {
      const input = schema ? schema.parse(rawInput) : (rawInput as TInput)
      const data = await fn(input)
      return { ok: true, data }
    } catch (err) {
      if (err instanceof AppError) {
        return { ok: false, error: { code: err.code, message: err.message } }
      }
      if (err && typeof err === 'object' && 'issues' in err) {
        // erro de validacao do Zod
        const zodErr = err as { issues: { message: string }[] }
        return {
          ok: false,
          error: { code: 'VALIDACAO', message: zodErr.issues[0]?.message ?? 'Dados inválidos.' }
        }
      }

      console.error(`[ipc:${channel}]`, err)
      return {
        ok: false,
        error: { code: 'ERRO_INTERNO', message: 'Ocorreu um erro inesperado. Tente novamente.' }
      }
    }
  })
}
