import { describe, expect, it } from 'vitest'
import { montarLinkWhatsapp, normalizarCelularBR, preencherModelo, primeiroNome } from './whatsapp'

describe('normalizarCelularBR', () => {
  it('aceita o celular com mascara, com DDI e com zero antes do DDD', () => {
    expect(normalizarCelularBR('(11) 98765-4321')).toBe('5511987654321')
    expect(normalizarCelularBR('+55 11 98765-4321')).toBe('5511987654321')
    expect(normalizarCelularBR('5511987654321')).toBe('5511987654321')
    expect(normalizarCelularBR('011 98765-4321')).toBe('5511987654321')
  })

  it('numero antigo de 8 digitos que comeca com 6-9 ganha o 9 da frente', () => {
    expect(normalizarCelularBR('(11) 8765-4321')).toBe('5511987654321')
  })

  it('fixo nao tem WhatsApp comum: devolve null', () => {
    expect(normalizarCelularBR('(11) 3456-7890')).toBeNull()
    expect(normalizarCelularBR('3456-7890')).toBeNull()
  })

  it('vazio, lixo e tamanho errado devolvem null', () => {
    expect(normalizarCelularBR(null)).toBeNull()
    expect(normalizarCelularBR(undefined)).toBeNull()
    expect(normalizarCelularBR('')).toBeNull()
    expect(normalizarCelularBR('sem celular')).toBeNull()
    expect(normalizarCelularBR('12345')).toBeNull()
    expect(normalizarCelularBR('(11) 98765-43210')).toBeNull()
  })

  it('DDD invalido devolve null', () => {
    expect(normalizarCelularBR('(09) 98765-4321')).toBeNull()
  })

  it('nunca "conserta" um zero ambiguo: tirar o 0 de (09) transformaria o 9 em DDD e mandaria a mensagem para outra pessoa', () => {
    expect(normalizarCelularBR('09 98765-4321')).toBeNull()
    expect(normalizarCelularBR('011 8765-4321')).toBeNull()
    expect(normalizarCelularBR('0011987654321')).toBeNull()
  })
})

describe('primeiroNome', () => {
  it('pega o primeiro nome com so a inicial maiuscula', () => {
    expect(primeiroNome('MARIA DAS DORES')).toBe('Maria')
    expect(primeiroNome('  joão   silva ')).toBe('João')
    expect(primeiroNome('')).toBe('')
  })
})

describe('preencherModelo', () => {
  it('troca os placeholders conhecidos', () => {
    expect(preencherModelo('Olá, {nome}! Aqui é da {otica}.', { nome: 'Ana', otica: 'Ótica Sol' })).toBe(
      'Olá, Ana! Aqui é da Ótica Sol.'
    )
  })

  it('troca todas as ocorrencias do mesmo placeholder', () => {
    expect(preencherModelo('{nome}, {nome}!', { nome: 'Ana' })).toBe('Ana, Ana!')
  })

  it('placeholder desconhecido fica visivel (o Admin ve o erro de digitacao)', () => {
    expect(preencherModelo('OS {numero_os} de {nom}', { nome: 'Ana' })).toBe('OS {numero_os} de {nom}')
  })
})

describe('montarLinkWhatsapp', () => {
  it('monta o link wa.me com a mensagem codificada', () => {
    expect(montarLinkWhatsapp('5511987654321', 'Olá, João!')).toBe('https://wa.me/5511987654321?text=Ol%C3%A1%2C%20Jo%C3%A3o!')
  })

  it('nao deixa a mensagem injetar parametros na URL', () => {
    const link = montarLinkWhatsapp('5511987654321', 'a&b=c#x')
    expect(link).toBe('https://wa.me/5511987654321?text=a%26b%3Dc%23x')
  })
})
