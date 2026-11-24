import { textoDaProva } from '../../../supabase/functions/pc-token/logica'
import type { IdentidadePc } from './identidadePc'

export class NuvemErro extends Error {
  constructor(
    public codigo: string,
    public status: number,
    mensagem: string
  ) {
    super(mensagem)
    this.name = 'NuvemErro'
  }
}

export interface ClienteNuvem {
  upsert(tabela: string, linhas: Record<string, unknown>[], recebidoEm: string): Promise<void>
  apagar(tabela: string, uuids: string[]): Promise<void>
  varrer(tabelas: string[], antesDe: string): Promise<void>
  gravarPainel(periodo: string, indicadores: unknown): Promise<void>
}

export interface ConfigCliente {
  url: string
  chaveAnon: string
  loja: { id: string; nome: string; cnpj: string | null }
  identidade: IdentidadePc
  obterLicenca(): string
  fetch?: typeof fetch
  agora?: () => number
}

const TIMEOUT_MS = 30_000
const MARGEM_MS = 5 * 60_000
const BLOCO_APAGAR = 100
/** Quanto do corpo de erro da nuvem vai para o log. */
const LIMITE_LOG_ERRO = 300

/**
 * A nuvem recusou de vez (4xx que não é 401, 408 nem 429): `NUVEM_RECUSOU`, que a tela mostra como erro.
 * O resto (5xx, 408, 429, 401 repetido) é `NUVEM_HTTP`: passa sozinho, o worker tenta de novo mais tarde.
 */
function codigoDoStatus(status: number): 'NUVEM_RECUSOU' | 'NUVEM_HTTP' {
  return status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429 ? 'NUVEM_RECUSOU' : 'NUVEM_HTTP'
}

/** Código e mensagem do erro do PostgREST (`{ code, message }`), cortados; corpo que não é JSON vira só texto. */
async function lerErro(r: Response): Promise<{ codigo: string | null; mensagem: string }> {
  let texto = ''
  try {
    texto = await r.text()
  } catch {
    // sem corpo
  }
  try {
    const j = JSON.parse(texto) as { code?: unknown; message?: unknown } | null
    return {
      codigo: typeof j?.code === 'string' ? j.code.slice(0, 20) : null,
      mensagem: typeof j?.message === 'string' ? j.message.slice(0, LIMITE_LOG_ERRO) : ''
    }
  } catch {
    return { codigo: null, mensagem: texto.slice(0, LIMITE_LOG_ERRO) }
  }
}

export function criarClienteNuvem(c: ConfigCliente): ClienteNuvem {
  const f = c.fetch ?? fetch
  const agora = c.agora ?? Date.now
  let token: { valor: string; validoAte: number } | null = null

  async function chamar(url: string, init: RequestInit): Promise<Response> {
    try {
      return await f(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch {
      throw new NuvemErro('REDE', 0, 'Sem conexão com a nuvem.')
    }
  }

  async function obterToken(): Promise<string> {
    if (token && agora() < token.validoAte) return token.valor
    const timestamp = new Date(agora()).toISOString()
    const assinatura = c.identidade.assinar(textoDaProva(c.loja.id, c.identidade.dispositivoId, timestamp))
    const r = await chamar(`${c.url}/functions/v1/pc-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: c.chaveAnon },
      body: JSON.stringify({
        licenca: c.obterLicenca(),
        loja: c.loja,
        dispositivo_id: c.identidade.dispositivoId,
        chave_publica: c.identidade.chavePublica,
        timestamp,
        assinatura
      })
    })
    if (!r.ok) {
      let codigo: string = codigoDoStatus(r.status)
      try {
        const corpo = (await r.json()) as { erro?: { codigo?: unknown } }
        if (typeof corpo?.erro?.codigo === 'string') codigo = corpo.erro.codigo
      } catch {
        // corpo ilegível: fica o código pelo status
      }
      throw new NuvemErro(codigo, r.status, `A nuvem recusou a conexão deste computador (${codigo}).`)
    }
    let corpo: { token?: unknown; expira_em?: unknown }
    try {
      corpo = (await r.json()) as typeof corpo
    } catch {
      throw new NuvemErro('NUVEM_HTTP', r.status, 'Resposta inválida da nuvem.')
    }
    if (typeof corpo.token !== 'string' || typeof corpo.expira_em !== 'number') {
      throw new NuvemErro('NUVEM_HTTP', r.status, 'Resposta inválida da nuvem.')
    }
    token = { valor: corpo.token, validoAte: corpo.expira_em * 1000 - MARGEM_MS }
    return token.valor
  }

  async function rest(metodo: string, caminho: string, corpo?: unknown, extra: Record<string, string> = {}): Promise<void> {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const t = await obterToken()
      const r = await chamar(`${c.url}/rest/v1/${caminho}`, {
        method: metodo,
        headers: {
          apikey: c.chaveAnon,
          Authorization: `Bearer ${t}`,
          'Content-Type': 'application/json',
          'Content-Profile': 'optialeph',
          'Accept-Profile': 'optialeph',
          ...extra
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo)
      })
      if (r.ok) return
      if (r.status === 401 && tentativa === 0) {
        token = null
        continue
      }
      // Diagnóstico só no log: tabela, status e código do PostgREST (nunca token, chave ou licença).
      const erro = await lerErro(r)
      const tabela = caminho.split('?')[0]
      console.error(
        `[nuvem] a nuvem recusou ${metodo} ${tabela} (HTTP ${r.status}${erro.codigo ? `, código ${erro.codigo}` : ''})`,
        erro.mensagem
      )
      throw new NuvemErro(codigoDoStatus(r.status), r.status, `A nuvem recusou a operação (HTTP ${r.status}).`)
    }
  }

  const gravar = { Prefer: 'resolution=merge-duplicates,return=minimal' }
  const lojaId = c.loja.id

  return {
    async upsert(tabela, linhas, recebidoEm) {
      if (linhas.length === 0) return
      const corpo = linhas.map((l) => ({ ...l, loja_id: lojaId, recebido_em: recebidoEm }))
      await rest('POST', `${tabela}?on_conflict=loja_id,uuid`, corpo, gravar)
    },
    async apagar(tabela, uuids) {
      for (let i = 0; i < uuids.length; i += BLOCO_APAGAR) {
        const bloco = uuids.slice(i, i + BLOCO_APAGAR)
        await rest('DELETE', `${tabela}?loja_id=eq.${lojaId}&uuid=in.(${bloco.join(',')})`, undefined, { Prefer: 'return=minimal' })
      }
    },
    async varrer(tabelas, antesDe) {
      for (const tabela of tabelas) {
        await rest('DELETE', `${tabela}?loja_id=eq.${lojaId}&recebido_em=lt.${encodeURIComponent(antesDe)}`, undefined, { Prefer: 'return=minimal' })
      }
    },
    async gravarPainel(periodo, indicadores) {
      const corpo = { loja_id: lojaId, periodo, indicadores, gerado_em: new Date(agora()).toISOString() }
      await rest('POST', 'painel_snapshot?on_conflict=loja_id,periodo', corpo, gravar)
    }
  }
}
