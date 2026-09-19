import { getDb } from '@main/db/connection'
import { MOTIVOS_CONTATO } from '@shared/types'
import { normalizarCelularBR, primeiroNome } from '@shared/whatsapp'
import type { ClienteSemContato, ContatoPendente, MotivoContato } from '@shared/types'

/**
 * Janelas de cada gatilho. Sao janelas (nao "tudo que ja passou") de proposito:
 * sem elas, os clientes importados do sistema antigo inundariam a lista no
 * primeiro dia com anos de exames e entregas velhas.
 */
const JANELA_ANIVERSARIO_DIAS = 7
const RENOVACAO_MESES_MIN = 12
const RENOVACAO_MESES_MAX = 15
const POS_VENDA_DIAS_MIN = 7
const POS_VENDA_DIAS_MAX = 30
const LIMITE_POR_MOTIVO = 100

/** O que o main precisa para montar a mensagem; a tela nunca recebe `variaveis`. */
export interface PendenteInterno extends ContatoPendente {
  variaveis: Record<string, string>
}

// --- datas (ISO 'YYYY-MM-DD', em UTC - o mesmo criterio de venda.data e dos outros paineis) ---

function somarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10)
}

function somarMeses(iso: string, meses: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  const alvo = new Date(Date.UTC(ano, mes - 1 + meses, 1))
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  alvo.setUTCDate(Math.min(dia, ultimoDia))
  return alvo.toISOString().slice(0, 10)
}

function diasEntre(deIso: string, ateIso: string): number {
  const [a1, m1, d1] = deIso.slice(0, 10).split('-').map(Number)
  const [a2, m2, d2] = ateIso.slice(0, 10).split('-').map(Number)
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000)
}

