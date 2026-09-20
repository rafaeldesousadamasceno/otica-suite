import { describe, expect, it } from 'vitest'
import type { LicencaPayload } from './chave'
import {
  AVISO_DIAS,
  CARENCIA_DIAS,
  TESTE_DIAS,
  calcularLicenca,
  diasEntre,
  estendeLicenca,
  hojeLocalIso,
  type EntradaEstado
} from './estado'

const FP = 'ABCDEF0123456789ABCDEF0123456789'

function licenca(sobra: Partial<LicencaPayload> = {}): LicencaPayload {
  return { cliente: 'Clínica Teste', fingerprint: FP, validade: '2026-10-31', emitidoEm: '2026-10-01', plano: 'mensal', ...sobra }
}

function entrada(sobra: Partial<EntradaEstado> = {}): EntradaEstado {
  return { hoje: '2026-10-15', fingerprint: FP, inicioTeste: '2026-10-15', licenca: null, chaveRecusada: null, ...sobra }
}

describe('calcularLicenca — período de teste (sem chave)', () => {
  it('no dia da primeira abertura sobram os 14 dias inteiros', () => {
    const r = calcularLicenca(entrada())
    expect(r.estado).toBe('teste')
    expect(r.diasParaVencer).toBe(TESTE_DIAS)
    expect(r.somenteLeitura).toBe(false)
  })

  it('no 14º dia (13 dias depois) ainda é teste, com 1 dia restante', () => {
    const r = calcularLicenca(entrada({ inicioTeste: '2026-10-01', hoje: '2026-10-14' }))
    expect(r.estado).toBe('teste')
    expect(r.diasParaVencer).toBe(1)
  })

  it('14 dias depois o teste encerra e o app fica somente leitura', () => {
    const r = calcularLicenca(entrada({ inicioTeste: '2026-10-01', hoje: '2026-10-15' }))
    expect(r.estado).toBe('teste_encerrado')
    expect(r.somenteLeitura).toBe(true)
    expect(r.diasParaVencer).toBe(0)
  })

  it('início do teste no futuro nunca dá mais de 14 dias', () => {
    const r = calcularLicenca(entrada({ inicioTeste: '2030-01-01' }))
    expect(r.diasParaVencer).toBe(TESTE_DIAS)
  })

  it('propaga o motivo de uma chave recusada e o fingerprint da máquina', () => {
    const r = calcularLicenca(entrada({ chaveRecusada: 'outra_maquina' }))
    expect(r.chaveRecusada).toBe('outra_maquina')
    expect(r.fingerprint).toBe(FP)
  })
})

describe('calcularLicenca — licença mensal', () => {
  it('longe do vencimento: ativa', () => {
    const r = calcularLicenca(entrada({ licenca: licenca(), hoje: '2026-10-10' }))
    expect(r.estado).toBe('ativa')
    expect(r.cliente).toBe('Clínica Teste')
    expect(r.plano).toBe('mensal')
    expect(r.somenteLeitura).toBe(false)
  })

  it('a 10 dias do vencimento: começa o aviso (e com 11 ainda não)', () => {
    const dez = calcularLicenca(entrada({ licenca: licenca(), hoje: '2026-10-21' }))
    expect(dez.estado).toBe('proxima_vencimento')
    expect(dez.diasParaVencer).toBe(10)
    expect(calcularLicenca(entrada({ licenca: licenca(), hoje: '2026-10-20' })).estado).toBe('ativa')
  })

  it('no próprio dia da validade ainda vale (último dia de uso)', () => {
    const r = calcularLicenca(entrada({ licenca: licenca(), hoje: '2026-10-31' }))
    expect(r.estado).toBe('proxima_vencimento')
    expect(r.diasParaVencer).toBe(0)
    expect(r.somenteLeitura).toBe(false)
  })

  it('um dia depois: carência (ainda grava)', () => {
    const r = calcularLicenca(entrada({ licenca: licenca(), hoje: '2026-11-01' }))
    expect(r.estado).toBe('carencia')
    expect(r.diasParaVencer).toBe(-1)
    expect(r.somenteLeitura).toBe(false)
  })

  it('último dia da carência ainda grava; o seguinte vira somente leitura', () => {
    expect(calcularLicenca(entrada({ licenca: licenca(), hoje: '2026-11-07' })).estado).toBe('carencia')
    const r = calcularLicenca(entrada({ licenca: licenca(), hoje: '2026-11-08' }))
    expect(r.estado).toBe('vencida')
    expect(r.somenteLeitura).toBe(true)
    expect(CARENCIA_DIAS).toBe(7)
  })

  it('licença vencida NÃO volta ao período de teste, mesmo com teste nunca usado', () => {
    const r = calcularLicenca(entrada({ licenca: licenca(), hoje: '2027-03-01', inicioTeste: '2027-03-01' }))
    expect(r.estado).toBe('vencida')
  })
})

