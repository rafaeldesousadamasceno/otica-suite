import type { Perfil } from '../types'
import { SECOES_AJUDA } from './conteudo'
import type { BlocoAjuda, SecaoAjuda } from './tipos'

export { SECOES_AJUDA } from './conteudo'
export type { BlocoAjuda, SecaoAjuda } from './tipos'

/** Secoes que o perfil pode ver: o Vendedor nao ve o que e so do Administrador. */
export function secoesDoPerfil(perfil: Perfil, secoes: SecaoAjuda[] = SECOES_AJUDA): SecaoAjuda[] {
  return perfil === 'admin' ? secoes : secoes.filter((s) => !s.soAdmin)
}

/** Minusculas e sem acento: "Licença" casa com "licenca". */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** Todo o texto de um bloco, em linha corrida (para a busca). */
export function textoDoBloco(bloco: BlocoAjuda): string {
  switch (bloco.tipo) {
    case 'paragrafo':
      return bloco.texto
    case 'passos':
    case 'lista':
      return bloco.itens.join(' ')
    case 'dica':
    case 'atencao':
      return `${bloco.titulo ?? ''} ${bloco.texto}`
    case 'tabela':
      return `${bloco.colunas.join(' ')} ${bloco.linhas.map((l) => l.join(' ')).join(' ')}`
  }
}

/**
 * Busca por palavras: a secao precisa ter TODAS as palavras digitadas, em
 * qualquer lugar do titulo, do resumo ou do corpo. Titulo e resumo pesam mais
 * na ordem. Termo vazio devolve tudo, na ordem do manual.
 */
export function buscarSecoes(secoes: SecaoAjuda[], termo: string): SecaoAjuda[] {
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean)
  if (palavras.length === 0) return secoes

  const pontuadas: { secao: SecaoAjuda; pontos: number; ordem: number }[] = []
  secoes.forEach((secao, ordem) => {
    const titulo = normalizar(secao.titulo)
    const resumo = normalizar(secao.resumo)
    const corpo = normalizar(secao.blocos.map(textoDoBloco).join(' '))
    if (!palavras.every((p) => titulo.includes(p) || resumo.includes(p) || corpo.includes(p))) return
    const pontos = palavras.reduce((s, p) => s + (titulo.includes(p) ? 3 : 0) + (resumo.includes(p) ? 1 : 0), 0)
    pontuadas.push({ secao, pontos, ordem })
  })
  return pontuadas.sort((a, b) => b.pontos - a.pontos || a.ordem - b.ordem).map((p) => p.secao)
}

/** `/clientes/:id` casa com `/clientes/7`; devolve quantos trechos fixos o padrao tem, ou -1 se nao casa. */
function especificidade(padrao: string, caminho: string): number {
  const a = padrao.split('/').filter(Boolean)
  const b = caminho.split('/').filter(Boolean)
  if (a.length !== b.length) return -1
  let fixos = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) continue
    if (a[i] !== b[i]) return -1
    fixos++
  }
  return fixos + (a.length === 0 ? 0.5 : 0)
}

/** Secao que explica a tela do caminho dado (`/clientes/7` -> ficha do cliente). `null` se nao houver. */
export function secaoParaRota(caminho: string, secoes: SecaoAjuda[] = SECOES_AJUDA): SecaoAjuda | null {
  const limpo = caminho.split('?')[0].split('#')[0]
  let melhor: { secao: SecaoAjuda; pontos: number } | null = null
  for (const secao of secoes) {
    for (const rota of secao.rotas) {
      const pontos = especificidade(rota, limpo)
      if (pontos >= 0 && (!melhor || pontos > melhor.pontos)) melhor = { secao, pontos }
    }
  }
  return melhor?.secao ?? null
}
