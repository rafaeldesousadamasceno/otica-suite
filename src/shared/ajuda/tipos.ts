/**
 * Conteudo da Ajuda do sistema. Fica em TypeScript estruturado (e nao em
 * markdown) para a mesma fonte alimentar a pagina de Ajuda e o PDF do manual,
 * sem parser nenhum e sem texto solto: tudo aqui e texto puro, que cada lado
 * escapa do seu jeito.
 */

export type BlocoAjuda =
  | { tipo: 'paragrafo'; texto: string }
  /** Passos numerados, na ordem em que a pessoa faz. */
  | { tipo: 'passos'; itens: string[] }
  | { tipo: 'lista'; itens: string[] }
  /** Atalho ou boa pratica. */
  | { tipo: 'dica'; titulo?: string; texto: string }
  /** Algo que pode dar errado ou que nao tem volta. */
  | { tipo: 'atencao'; titulo?: string; texto: string }
  | { tipo: 'tabela'; colunas: string[]; linhas: string[][] }

export interface SecaoAjuda {
  /** Usado na ancora (`/ajuda#clientes`) e no sumario. Unico. */
  id: string
  titulo: string
  /**
   * Rotas do app que esta secao explica. O botao "?" da barra superior abre a
   * secao da tela atual. `:id` casa com qualquer valor (`/clientes/:id`).
   */
  rotas: string[]
  /** So o Administrador usa a tela: o Vendedor nem ve a secao. */
  soAdmin?: boolean
  /** Uma frase: aparece no sumario e na busca. */
  resumo: string
  blocos: BlocoAjuda[]
}
