import { readFileSync, renameSync, writeFileSync } from 'node:fs'

export interface EstadoNuvem {
  fingerprint: string
  cursor: number
}

/** Lê o estado do envio. Arquivo ausente ou inválido vira null, nunca lança. */
export function lerEstado(arquivo: string): EstadoNuvem | null {
  try {
    const j = JSON.parse(readFileSync(arquivo, 'utf8')) as Partial<EstadoNuvem> | null
    if (j && typeof j.fingerprint === 'string' && typeof j.cursor === 'number' && Number.isFinite(j.cursor)) {
      return { fingerprint: j.fingerprint, cursor: j.cursor }
    }
    return null
  } catch {
    return null
  }
}

/** Grava em <arquivo>.tmp e renomeia, para nunca deixar o arquivo pela metade. */
export function gravarEstado(arquivo: string, e: EstadoNuvem): void {
  const tmp = `${arquivo}.tmp`
  writeFileSync(tmp, JSON.stringify(e))
  renameSync(tmp, arquivo)
}
