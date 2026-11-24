// Teste de ponta a ponta da Edge Function pc-token contra o projeto real.
//
// Uso (PowerShell):
//   $env:SUPABASE_URL = "https://<ref>.supabase.co"
//   $env:SUPABASE_ANON_KEY = "<chave anon/publishable: Project Settings > API>"
//   $env:LICENCA = "<chave de licenca emitida pela Central para QUALQUER fingerprint, com validade futura>"
//   node scripts/testar-pc-token.mjs
//
// Gera um par de chaves de PC descartavel, pede o token, e prova que o PostgREST ACEITA o token:
// grava e le uma linha de teste no espelho (lista_valor) da loja de teste, depois apaga.
// A loja criada usa um id de teste; apague-a no painel (Table Editor > optialeph.loja) quando terminar.
// Nada de segredo e impresso. NAO use a chave service_role aqui.
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto'

const { SUPABASE_URL, SUPABASE_ANON_KEY, LICENCA } = process.env
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !LICENCA) {
  console.error('Defina SUPABASE_URL, SUPABASE_ANON_KEY e LICENCA (veja o topo deste arquivo).')
  process.exit(1)
}

const lojaId = randomUUID()
const dispositivoId = randomUUID()
const par = generateKeyPairSync('ed25519')
const chavePublica = par.publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
const timestamp = new Date().toISOString()
const assinatura = sign(
  null,
  Buffer.from(`optialeph-pc-token|${lojaId}|${dispositivoId}|${timestamp}`),
  par.privateKey
).toString('base64url')

const passo = (ok, texto) => console.log(`${ok ? 'OK  ' : 'FALHA'} ${texto}`)

const r = await fetch(`${SUPABASE_URL}/functions/v1/pc-token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    licenca: LICENCA,
    loja: { id: lojaId, nome: 'LOJA DE TESTE (apagar)' },
    dispositivo_id: dispositivoId,
    chave_publica: chavePublica,
    timestamp,
    assinatura
  })
})
const corpo = await r.json()
passo(r.status === 200 && !!corpo.token, `pc-token respondeu ${r.status}${corpo.erro ? ` (${corpo.erro.codigo})` : ''}`)
if (!corpo.token) process.exit(1)

const rest = (metodo, caminho, extra = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    method: metodo,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${corpo.token}`,
      'Content-Type': 'application/json',
      'Accept-Profile': 'optialeph',
      'Content-Profile': 'optialeph',
      Prefer: 'return=representation',
      ...extra.headers
    },
    body: extra.body ? JSON.stringify(extra.body) : undefined
  })

const uuid = randomUUID()
const ins = await rest('POST', 'lista_valor', {
  body: { loja_id: lojaId, uuid, tipo: 'teste', valor: 'ok', ordem: 0, ativo: 1, sync_rev: 1 }
})
passo(ins.status === 201, `PC grava no espelho da propria loja (HTTP ${ins.status})`)

const le = await rest('GET', `lista_valor?uuid=eq.${uuid}`)
const linhas = le.ok ? await le.json() : []
passo(linhas.length === 1, `PC le o que gravou (${linhas.length} linha)`)

const outra = await rest('POST', 'lista_valor', {
  body: { loja_id: randomUUID(), uuid: randomUUID(), tipo: 'teste', valor: 'x', ordem: 0, ativo: 1, sync_rev: 1 }
})
passo(outra.status >= 400, `PC NAO grava em outra loja (HTTP ${outra.status})`)

const del = await rest('DELETE', `lista_valor?uuid=eq.${uuid}`)
passo(del.ok, `linha de teste apagada (HTTP ${del.status})`)
console.log(`\nLoja de teste: ${lojaId} (apague em optialeph.loja; o dispositivo some junto).`)
