import { describe, expect, it } from 'vitest'
import { montarBlocoPrescricao, montarHtmlPrescricao } from './prescricaoHtml'
import { EMPRESA_EXEMPLO, RECEITA_EXEMPLO } from './relatoriosExemplo'
import type { ReceitaOptica } from '@shared/types'

// Texto como o papel mostra: sem estilo, sem negrito (que fica no meio da frase) e com as demais tags virando espaco.
const visivel = (html: string): string =>
  html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<\/?b>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

const VAZIA: ReceitaOptica = {
  ...RECEITA_EXEMPLO,
  longeOdAlt: null, longeOeAlt: null, longeOdPrisma: 0, longeOePrisma: 0, longeOdBasePrisma: 'NENHUM', longeOeBasePrisma: 'NENHUM',
  indiceRefracao: null, tipoLente: null, tratamentos: null, armacao: null, armacaoTipo: null, armacaoModelo: null, armacaoMarca: null, armacaoCor: null,
  ponte: null, horizontal: null, vertical: null, diagonalMaior: null, observacao: null, profissionalNome: null
}

describe('impressão da prescrição', () => {
  it('Direito e Esquerdo, com Longe, Perto e o que estiver preenchido', () => {
    const t = visivel(montarBlocoPrescricao(RECEITA_EXEMPLO))
    for (const trecho of ['Direito (OD)', 'Esquerdo (OE)', 'Longe', 'Perto', '-1,25', '+0,75', 'Adição 2,00', 'Altura 18 mm', 'MULTIFOCAL', '1,56', 'ANTIRRISCO + ANTIRREFLEXO BLUE', 'ACETATO', 'RB5154', 'RAY-BAN', 'PRETA', 'Ponte 18 · H 52 · V 40 · DM 55']) {
      expect(t, trecho).toContain(trecho)
    }
  })

  it('o que está vazio não aparece: sem prisma, sem altura, sem medidas, sem DP', () => {
    const t = visivel(montarBlocoPrescricao(VAZIA))
    expect(t).not.toMatch(/Prisma|Altura|Medidas da armação|Índice|Tratamentos|Armação|DP Longe|DP Perto/)
  })

  it('prisma só sai quando maior que zero, com a base', () => {
    const t = visivel(montarBlocoPrescricao({ ...VAZIA, longeOdPrisma: 1.5, longeOdBasePrisma: 'NASAL' }))
    expect(t).toContain('Prisma 1,50 Δ, base nasal')
  })

  it('DP só sai com a preferência ligada, e só o que existe', () => {
    expect(visivel(montarBlocoPrescricao(RECEITA_EXEMPLO))).not.toContain('DP Longe')
    const ligada = visivel(montarBlocoPrescricao(RECEITA_EXEMPLO, { exibirDp: true }))
    expect(ligada).toContain('DP Longe 63,5 mm')
    expect(ligada).toContain('DP Perto 60,5 mm')
    expect(visivel(montarBlocoPrescricao({ ...RECEITA_EXEMPLO, dpPerto: null }, { exibirDp: true }))).not.toContain('DP Perto')
  })

  it('armação do formato anterior (texto livre) continua saindo', () => {
    const t = visivel(montarBlocoPrescricao({ ...VAZIA, armacao: 'RAY-BAN ANTIGA' }))
    expect(t).toContain('RAY-BAN ANTIGA')
  })

  it('formato anterior: sem adição por olho, com o aviso', () => {
    const t = visivel(montarBlocoPrescricao({ ...RECEITA_EXEMPLO, formatoAnterior: true, adicaoOd: null, adicaoOe: null }))
    expect(t).not.toContain('Adição')
    expect(t).toContain('registrada no formato anterior')
  })

  it('documento completo: cliente, título e assinatura do profissional; texto do usuário é escapado', () => {
    const html = montarHtmlPrescricao({ ...RECEITA_EXEMPLO, observacao: '<b>cor</b> verde' }, { nome: 'Maria <Silva>' }, EMPRESA_EXEMPLO)
    const t = visivel(html)
    expect(t).toContain('Prescrição')
    expect(html).toContain('Maria &lt;Silva&gt;')
    expect(html).not.toContain('<b>cor</b>')
    expect(html).toContain('&lt;b&gt;cor&lt;/b&gt;')
    expect(t).toContain('Assinatura do profissional')
  })
})
