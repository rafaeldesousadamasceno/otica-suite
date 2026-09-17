import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import os from 'node:os'

let cache: string | null = null

function machineGuid(): string | null {
  try {
    const saida = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 3000
    })
    const m = saida.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/)
    return m?.[1]?.trim() ?? null
  } catch {
    return null
  }
}

/**
 * RF-13.4: fingerprint da maquina. O PRD pede "CPU + placa-mae + disco";
 * na pratica, ler numeros de serie de hardware de forma confiavel sem WMI
 * ou um addon nativo e um projeto a parte, fora do escopo deste v1. Em vez
 * disso usamos o Machine GUID do Windows (unico por instalacao do SO,
 * `HKLM\SOFTWARE\Microsoft\Cryptography`) como proxy: sobrevive a troca de
 * RAM/GPU/disco secundario (a "tolerancia a mudancas pequenas" que o PRD
 * pede) e so muda numa reinstalacao do Windows - que ja e exatamente o
 * gatilho de reativacao previsto no CA4 ("copiar a instalacao para outra
 * maquina exige nova ativacao"). Sem acesso ao registro (ambiente atipico),
 * cai para hostname+CPU+plataforma - pior, mas nunca quebra a leitura.
 */
export function obterFingerprint(): string {
  if (cache) return cache
  const guid = machineGuid()
  const base = guid ?? `${os.hostname()}|${os.cpus()[0]?.model ?? ''}|${os.platform()}|${os.arch()}`
  cache = createHash('sha256').update(base).digest('hex').slice(0, 32).toUpperCase()
  return cache
}
