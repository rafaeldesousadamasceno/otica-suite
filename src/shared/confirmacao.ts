/**
 * Texto das caixas de confirmacao (RG-01). Fica aqui, e nao no componente, para
 * o padrao de exclusao ser o mesmo em todo o sistema e poder ser testado.
 */

export const AVISO_IRREVERSIVEL = 'Esta ação não pode ser desfeita.'

export type ConfirmacaoExcluir = {
  variante: 'excluir'
  /** O que esta sendo excluido, em minusculas: "cliente", "prescrição". */
  entidade: string
  /** Identifica o item, ex.: "Prescrição de Maria Silva — 12/03/2026". */
  item: string
  /** Explicacao extra, quando a exclusao tem um efeito que merece ser dito. */
  detalhe?: string
  /** Troca o texto do botao ("Excluir" por padrao). */
  rotuloConfirmar?: string
}

export type ConfirmacaoPadrao = {
  variante?: 'padrao'
  titulo: string
  mensagem: string
  rotuloConfirmar?: string
  rotuloCancelar?: string
}

export type OpcoesConfirmacao = ConfirmacaoExcluir | ConfirmacaoPadrao

export interface ConfirmacaoMontada {
  titulo: string
  /** Linhas da mensagem, na ordem em que aparecem. */
  mensagens: string[]
  /** Linha de aviso destacada (so na exclusao). */
  aviso: string | null
  rotuloConfirmar: string
  rotuloCancelar: string
  destrutiva: boolean
}

export function montarConfirmacao(opcoes: OpcoesConfirmacao): ConfirmacaoMontada {
  if (opcoes.variante === 'excluir') {
    return {
      titulo: `Excluir ${opcoes.entidade}?`,
      mensagens: [opcoes.item, ...(opcoes.detalhe ? [opcoes.detalhe] : [])],
      aviso: AVISO_IRREVERSIVEL,
      rotuloConfirmar: opcoes.rotuloConfirmar ?? 'Excluir',
      rotuloCancelar: 'Cancelar',
      destrutiva: true
    }
  }
  return {
    titulo: opcoes.titulo,
    mensagens: [opcoes.mensagem],
    aviso: null,
    rotuloConfirmar: opcoes.rotuloConfirmar ?? 'Confirmar',
    rotuloCancelar: opcoes.rotuloCancelar ?? 'Cancelar',
    destrutiva: false
  }
}
