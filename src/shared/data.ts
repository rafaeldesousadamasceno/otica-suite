/**
 * "Hoje" e datas do calendario no fuso do computador da ótica.
 *
 * `new Date().toISOString().slice(0, 10)` devolve a data em UTC: no Brasil
 * (UTC-3) isso vira o dia seguinte depois das 21h. Toda data de negócio
 * (venda, vencimento, aniversariantes, "hoje" do painel) sai daqui.
 * Contas puramente de calendário (somar dias/meses) continuam podendo usar
 * Date.UTC, porque ali não há fuso envolvido.
 */
export function dataLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function hojeLocal(): string {
  return dataLocalISO(new Date())
}

/**
 * Data local de um timestamp gravado pelo SQLite (`datetime('now')`:
 * 'AAAA-MM-DD HH:MM:SS' em UTC, sem 'Z'). Devolve 'AAAA-MM-DD'.
 */
export function dataLocalDeTimestampUtc(timestamp: string): string {
  const d = new Date(timestamp.includes('T') ? timestamp : `${timestamp.replace(' ', 'T')}Z`)
  return Number.isNaN(d.getTime()) ? timestamp.slice(0, 10) : dataLocalISO(d)
}
