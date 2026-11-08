import { describe, expect, it } from 'vitest'
import { SECOES_AJUDA, secoesDoPerfil, type SecaoAjuda } from '@shared/ajuda'
import { montarHtmlManual } from './manualHtml'
import { EMPRESA_EXEMPLO } from './relatoriosExemplo'

const OPCOES = { versao: '0.2.0', geradoEm: '2026-11-07' }

function textoVisivel(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
}

describe('montarHtmlManual', () => {
  it('capa com a otica, versao e data, e sumario com todas as secoes', () => {
    const html = montarHtmlManual(SECOES_AJUDA, EMPRESA_EXEMPLO, OPCOES)
    const texto = textoVisivel(html)
    expect(texto).toContain('Manual do Usuário')
    expect(texto).toContain('MD Óculos')
    expect(texto).toContain('Versão 0.2.0')
    expect(texto).toContain('07/11/2026')
    expect(html.match(/<section class="manual-secao"/g)).toHaveLength(SECOES_AJUDA.length)
    for (const s of SECOES_AJUDA) expect(texto, s.titulo).toContain(s.titulo)
  })

  it('o manual do Vendedor nao traz as telas do Administrador', () => {
    const html = montarHtmlManual(secoesDoPerfil('vendedor'), EMPRESA_EXEMPLO, OPCOES)
    const texto = textoVisivel(html)
    expect(texto).toContain('Vendas')
    expect(texto).not.toContain('Fornecedores e compras')
    expect(texto).not.toContain('Importar dados do MD Óculos')
  })

  it('sem cabecalho padrao (a capa e propria) e com rodape de pagina', () => {
    const html = montarHtmlManual(SECOES_AJUDA, EMPRESA_EXEMPLO, OPCOES)
    expect(html).not.toContain('class="cabecalho"')
    expect(html).toContain('counter(page)')
    expect(html).toContain('class="capa"')
  })

  it('escapa todo o texto das secoes', () => {
    const secao: SecaoAjuda = {
      id: 'teste',
      titulo: 'A <script>x</script>',
      rotas: [],
      resumo: 'r & s',
      blocos: [
        { tipo: 'paragrafo', texto: '<img src=x onerror=alert(1)>' },
        { tipo: 'tabela', colunas: ['<b>c</b>'], linhas: [['<i>v</i>']] },
        { tipo: 'dica', titulo: '<u>t</u>', texto: '"aspas"' }
      ]
    }
    const html = montarHtmlManual([secao], EMPRESA_EXEMPLO, OPCOES)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<i>v</i>')
    expect(html).toContain('A &lt;script&gt;x&lt;/script&gt;')
    expect(html).toContain('&lt;i&gt;v&lt;/i&gt;')
  })
})
