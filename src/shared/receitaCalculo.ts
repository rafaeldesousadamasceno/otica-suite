/**
 * Regras da receita optica usadas pelo formulario (na tela, enquanto se digita)
 * e pelo servico (ao salvar): as duas pontas fazem EXATAMENTE a mesma conta.
 */

/** "1,25", "+1.25", " -0,5 " -> numero; vazio ou texto que nao e numero -> null. */
export function paraNumeroGrau(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.')
  if (limpo === '') return null
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

/** 1.5 -> "1,50"; null -> "". Duas casas, virgula decimal (como a receita em papel). */
export function formatarGrau(v: number | null): string {
  return v === null ? '' : v.toFixed(2).replace('.', ',')
}

/**
 * RN-02: esferico de perto = esferico de longe + adicao, em passos de 0,25
 * (RN-03). Sem longe ou sem adicao nao ha o que calcular.
 */
export function calcularPertoEsf(longeEsf: number | null, adicao: number | null): number | null {
  if (longeEsf === null || adicao === null) return null
  // "+ 0" troca o -0 (ex.: -1,00 + 1,00) por 0.
  return Math.round((longeEsf + adicao) * 4) / 4 + 0
}

// ---------------------------------------------------------------------
// Tratamentos da lente: varios por receita, gravados num unico texto
// ---------------------------------------------------------------------

/** Separador do texto gravado: "ANTIRREFLEXO + FILTRO AZUL". Com espacos, para nao cortar valores antigos como "AR+FOTO". */
export const SEPARADOR_TRATAMENTOS = ' + '

/** Texto gravado -> lista. Um valor antigo (um tratamento so, ou texto livre da importacao) vira uma lista de um item. */
export function separarTratamentos(texto: string | null | undefined): string[] {
  if (!texto) return []
  const vistos = new Set<string>()
  for (const parte of texto.split(SEPARADOR_TRATAMENTOS)) {
    const t = parte.trim()
    if (t) vistos.add(t)
  }
  return [...vistos]
}

/** Lista -> texto gravado; lista vazia -> null (sem tratamento). */
export function juntarTratamentos(lista: string[]): string | null {
  const itens = lista.map((t) => t.trim()).filter(Boolean)
  return itens.length > 0 ? itens.join(SEPARADOR_TRATAMENTOS) : null
}
