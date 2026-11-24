// Edge Function `pc-token` (Supabase, Deno). Ver docs/Arquitetura-Sincronizacao.md.
//
// O PC da loja manda a licença (assinada pela Central) e uma prova de posse da chave do dispositivo; se tudo
// confere, recebe um token de 1 hora (role `authenticated`, com loja_id e dispositivo_id) para falar com o espelho.
//
// Publicar:  npx supabase functions deploy pc-token --no-verify-jwt   (o PC não tem login do Supabase)
// Segredos:  npx supabase secrets set PC_JWT_SECRET=<JWT secret legado do projeto>
//            npx supabase secrets set EXIGIR_RECURSO_NUVEM=false      (true quando a Central emitir 'nuvem')
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem dentro da função: a chave de serviço NUNCA sai daqui.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { ehUuid, licencaLiberaNuvem, montarJwtDoPc, normalizarCnpj, verificarLicenca, verificarProvaDoPc } from './logica.ts'

// Chave PÚBLICA do produto (a mesma de src/main/license/chavePublica.ts). Só verifica; não emite licença.
const CHAVE_PUBLICA_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAj/DWcVL5+ZaBhdSiUGdlcXSnlQ+m/DT+mtOg61LUXsY=
-----END PUBLIC KEY-----`

const CABECALHOS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }

function resposta(status: number, corpo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(corpo), { status, headers: CABECALHOS })
}
const recusa = (status: number, codigo: string, mensagem: string) => resposta(status, { erro: { codigo, mensagem } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return recusa(405, 'METODO', 'Use POST.')

  let corpo: Record<string, any>
  try {
    corpo = await req.json()
  } catch {
    return recusa(400, 'JSON_INVALIDO', 'Corpo inválido.')
  }

  const { licenca, loja, dispositivo_id: dispositivoId, chave_publica: chavePublica, timestamp, assinatura } = corpo
  if (
    typeof licenca !== 'string' ||
    !loja || !ehUuid(loja.id) || typeof loja.nome !== 'string' || loja.nome.length < 1 || loja.nome.length > 200 ||
    !ehUuid(dispositivoId) ||
    typeof chavePublica !== 'string' || chavePublica.length > 512 ||
    typeof timestamp !== 'string' || typeof assinatura !== 'string'
  ) {
    return recusa(400, 'DADOS_INVALIDOS', 'Dados incompletos ou inválidos.')
  }
  const cnpj = normalizarCnpj(loja.cnpj) // inválido vira null em vez de 500 no insert da loja

  // 1) Licença assinada pela Central, em dia, com o recurso de nuvem (quando exigido).
  const lic = await verificarLicenca(licenca, CHAVE_PUBLICA_PEM)
  if (!lic) return recusa(403, 'LICENCA_INVALIDA', 'Licença inválida.')
  const hoje = new Date().toISOString().slice(0, 10)
  const motivoLicenca = licencaLiberaNuvem(lic, hoje, Deno.env.get('EXIGIR_RECURSO_NUVEM') === 'true')
  if (motivoLicenca === 'LICENCA_VENCIDA') return recusa(403, motivoLicenca, 'Licença vencida.')
  if (motivoLicenca) return recusa(403, motivoLicenca, 'Esta licença não inclui a nuvem.')

  // 2) Prova de que o PC tem a chave privada do dispositivo (impede copiar o dispositivo_id de outro PC).
  const motivoProva = await verificarProvaDoPc(chavePublica, loja.id, dispositivoId, timestamp, assinatura, Date.now())
  if (motivoProva) return recusa(403, motivoProva, 'Prova de identidade do PC inválida ou expirada.')

  const segredo = Deno.env.get('PC_JWT_SECRET')
  const url = Deno.env.get('SUPABASE_URL')
  const chaveServico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!segredo || !url || !chaveServico) {
    console.error('pc-token: variáveis de ambiente ausentes')
    return recusa(500, 'CONFIGURACAO', 'Serviço não configurado.')
  }
  const db = createClient(url, chaveServico, { auth: { persistSession: false }, db: { schema: 'optialeph' } })

  try {
    // 3) Loja: a primeira licença a registrar fica dona dela; outra licença não assume o id.
    const { data: lojaExistente, error: eLoja } = await db
      .from('loja').select('id, licenca_cliente, sincronizacao_ligada').eq('id', loja.id).maybeSingle()
    if (eLoja) throw eLoja
    if (lojaExistente) {
      if (lojaExistente.licenca_cliente && lojaExistente.licenca_cliente !== lic.cliente) {
        return recusa(403, 'LOJA_DE_OUTRA_LICENCA', 'Esta loja está vinculada a outra licença.')
      }
      if (!lojaExistente.sincronizacao_ligada) return recusa(403, 'SINCRONIZACAO_DESLIGADA', 'A sincronização desta loja está desligada.')
      if (!lojaExistente.licenca_cliente) await db.from('loja').update({ licenca_cliente: lic.cliente }).eq('id', loja.id)
    } else {
      const { error } = await db.from('loja').insert({ id: loja.id, nome: loja.nome, cnpj, licenca_cliente: lic.cliente })
      if (error) throw error
    }

    // 4) Dispositivo: conhecido precisa da MESMA chave e não estar revogado; novo só entra se a loja não tem PC executor.
    const { data: disp, error: eDisp } = await db
      .from('dispositivo').select('id, loja_id, tipo, chave_publica, revogado_em').eq('id', dispositivoId).maybeSingle()
    if (eDisp) throw eDisp
    if (disp) {
      if (disp.loja_id !== loja.id || disp.tipo !== 'pc' || disp.chave_publica !== chavePublica) {
        return recusa(403, 'DISPOSITIVO_NAO_CONFERE', 'Dispositivo não confere com o cadastrado.')
      }
      if (disp.revogado_em) return recusa(403, 'DISPOSITIVO_REVOGADO', 'Este computador foi desconectado da nuvem.')
    } else {
      const { count, error } = await db
        .from('dispositivo').select('id', { count: 'exact', head: true })
        .eq('loja_id', loja.id).eq('tipo', 'pc').eq('executor', true).is('revogado_em', null)
      if (error) throw error
      if ((count ?? 0) > 0) {
        return recusa(409, 'PC_NOVO_PRECISA_APROVACAO', 'A loja já tem um computador conectado. Aprove a troca pelo celular do Administrador.')
      }
      const { error: eIns } = await db.from('dispositivo').insert({
        id: dispositivoId, loja_id: loja.id, tipo: 'pc', chave_publica: chavePublica, executor: true
      })
      if (eIns) throw eIns
    }
    await db.from('dispositivo').update({ ultimo_contato_em: new Date().toISOString() }).eq('id', dispositivoId)

    // 5) Token de 1 hora.
    const { token, expiraEm } = await montarJwtDoPc(
      { loja_id: loja.id, dispositivo_id: dispositivoId, agora: Math.floor(Date.now() / 1000) },
      segredo
    )
    return resposta(200, { token, expira_em: expiraEm })
  } catch (err) {
    console.error('pc-token:', err) // detalhe só no log do servidor, nunca na resposta
    return recusa(500, 'ERRO_INTERNO', 'Não foi possível concluir. Tente novamente.')
  }
})
