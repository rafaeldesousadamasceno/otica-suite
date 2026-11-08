import { describe, expect, it } from 'vitest'
import { PDF_MAXIMO_EM_MEMORIA, PDF_VALIDADE_MS, criarCachePdf, emPaisagem, tituloDoHtml, type PdfGerado } from './pdfCache'
import { pdfIdSchema } from '@shared/ipc'

function item(usuarioId: number, criadoEm: number, nome = 'a.pdf'): PdfGerado {
  return { html: '<html></html>', pdf: new Uint8Array([1, 2, 3]), nomeArquivo: nome, titulo: nome, usuarioId, criadoEm }
}

describe('criarCachePdf', () => {
  it('entrega o PDF so para quem gerou', () => {
    const cache = criarCachePdf(() => 1000)
    cache.guardar('x', item(7, 1000))
    expect(cache.obter('x', 7)?.nomeArquivo).toBe('a.pdf')
    expect(cache.obter('x', 8)).toBeNull()
  })

  it('o PDF vence depois do prazo', () => {
    let agora = 0
    const cache = criarCachePdf(() => agora)
    cache.guardar('x', item(1, 0))
    agora = PDF_VALIDADE_MS - 1
    expect(cache.obter('x', 1)).not.toBeNull()
    agora = PDF_VALIDADE_MS + 1
    expect(cache.obter('x', 1)).toBeNull()
    expect(cache.tamanho).toBe(0)
  })

  it('guarda no maximo alguns PDFs, tirando o mais antigo', () => {
    const cache = criarCachePdf(() => 0)
    for (let i = 0; i <= PDF_MAXIMO_EM_MEMORIA; i++) cache.guardar(`id${i}`, item(1, 0, `${i}.pdf`))
    expect(cache.tamanho).toBe(PDF_MAXIMO_EM_MEMORIA)
    expect(cache.obter('id0', 1)).toBeNull()
    expect(cache.obter(`id${PDF_MAXIMO_EM_MEMORIA}`, 1)).not.toBeNull()
  })

  it('descartar so vale para o dono, e limpar esvazia tudo', () => {
    const cache = criarCachePdf(() => 0)
    cache.guardar('x', item(1, 0))
    cache.descartar('x', 2)
    expect(cache.tamanho).toBe(1)
    cache.descartar('x', 1)
    expect(cache.tamanho).toBe(0)
    cache.guardar('y', item(1, 0))
    cache.limpar()
    expect(cache.tamanho).toBe(0)
  })
})

describe('tituloDoHtml e emPaisagem', () => {
  it('le o titulo e desfaz o escape', () => {
    expect(tituloDoHtml('<head><title>Receitas &amp; despesas</title></head>')).toBe('Receitas & despesas')
    expect(tituloDoHtml('<head><title>  </title></head>')).toBeNull()
    expect(tituloDoHtml('<p>sem titulo</p>')).toBeNull()
  })

  it('reconhece relatorio em paisagem pelo @page', () => {
    expect(emPaisagem('@page { size: A4 landscape; margin: 12mm; }')).toBe(true)
    expect(emPaisagem('@page { size: A4 portrait; }')).toBe(false)
  })
})

describe('pdfIdSchema', () => {
  it('aceita so o id gerado pelo main', () => {
    expect(pdfIdSchema.safeParse({ id: crypto.randomUUID() }).success).toBe(true)
    expect(pdfIdSchema.safeParse({ id: '../../etc' }).success).toBe(false)
  })
})
