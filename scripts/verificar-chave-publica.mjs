// Roda automaticamente antes de `npm run dist:win` (hook "predist:win" do npm).
// Barra o instalador enquanto a chave pública embutida for a provisória: com ela
// nenhuma licença emitida pela Central de Licenças consegue ser ativada, e o
// cliente ficaria preso no período de teste.
import { readFileSync } from 'node:fs'

const arquivo = new URL('../src/main/license/chavePublica.ts', import.meta.url)
const fonte = readFileSync(arquivo, 'utf8')

if (/CHAVE_PUBLICA_E_PROVISORIA\s*=\s*true/.test(fonte)) {
  console.error(`
✖ Instalador bloqueado: a chave pública de licença ainda é a PROVISÓRIA.

  1. Na Central de Licenças: Produtos → copie a chave pública do produto.
  2. Cole em src/main/license/chavePublica.ts e troque CHAVE_PUBLICA_E_PROVISORIA para false.
  3. Rode "npm run dist:win" de novo.
`)
  process.exit(1)
}
console.log('✔ Chave pública de licença definitiva.')
