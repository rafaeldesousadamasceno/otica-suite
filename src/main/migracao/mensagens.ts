import type { PendenciaPrevista } from '@shared/importacao'

/**
 * Traduz o erro tecnico de um registro que falhou na importacao em algo que
 * o administrador entende: o que aconteceu e o que fazer. O texto original do
 * erro nunca se perde: vai junto no motivo, para quem precisar investigar.
 */
export function explicarFalha(
  err: unknown,
  contexto: { origemTabela: string; origemId: number; descricao: string }
): PendenciaPrevista {
  const tecnico = err instanceof Error ? err.message : 'Erro desconhecido'
  const base = { gravidade: 'erro' as const, origemTabela: contexto.origemTabela, origemId: contexto.origemId, dados: null }
  const quem = `${contexto.descricao} (código ${contexto.origemId} no sistema antigo)`

  if (/UNIQUE constraint failed: cliente\.cpf/i.test(tecnico)) {
    return {
      ...base,
      tipo: 'CPF_DUPLICADO',
      motivo: `${quem} não foi importado: o CPF dele já está cadastrado em outro cliente.`,
      sugestao: 'Rode a análise de novo: ela diferencia a mesma pessoa duplicada (une os cadastros) de pessoas diferentes com o mesmo CPF.'
    }
  }
  if (/NOT NULL constraint failed/i.test(tecnico)) {
    const campo = tecnico.split(':').pop()?.trim() ?? 'um campo'
    return {
      ...base,
      tipo: 'ERRO_IMPORTACAO',
      motivo: `${quem} não foi importado: falta um dado obrigatório (${campo}). Detalhe técnico: ${tecnico}`,
      sugestao: 'Complete esse dado no sistema antigo e importe de novo.'
    }
  }
  if (/FOREIGN KEY constraint failed/i.test(tecnico)) {
    return {
      ...base,
      tipo: 'ERRO_IMPORTACAO',
      motivo: `${quem} não foi importado: ele depende de outro cadastro que não existe aqui. Detalhe técnico: ${tecnico}`,
      sugestao: 'Importe de novo; se persistir, verifique se o cliente e o profissional desse registro foram importados.'
    }
  }
  if (/UNIQUE constraint failed/i.test(tecnico)) {
    return {
      ...base,
      tipo: 'ERRO_IMPORTACAO',
      motivo: `${quem} não foi importado: já existe um registro igual. Detalhe técnico: ${tecnico}`,
      sugestao: 'Confira se esse registro já não foi importado ou cadastrado à mão.'
    }
  }
  return {
    ...base,
    tipo: 'ERRO_IMPORTACAO',
    motivo: `${quem} não foi importado por um erro inesperado. Detalhe técnico: ${tecnico}`,
    sugestao: 'Importe de novo. Se o erro se repetir, anote o código do registro e o detalhe técnico acima para investigar.'
  }
}
