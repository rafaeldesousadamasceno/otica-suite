import { describe, expect, it } from 'vitest'
import { repararMojibake, temMojibake } from './transformar'

/** Reproduz o que o banco antigo fez: UTF-8 lido como cp1252, `camadas` vezes. */
function estragar(texto: string, camadas: number): string {
  let atual = texto
  for (let i = 0; i < camadas; i++) atual = new TextDecoder('windows-1252').decode(new TextEncoder().encode(atual))
  return atual
}

describe('repararMojibake', () => {
  it.each([
    ['REBOLÇAS', 3],
    ['GONÇALVES', 3],
    ['ÁGAPTO GURGEL', 2],
    ['Inácio', 3],
    ['MARIA DA CONCEIÇÃO', 1],
    ['FÁDIA', 3]
  ])('desfaz %s com %i camada(s)', (original, camadas) => {
    const estragado = estragar(original, camadas)
    expect(estragado).not.toBe(original)
    expect(repararMojibake(estragado)).toBe(original)
  })

  it('nao mexe em texto correto', () => {
    for (const t of ['João', 'Conceição', 'Agnaldo Da Silva', 'ÁGUA', '', 'Ação', 'Bairro São José']) {
      expect(repararMojibake(t)).toBe(t)
    }
  })
})

describe('temMojibake', () => {
  it('reconhece o nome que ja foi importado quebrado (com o "ã" minusculo do title case)', () => {
    expect(temMojibake('Agnaldo Da Silva Rebolãƒâƒã¢â€â¡as')).toBe(true)
    expect(temMojibake('Agãpto Gurgel Filho')).toBe(true)
    expect(temMojibake('Aldinete Gonãƒâ‡alves')).toBe(true)
  })
  it('nao acusa nome correto', () => {
    for (const t of ['João Gonçalves', 'Conceição', 'Ângela', 'Ãngelo Souza', null]) expect(temMojibake(t)).toBe(false)
  })
})

describe('repararMojibake com coluna truncada', () => {
  it('repara o que da e descarta o caractere cortado ao meio', () => {
    const cortado = estragar('COLORAÇÃO', 3).slice(0, -2)
    const r = repararMojibake(cortado)
    expect(r.startsWith('COLORAÇ')).toBe(true)
    expect(temMojibake(r)).toBe(false)
  })
  it('nao corta texto correto', () => {
    expect(repararMojibake('João')).toBe('João')
    expect(repararMojibake('Ação')).toBe('Ação')
  })
})
