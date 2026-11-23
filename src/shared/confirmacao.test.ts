import { describe, expect, it } from 'vitest'
import { AVISO_IRREVERSIVEL, montarConfirmacao } from './confirmacao'

describe('montarConfirmacao', () => {
  it('exclusao: titulo com a entidade, item identificado, aviso e botao vermelho', () => {
    const c = montarConfirmacao({ variante: 'excluir', entidade: 'prescrição', item: 'Prescrição de Maria Silva — 12/03/2026' })
    expect(c).toEqual({
      titulo: 'Excluir prescrição?',
      mensagens: ['Prescrição de Maria Silva — 12/03/2026'],
      aviso: AVISO_IRREVERSIVEL,
      rotuloConfirmar: 'Excluir',
      rotuloCancelar: 'Cancelar',
      destrutiva: true
    })
    expect(AVISO_IRREVERSIVEL).toBe('Esta ação não pode ser desfeita.')
  })

  it('exclusao com detalhe e botao com outro nome', () => {
    const c = montarConfirmacao({
      variante: 'excluir',
      entidade: 'logo',
      item: 'Logo atual',
      detalhe: 'O sistema volta a mostrar o ícone padrão.',
      rotuloConfirmar: 'Remover'
    })
    expect(c.mensagens).toEqual(['Logo atual', 'O sistema volta a mostrar o ícone padrão.'])
    expect(c.rotuloConfirmar).toBe('Remover')
    expect(c.destrutiva).toBe(true)
  })

  it('confirmacao comum: sem aviso de irreversivel e sem botao vermelho', () => {
    const c = montarConfirmacao({ titulo: 'Importar dados?', mensagem: 'Vai tirar um backup.', rotuloConfirmar: 'Importar' })
    expect(c).toEqual({
      titulo: 'Importar dados?',
      mensagens: ['Vai tirar um backup.'],
      aviso: null,
      rotuloConfirmar: 'Importar',
      rotuloCancelar: 'Cancelar',
      destrutiva: false
    })
  })
})
