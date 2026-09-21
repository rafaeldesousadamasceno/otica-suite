import { afterEach, describe, expect, it, vi } from 'vitest'
import { dataLocalDeTimestampUtc, dataLocalISO, hojeLocal } from './data'

describe('datas locais', () => {
  afterEach(() => vi.useRealTimers())

  it('hojeLocal usa o dia do relogio local, nao o de UTC', () => {
    vi.useFakeTimers()
    // 22h no horario local: em UTC-3 ja e o dia seguinte em UTC.
    vi.setSystemTime(new Date(2026, 8, 20, 22, 30))
    expect(hojeLocal()).toBe('2026-09-20')
  })

  it('dataLocalISO completa mes e dia com zero', () => {
    expect(dataLocalISO(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('timestamp UTC do SQLite vira a data local', () => {
    const local = new Date(2026, 8, 20, 22, 30)
    const utc = local.toISOString().slice(0, 19).replace('T', ' ')
    expect(dataLocalDeTimestampUtc(utc)).toBe('2026-09-20')
  })
})