describe('calcularLicenca — plano anual e sem vencimento', () => {
  it('anual também avisa a 10 dias — a regra vale para qualquer plano', () => {
    const anual = licenca({ plano: 'anual', validade: '2027-09-30' })
    expect(calcularLicenca(entrada({ licenca: anual, hoje: '2027-09-20' })).estado).toBe('proxima_vencimento')
    expect(calcularLicenca(entrada({ licenca: anual, hoje: '2027-09-19' })).estado).toBe('ativa')
  })

  it('chave sem plano também avisa a 10 dias', () => {
    const semPlano = licenca({ plano: null, validade: '2026-10-31' })
    expect(calcularLicenca(entrada({ licenca: semPlano, hoje: '2026-10-21' })).estado).toBe('proxima_vencimento')
  })

  it('validade nula: sempre ativa, sem contagem', () => {
    const r = calcularLicenca(entrada({ licenca: licenca({ validade: null }), hoje: '2099-01-01' }))
    expect(r.estado).toBe('ativa')
    expect(r.diasParaVencer).toBeNull()
    expect(r.validade).toBeNull()
  })
})

describe('datas', () => {
  it('diasEntre conta dias inteiros, inclusive na virada de mês e ano bissexto', () => {
    expect(diasEntre('2026-10-31', '2026-11-01')).toBe(1)
    expect(diasEntre('2028-02-28', '2028-03-01')).toBe(2)
    expect(diasEntre('2026-10-15', '2026-10-15')).toBe(0)
    expect(diasEntre('2026-10-15', '2026-10-10')).toBe(-5)
  })

  it('hojeLocalIso usa o fuso da máquina, não UTC', () => {
    // 22h no Brasil (UTC-3) já é o dia seguinte em UTC — o app deve mostrar o dia local.
    expect(hojeLocalIso(new Date(2026, 9, 15, 22, 30))).toBe('2026-10-15')
    expect(hojeLocalIso(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05')
  })
})

describe('AVISO_DIAS', () => {
  it('são 10 dias', () => {
    expect(AVISO_DIAS).toBe(10)
  })
})

describe('estendeLicenca — a chave nova precisa aumentar o prazo', () => {
  it('sem licença instalada, qualquer chave serve', () => {
    expect(estendeLicenca(null, { validade: '2026-10-31' })).toBe(true)
  })

  it('validade mais tarde soma (é o caso normal de renovação encadeada)', () => {
    expect(estendeLicenca({ validade: '2026-10-31' }, { validade: '2026-11-30' })).toBe(true)
  })

  it('mesma validade ou mais curta não serve (evita perder dias por engano)', () => {
    expect(estendeLicenca({ validade: '2026-10-31' }, { validade: '2026-10-31' })).toBe(false)
    expect(estendeLicenca({ validade: '2026-10-31' }, { validade: '2026-09-30' })).toBe(false)
  })

  it('sem vencimento estende uma datada, mas uma datada nunca substitui a sem vencimento', () => {
    expect(estendeLicenca({ validade: '2026-10-31' }, { validade: null })).toBe(true)
    expect(estendeLicenca({ validade: null }, { validade: '2099-01-01' })).toBe(false)
    expect(estendeLicenca({ validade: null }, { validade: null })).toBe(false)
  })
})
