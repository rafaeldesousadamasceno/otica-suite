import { describe, expect, it } from 'vitest'
import { montarDocumento, tabela } from './layout'
import { EMPRESA_EXEMPLO } from './relatoriosExemplo'

describe('montarDocumento', () => {
  it('paisagem e retrato vao para o @page', () => {
    expect(montarDocumento({ titulo: 'X', empresa: EMPRESA_EXEMPLO, orientacao: 'paisagem', corpo: '' })).toContain('size: A4 landscape')
    expect(montarDocumento({ titulo: 'X', empresa: EMPRESA_EXEMPLO, corpo: '' })).toContain('size: A4 portrait')
  })

  it('rodape com numero de pagina e a cor da otica aplicada', () => {
    const html = montarDocumento({ titulo: 'X', empresa: { ...EMPRESA_EXEMPLO, corDestaque: '#AA2266' }, corpo: '' })
    expect(html).toContain('counter(page)')
    expect(html).toContain('counter(pages)')
    expect(html).toContain('--rel-base: #aa2266')
  })

  it('escapa nome da otica, titulo e chips', () => {
    const html = montarDocumento({
      titulo: 'A <b>',
      chips: ['Filtro "x" & y'],
      empresa: { ...EMPRESA_EXEMPLO, nomeFantasia: 'Ótica <script>' },
      corpo: ''
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('Ótica &lt;script&gt;')
    expect(html).toContain('A &lt;b&gt;')
    expect(html).toContain('Filtro &quot;x&quot; &amp; y')
  })

  it('sem logo, mostra a inicial da otica', () => {
    expect(montarDocumento({ titulo: 'X', empresa: { ...EMPRESA_EXEMPLO, logoPath: null }, corpo: '' })).toContain('logo-inicial">M<')
  })
})

describe('tabela', () => {
  it('mensagem de vazio ocupa todas as colunas', () => {
    const html = tabela({ colunas: [{ label: 'A' }, { label: 'B', alinhar: 'direita' }], linhas: [], vazio: 'Nada aqui.' })
    expect(html).toContain('colspan="2"')
    expect(html).toContain('Nada aqui.')
  })
})
