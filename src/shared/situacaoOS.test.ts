import { describe, expect, it } from 'vitest'
import { proximaSituacao, podeCancelar, transicaoValida, campoDataDaSituacao, rotuloAvanco } from './situacaoOS'

describe('proximaSituacao (RN-04)', () => {
  it('segue o fluxo EM ABERTO -> LABORATÓRIO -> CHEGOU -> ENTREGUE', () => {
    expect(proximaSituacao('EM ABERTO')).toBe('LABORATÓRIO')
    expect(proximaSituacao('LABORATÓRIO')).toBe('CHEGOU')
    expect(proximaSituacao('CHEGOU')).toBe('ENTREGUE')
  })

  it('ENTREGUE é o fim da linha', () => {
    expect(proximaSituacao('ENTREGUE')).toBeNull()
  })

  it('CANCELADA não avança para lugar nenhum', () => {
    expect(proximaSituacao('CANCELADA')).toBeNull()
  })
})

describe('podeCancelar', () => {
  it('pode cancelar em qualquer estado exceto ENTREGUE e CANCELADA', () => {
    expect(podeCancelar('EM ABERTO')).toBe(true)
    expect(podeCancelar('LABORATÓRIO')).toBe(true)
    expect(podeCancelar('CHEGOU')).toBe(true)
    expect(podeCancelar('ENTREGUE')).toBe(false)
    expect(podeCancelar('CANCELADA')).toBe(false)
  })
})

describe('transicaoValida', () => {
  it('aceita so o proximo passo do fluxo, nunca pular etapa', () => {
    expect(transicaoValida('EM ABERTO', 'LABORATÓRIO')).toBe(true)
    expect(transicaoValida('EM ABERTO', 'CHEGOU')).toBe(false)
    expect(transicaoValida('EM ABERTO', 'ENTREGUE')).toBe(false)
  })

  it('aceita cancelar de qualquer estado nao finalizado', () => {
    expect(transicaoValida('LABORATÓRIO', 'CANCELADA')).toBe(true)
    expect(transicaoValida('ENTREGUE', 'CANCELADA')).toBe(false)
  })
})

describe('campoDataDaSituacao', () => {
  it('mapeia cada situacao ao campo de data que ela preenche', () => {
    expect(campoDataDaSituacao('LABORATÓRIO')).toBe('dataEnvio')
    expect(campoDataDaSituacao('CHEGOU')).toBe('dataChegada')
    expect(campoDataDaSituacao('ENTREGUE')).toBe('dataEntrega')
    expect(campoDataDaSituacao('EM ABERTO')).toBeNull()
    expect(campoDataDaSituacao('CANCELADA')).toBeNull()
  })
})

describe('rotuloAvanco', () => {
  it('da um rotulo de balcao para cada avanco, e nulo no fim da linha', () => {
    expect(rotuloAvanco('EM ABERTO')).toBe('Enviar ao laboratório')
    expect(rotuloAvanco('LABORATÓRIO')).toBe('Registrar chegada')
    expect(rotuloAvanco('CHEGOU')).toBe('Entregar ao cliente')
    expect(rotuloAvanco('ENTREGUE')).toBeNull()
    expect(rotuloAvanco('CANCELADA')).toBeNull()
  })
})
