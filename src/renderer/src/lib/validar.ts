import type { ZodType } from 'zod'

/**
 * Valida com o MESMO schema do servidor e, se falhar, lanca um Error com a primeira mensagem em portugues
 * (o `.parse` cru joga um ZodError cuja mensagem e o JSON das falhas, que nao serve para mostrar na tela).
 */
export function validarOuErro<T>(schema: ZodType<T>, dados: unknown): T {
  const resultado = schema.safeParse(dados)
  if (!resultado.success) throw new Error(resultado.error.issues[0]?.message ?? 'Dados inválidos.')
  return resultado.data
}