function dataBr(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

function brl(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ')
}

function haQuantosDias(dias: number): string {
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  return `há ${dias} dias`
}

// --- montagem ---

interface ClienteBase {
  cliente_id: number
  nome: string
  celular: string | null
  telefone: string | null
}

/** Prefere o celular; se ele nao serve para WhatsApp, cai para o telefone (que pode ser um celular). */
function escolherTelefone(c: ClienteBase): string | null {
  if (normalizarCelularBR(c.celular)) return c.celular
  if (normalizarCelularBR(c.telefone)) return c.telefone
  return c.celular?.trim() || c.telefone?.trim() || null
}

function montar(
  motivo: MotivoContato,
  c: ClienteBase,
  referencia: string,
  detalhe: string,
  data: string,
  variaveis: Record<string, string> = {}
): PendenteInterno {
  const telefone = escolherTelefone(c)
  return {
    chave: `${motivo}:${c.cliente_id}:${referencia}`,
    motivo,
    clienteId: c.cliente_id,
    clienteNome: c.nome,
    celular: telefone,
    referencia,
    detalhe,
    data,
    temWhatsapp: normalizarCelularBR(telefone) !== null,
    variaveis: { nome: primeiroNome(c.nome), ...variaveis }
  }
}

const CLIENTE_ATIVO_E_ACEITA = 'c.ativo = 1 AND c.aceita_contato = 1'

export const relacionamentoRepository = {
  /**
   * Quem precisa de contato em `hoje`, sem quem ja foi contatado por aquela
   * OCORRENCIA nem quem pediu para nao ser chamado. Cada motivo devolve no
   * maximo LIMITE_POR_MOTIVO, do mais antigo (mais urgente) para o mais novo.
   */
  listarPendentes(hoje: string): PendenteInterno[] {
    const db = getDb()
    const jaContatados = new Set(
      (
        db.prepare('SELECT cliente_id, motivo, referencia FROM contato').all() as unknown as {
          cliente_id: number
          motivo: string
          referencia: string
        }[]
      ).map((r) => `${r.motivo}:${r.cliente_id}:${r.referencia}`)
    )

    const todos: PendenteInterno[] = []

    // ANIVERSARIO: hoje e os proximos dias. A ocorrencia e o ano em que a data cai.
    const janela = Array.from({ length: JANELA_ANIVERSARIO_DIAS }, (_, i) => somarDias(hoje, i))
    const dataPorMesDia = new Map(janela.map((d) => [d.slice(5), d]))
    const paramsAniv: Record<string, string> = {}
    const marcadores = janela.map((d, i) => {
      paramsAniv[`d${i}`] = d.slice(5)
      return `:d${i}`
    })
    const aniversarios = db
      .prepare(
        `SELECT c.id AS cliente_id, c.nome, c.celular, c.telefone, strftime('%m-%d', c.data_nasc) AS mes_dia
         FROM cliente c
         WHERE ${CLIENTE_ATIVO_E_ACEITA} AND c.data_nasc IS NOT NULL
           AND strftime('%m-%d', c.data_nasc) IN (${marcadores.join(',')})`
      )
      .all(paramsAniv) as unknown as (ClienteBase & { mes_dia: string })[]
    for (const r of aniversarios) {
      const data = dataPorMesDia.get(r.mes_dia)!
      const detalhe = data === hoje ? 'Faz aniversário hoje' : `Faz aniversário em ${data.slice(8)}/${data.slice(5, 7)}`
      todos.push(montar('ANIVERSARIO', r, data.slice(0, 4), detalhe, data))
    }

    // RETIRADA: oculos que chegaram e ainda nao foram retirados - o contato de maior valor, no dia da chegada.
    const retiradas = db
      .prepare(
        `SELECT os.id, os.numero, COALESCE(os.data_chegada, substr(os.data_abertura, 1, 10)) AS desde,
                c.id AS cliente_id, c.nome, c.celular, c.telefone
         FROM ordem_servico os
         INNER JOIN cliente c ON c.id = os.cliente_id
         WHERE os.situacao = 'CHEGOU' AND ${CLIENTE_ATIVO_E_ACEITA}`
      )
      .all() as unknown as (ClienteBase & { id: number; numero: string; desde: string })[]
    for (const r of retiradas) {
      const detalhe = `Óculos da OS ${r.numero} chegaram ${haQuantosDias(diasEntre(r.desde, hoje))}`
      todos.push(montar('RETIRADA', r, String(r.id), detalhe, r.desde.slice(0, 10), { numero_os: r.numero }))
    }

    // COBRANCA: um item por cliente com parcela vencida; a ocorrencia e a parcela mais antiga em atraso.
    const cobrancas = db
      .prepare(
        `SELECT c.id AS cliente_id, c.nome, c.celular, c.telefone,
                COUNT(*) AS qtd,
                SUM(cr.valor_centavos - COALESCE(
                  (SELECT SUM(r.valor_centavos) FROM recebimento r WHERE r.conta_receber_id = cr.id), 0
                )) AS restante,
                MIN(cr.vencimento) AS mais_antiga,
                (SELECT cr2.id FROM conta_receber cr2
                 WHERE cr2.cliente_id = c.id AND cr2.situacao = 'ABERTA' AND cr2.vencimento < :hoje
                 ORDER BY cr2.vencimento, cr2.id LIMIT 1) AS parcela_ref
         FROM conta_receber cr
         INNER JOIN cliente c ON c.id = cr.cliente_id
         WHERE cr.situacao = 'ABERTA' AND cr.vencimento < :hoje AND ${CLIENTE_ATIVO_E_ACEITA}
         GROUP BY c.id, c.nome, c.celular, c.telefone`
      )
      .all({ hoje }) as unknown as (ClienteBase & {
      qtd: number
      restante: number
      mais_antiga: string
      parcela_ref: number
    })[]
    for (const r of cobrancas) {
      const detalhe = `${r.qtd} ${r.qtd === 1 ? 'parcela vencida' : 'parcelas vencidas'} (${brl(r.restante)}), a mais antiga venceu em ${dataBr(r.mais_antiga)}`
      todos.push(
        montar('COBRANCA', r, String(r.parcela_ref), detalhe, r.mais_antiga, {
          valor: brl(r.restante),
          vencimento: dataBr(r.mais_antiga)
        })
      )
    }

    // POS_VENDA: entregues ha uns dias - "esta tudo bem com os oculos?".
    const posVendas = db
      .prepare(
        `SELECT os.id, os.numero, os.data_entrega, c.id AS cliente_id, c.nome, c.celular, c.telefone
         FROM ordem_servico os
         INNER JOIN cliente c ON c.id = os.cliente_id
         WHERE os.situacao = 'ENTREGUE' AND os.data_entrega IS NOT NULL
           AND os.data_entrega <= :ate AND os.data_entrega >= :desde AND ${CLIENTE_ATIVO_E_ACEITA}`
      )
      .all({ ate: somarDias(hoje, -POS_VENDA_DIAS_MIN), desde: somarDias(hoje, -POS_VENDA_DIAS_MAX) }) as unknown as (ClienteBase & {
      id: number
      numero: string
      data_entrega: string
    })[]
    for (const r of posVendas) {
      const detalhe = `Óculos da OS ${r.numero} entregues ${haQuantosDias(diasEntre(r.data_entrega, hoje))}`
      todos.push(montar('POS_VENDA', r, String(r.id), detalhe, r.data_entrega.slice(0, 10), { numero_os: r.numero }))
    }

    // RENOVACAO: ultimo exame ha 12-15 meses e nenhuma compra desde entao.
    const limiteMax = somarMeses(hoje, -RENOVACAO_MESES_MIN)
    const limiteMin = somarMeses(hoje, -RENOVACAO_MESES_MAX)
    const renovacoes = db
      .prepare(
        `SELECT c.id AS cliente_id, c.nome, c.celular, c.telefone, r.id AS receita_id, r.data_exame
         FROM cliente c
         INNER JOIN receita_optica r ON r.id = (
           SELECT r2.id FROM receita_optica r2
           WHERE r2.cliente_id = c.id ORDER BY r2.data_exame DESC, r2.id DESC LIMIT 1
         )
         WHERE ${CLIENTE_ATIVO_E_ACEITA}
           AND r.data_exame <= :limiteMax AND r.data_exame > :limiteMin
           AND NOT EXISTS (
             SELECT 1 FROM venda v
             WHERE v.cliente_id = c.id AND v.situacao != 'CANCELADA' AND v.data > :limiteMax
           )`
      )
      .all({ limiteMax, limiteMin }) as unknown as (ClienteBase & { receita_id: number; data_exame: string })[]
    for (const r of renovacoes) {
      const meses = Math.round(diasEntre(r.data_exame, hoje) / 30.44)
      todos.push(
        montar('RENOVACAO', r, String(r.receita_id), `Último exame em ${dataBr(r.data_exame)} (há ${meses} meses)`, r.data_exame.slice(0, 10))
      )
    }

    // Filtra os ja contatados ANTES de limitar - senao os contatados esconderiam os novos atras do corte.
    const pendentes = todos.filter((p) => !jaContatados.has(p.chave))
    const contagem: Partial<Record<MotivoContato, number>> = {}
    return pendentes
      .sort(
        (a, b) =>
          MOTIVOS_CONTATO.indexOf(a.motivo) - MOTIVOS_CONTATO.indexOf(b.motivo) ||
          a.data.localeCompare(b.data) ||
          a.clienteNome.localeCompare(b.clienteNome)
      )
      .filter((p) => {
        contagem[p.motivo] = (contagem[p.motivo] ?? 0) + 1
        return contagem[p.motivo]! <= LIMITE_POR_MOTIVO
      })
  },

  /** true se registrou; false se essa ocorrencia ja estava registrada (registrar duas vezes e inofensivo). */
  registrarContato(dados: {
    clienteId: number
    motivo: MotivoContato
    referencia: string
    observacao: string | null
    usuarioId: number
  }): boolean {
    const info = getDb()
      .prepare(
        `INSERT OR IGNORE INTO contato (cliente_id, motivo, referencia, observacao, usuario_id)
         VALUES (:clienteId, :motivo, :referencia, :observacao, :usuarioId)`
      )
      .run(dados)
    return Number(info.changes) > 0
  },

  listarSemContato(): ClienteSemContato[] {
    const rows = getDb()
      .prepare('SELECT id, nome, celular FROM cliente WHERE ativo = 1 AND aceita_contato = 0 ORDER BY nome')
      .all() as unknown as ClienteSemContato[]
    return rows
  },

  /** false se o cliente nao existe. */
  definirAceitaContato(clienteId: number, aceita: boolean): boolean {
    const info = getDb()
      .prepare('UPDATE cliente SET aceita_contato = :aceita WHERE id = :clienteId')
      .run({ aceita: aceita ? 1 : 0, clienteId })
    return Number(info.changes) > 0
  }
}
