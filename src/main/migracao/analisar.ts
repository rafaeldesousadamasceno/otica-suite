import { cpfValido, formatarCpf, limparCpf } from '@shared/cpf'
import { semAcento } from '@shared/texto'
import { celularOuNull, cpfOuNull, dataOuNull, mapearSituacaoOS, paraCentavos, paraNumero } from './transformar'
import type { ClienteOrigemRow, ExameOrigemRow } from './mysqlSource'
import {
  ROTULO_CAMPO_DATA,
  type CampoDataExame,
  type PendenciaPrevista,
  type MigracaoAprovacoes
} from '@shared/importacao'

/**
 * Regras da importacao do MD Oculos que NAO tocam no banco: so olham os dados
 * lidos da origem e dizem o que fazer (e o que avisar). Servem tanto a
 * analise (simulacao) quanto a importacao de verdade, para as duas nunca
 * discordarem.
 */

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function rotuloPessoa(nome: string | null, id: number, sistema: 'antigo' | 'novo'): string {
  const n = nome?.trim() || '(sem nome)'
  return sistema === 'antigo' ? `${n} (código ${id} no sistema antigo)` : `${n} (cliente nº ${id} deste sistema)`
}

function normalizarNome(nome: string | null): string {
  return semAcento(nome ?? '').replace(/\s+/g, ' ').trim()
}

function soData(valor: string | null): string | null {
  return valor ? valor.slice(0, 10) : null
}

/** Mesmo nome (sem acento/maiuscula) e mesmo nascimento (ou um deles nao informado). */
export function mesmaPessoa(
  a: { nome: string | null; dataNasc: string | null },
  b: { nome: string | null; dataNasc: string | null }
): boolean {
  const na = normalizarNome(a.nome)
  const nb = normalizarNome(b.nome)
  if (!na || na !== nb) return false
  const da = soData(a.dataNasc)
  const db = soData(b.dataNasc)
  return !da || !db || da === db
}

// ---------------------------------------------------------------------
// CPF
// ---------------------------------------------------------------------

export interface ClienteParaPlano {
  idOrigem: number
  nome: string | null
  dataNasc: string | null
  /** CPF como veio, ja sem a sentinela "sem CPF" (pode ter mascara ou ser invalido). */
  cpfBruto: string | null
}

/** Cliente que ja esta neste sistema (qualquer origem), para comparar CPF por digitos. */
export interface ClienteExistente {
  clienteId: number
  nome: string | null
  dataNasc: string | null
  cpf: string | null
}

export type PlanoCliente =
  | { acao: 'IMPORTAR'; cpf: string | null; observacao: string | null; pendencias: PendenciaPrevista[] }
  | { acao: 'MESCLAR'; comOrigemId: number | null; comClienteId: number | null; pendencias: PendenciaPrevista[] }
  | { acao: 'PULAR'; pendencias: PendenciaPrevista[] }

interface EntradaPlano {
  /** Somente os clientes que serao importados nesta rodada. */
  clientes: ClienteParaPlano[]
  /** Quantidade de exames de cada cliente (id de origem): quem tem mais e o cadastro principal. */
  examesPorCliente: Map<number, number>
  existentes: ClienteExistente[]
  aprovacoes: MigracaoAprovacoes
}

/**
 * Decide, cliente a cliente, o que fazer com o CPF:
 * - invalido -> importa sem CPF (original na observacao);
 * - repetido da mesma pessoa -> mescla (com aprovacao);
 * - repetido de outra pessoa -> importa sem CPF (com aprovacao) ou nao importa.
 * Nunca inventa um CPF.
 */
export function planejarClientes(entrada: EntradaPlano): Map<number, PlanoCliente> {
  const { clientes, examesPorCliente, existentes, aprovacoes } = entrada
  const plano = new Map<number, PlanoCliente>()

  const existentesPorCpf = new Map<string, ClienteExistente[]>()
  for (const e of existentes) {
    const d = e.cpf ? limparCpf(e.cpf) : ''
    if (!d) continue
    existentesPorCpf.set(d, [...(existentesPorCpf.get(d) ?? []), e])
  }

  const grupos = new Map<string, ClienteParaPlano[]>()
  for (const c of clientes) {
    if (!c.cpfBruto) {
      plano.set(c.idOrigem, { acao: 'IMPORTAR', cpf: null, observacao: null, pendencias: [] })
      continue
    }
    const digitos = limparCpf(c.cpfBruto)
    if (!cpfValido(digitos)) {
      plano.set(c.idOrigem, {
        acao: 'IMPORTAR',
        cpf: null,
        observacao: `CPF no sistema antigo: ${c.cpfBruto} (inválido, por isso não foi importado).`,
        pendencias: [
          {
            tipo: 'CPF_INVALIDO',
            gravidade: 'atencao',
            origemTabela: 'clientes',
            origemId: c.idOrigem,
            motivo: `O CPF ${c.cpfBruto} de ${rotuloPessoa(c.nome, c.idOrigem, 'antigo')} não é um CPF válido (o dígito verificador não confere). O cliente foi importado sem CPF; o número original ficou na observação do cadastro.`,
            sugestao: 'Pergunte o CPF correto ao cliente e informe no cadastro dele.',
            dados: { cpf: c.cpfBruto }
          }
        ]
      })
      continue
    }
    grupos.set(digitos, [...(grupos.get(digitos) ?? []), c])
  }

  for (const [digitos, grupo] of grupos) {
    const ordenado = [...grupo].sort(
      (a, b) => (examesPorCliente.get(b.idOrigem) ?? 0) - (examesPorCliente.get(a.idOrigem) ?? 0) || a.idOrigem - b.idOrigem
    )
    const jaNoSistema = existentesPorCpf.get(digitos) ?? []
    const mantidos: ClienteParaPlano[] = []

    for (const c of ordenado) {
      const cpfFmt = formatarCpf(digitos)
      const mesmoNoSistema = jaNoSistema.find((e) => mesmaPessoa(c, e))
      const mesmoNoLote = mantidos.find((m) => mesmaPessoa(c, m))
      const outro =
        jaNoSistema[0] !== undefined
          ? { rotulo: rotuloPessoa(jaNoSistema[0].nome, jaNoSistema[0].clienteId, 'novo'), igual: mesmoNoSistema !== undefined }
          : mantidos[0] !== undefined
            ? { rotulo: rotuloPessoa(mantidos[0].nome, mantidos[0].idOrigem, 'antigo'), igual: mesmoNoLote !== undefined }
            : null

      if (!outro) {
        // Primeiro dono do CPF neste lote: fica com ele.
        mantidos.push(c)
        plano.set(c.idOrigem, { acao: 'IMPORTAR', cpf: digitos, observacao: null, pendencias: [] })
        continue
      }

      const quem = rotuloPessoa(c.nome, c.idOrigem, 'antigo')

      if (outro.igual && aprovacoes.mesclarDuplicados) {
        const comClienteId = mesmoNoSistema?.clienteId ?? null
        const comOrigemId = comClienteId === null ? (mesmoNoLote?.idOrigem ?? null) : null
        plano.set(c.idOrigem, {
          acao: 'MESCLAR',
          comOrigemId,
          comClienteId,
          pendencias: [
            {
              tipo: 'CPF_MESCLADO',
              gravidade: 'info',
              origemTabela: 'clientes',
              origemId: c.idOrigem,
              motivo: `${quem} tinha o mesmo CPF (${cpfFmt}), o mesmo nome e a mesma data de nascimento de ${outro.rotulo}. Os dois foram unidos num só cadastro e os exames de ambos ficaram nele.`,
              sugestao: 'Confira se é mesmo a mesma pessoa. Se não for, cadastre o cliente de novo e ajuste os exames dele.',
              dados: { cpf: cpfFmt }
            }
          ]
        })
        continue
      }

      if (aprovacoes.removerCpfConflitante) {
        plano.set(c.idOrigem, {
          acao: 'IMPORTAR',
          cpf: null,
          observacao: `CPF no sistema antigo: ${cpfFmt} (repetido no cadastro de ${outro.rotulo}; foi retirado deste).`,
          pendencias: [
            {
              tipo: 'CPF_REMOVIDO',
              gravidade: 'atencao',
              origemTabela: 'clientes',
              origemId: c.idOrigem,
              motivo: outro.igual
                ? `${quem} tem o mesmo CPF (${cpfFmt}), nome e nascimento de ${outro.rotulo}, mas a mesclagem não foi aprovada. Foi importado sem CPF; o original ficou na observação.`
                : `${quem} tem o mesmo CPF (${cpfFmt}) de ${outro.rotulo}, que parece ser outra pessoa. Foi importado sem CPF; o original ficou na observação do cadastro.`,
              sugestao: outro.igual
                ? 'Parecem a mesma pessoa: considere unir os dois cadastros.'
                : 'Descubra quem é o dono do CPF. Se for este cliente, tire o CPF do outro cadastro e informe neste.',
              dados: { cpf: cpfFmt }
            }
          ]
        })
        continue
      }

      plano.set(c.idOrigem, {
        acao: 'PULAR',
        pendencias: [
          {
            tipo: 'CPF_DUPLICADO',
            gravidade: 'erro',
            origemTabela: 'clientes',
            origemId: c.idOrigem,
            motivo: `${quem} não foi importado: o CPF ${cpfFmt} já pertence a ${outro.rotulo}.`,
            sugestao:
              'Aprove “tirar o CPF de quem repete” ou “unir cadastros da mesma pessoa” na análise e importe de novo; ou corrija o CPF no sistema antigo.',
            dados: { cpf: cpfFmt }
          }
        ]
      })
    }
  }

  return plano
}

/**
 * CPF de um cliente que JA tinha sido importado (antes desta regra existir):
 * o sistema novo guarda so digitos. Devolve o que fazer com o gravado.
 */
export function avaliarCpfJaImportado(
  cliente: { clienteId: number; nome: string | null; cpf: string | null },
  origemId: number,
  outrosComMesmoCpf: ClienteExistente[]
): { novoCpf: string | null; pendencia: PendenciaPrevista | null } {
  if (!cliente.cpf) return { novoCpf: null, pendencia: null }
  const digitos = limparCpf(cliente.cpf)

  if (!cpfValido(digitos)) {
    return {
      novoCpf: null,
      pendencia: {
        tipo: 'CPF_INVALIDO',
        gravidade: 'atencao',
        origemTabela: 'clientes',
        origemId,
        motivo: `O CPF ${cliente.cpf} de ${rotuloPessoa(cliente.nome, cliente.clienteId, 'novo')} não é um CPF válido.`,
        sugestao: 'Pergunte o CPF correto ao cliente e informe no cadastro (o sistema só aceita CPF válido).',
        dados: { cpf: cliente.cpf }
      }
    }
  }

  if (outrosComMesmoCpf.length > 0) {
    const outro = outrosComMesmoCpf[0]
    return {
      novoCpf: null,
      pendencia: {
        tipo: 'CPF_DUPLICADO',
        gravidade: 'atencao',
        origemTabela: 'clientes',
        origemId,
        motivo: `${rotuloPessoa(cliente.nome, cliente.clienteId, 'novo')} tem o mesmo CPF (${formatarCpf(digitos)}) de ${rotuloPessoa(outro.nome, outro.clienteId, 'novo')}. Os dois já estavam importados, com o CPF escrito de formas diferentes.`,
        sugestao: 'Veja se é a mesma pessoa (une os cadastros à mão) ou de quem é o CPF, e corrija em um dos cadastros.',
        dados: { cpf: formatarCpf(digitos) }
      }
    }
  }

  return { novoCpf: digitos === cliente.cpf ? null : digitos, pendencia: null }
}

// ---------------------------------------------------------------------
// Exame sem cliente (orfaos)
// ---------------------------------------------------------------------

export function classificarExameSemCliente(
  exame: { id_exame: number; id_cliente: number | null },
  idsClientesOrigem: Set<number>,
  motivosDeFalhaDoCliente: Map<number, string>
): PendenciaPrevista {
  const base = { gravidade: 'erro' as const, origemTabela: 'exames', origemId: exame.id_exame, dados: null }

  if (!exame.id_cliente) {
    return {
      ...base,
      tipo: 'EXAME_SEM_CLIENTE',
      motivo: `O exame ${exame.id_exame} não tem cliente associado no sistema antigo (registro órfão), então não há a quem vincular a receita, a venda e a OS.`,
      sugestao: 'Abra o exame no MD Óculos e veja de quem é. Depois de ajustar lá, importe de novo; se não for relevante, marque como ignorada.'
    }
  }
  if (!idsClientesOrigem.has(exame.id_cliente)) {
    return {
      ...base,
      tipo: 'CLIENTE_INEXISTENTE_NA_ORIGEM',
      motivo: `O exame ${exame.id_exame} aponta para o cliente de código ${exame.id_cliente}, que não existe no sistema antigo (provavelmente foi apagado).`,
      sugestao: 'Se souber de quem é o exame, recadastre o cliente no MD Óculos e importe de novo; senão, marque como ignorada.'
    }
  }
  const motivoCliente = motivosDeFalhaDoCliente.get(exame.id_cliente)
  return {
    ...base,
    tipo: 'CLIENTE_FALHOU',
    motivo: `O exame ${exame.id_exame} não foi importado porque o cliente de código ${exame.id_cliente} não entrou${motivoCliente ? `: ${motivoCliente}` : '.'}`,
    sugestao: 'Resolva a pendência do cliente (veja o CPF) e importe de novo: este exame entra sozinho em seguida.'
  }
}

// ---------------------------------------------------------------------
// Datas do exame
// ---------------------------------------------------------------------

export interface DatasExameOrigem {
  data_exame: string | null
  data_venda: string | null
  data_saida: string | null
  data_chegada: string | null
}

const CAMPOS: CampoDataExame[] = ['data_exame', 'data_venda', 'data_saida', 'data_chegada']

/** Pares (anterior, posterior) que precisam estar em ordem. */
const ORDEM: [CampoDataExame, CampoDataExame][] = [
  ['data_exame', 'data_venda'],
  ['data_exame', 'data_saida'],
  ['data_exame', 'data_chegada'],
  ['data_saida', 'data_chegada'],
  ['data_venda', 'data_chegada']
]

/** Do exame ate a venda/chegada, mais que isso indica data digitada errada. */
export const LIMITE_DIAS_EXAME_ATE_ENTREGA = 548
const ANO_MINIMO = 1990

function ehDataReal(iso: string): boolean {
  const [a, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(a, m - 1, d))
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/**
 * Data da origem pronta para gravar: so o dia (AAAA-MM-DD), e so se for uma
 * data real e plausivel. `0000-00-00`, formato estranho e ano absurdo viram null.
 */
export function dataValidaOuNull(valor: string | null | undefined): string | null {
  const v = valor?.trim()
  if (!v || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null
  const iso = v.slice(0, 10)
  if (!ehDataReal(iso) || Number(iso.slice(0, 4)) < ANO_MINIMO) return null
  return iso
}

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000)
}

function trocarAno(iso: string, delta: number): string {
  const ano = Number(iso.slice(0, 4)) + delta
  const mmdd = iso.slice(5)
  const candidato = `${String(ano).padStart(4, '0')}-${mmdd}`
  return ehDataReal(candidato) ? candidato : `${String(ano).padStart(4, '0')}-02-28` // 29/02 em ano nao bissexto
}

function dataBr(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

/** Lista o que esta fora de ordem, no futuro ou com intervalo longo demais. Por campo, quantas vezes ele aparece. */
function violacoes(datas: Partial<Record<CampoDataExame, string>>, hoje: string): { motivos: string[]; porCampo: Map<CampoDataExame, number> } {
  const motivos: string[] = []
  const porCampo = new Map<CampoDataExame, number>()
  const marcar = (...campos: CampoDataExame[]): void => {
    for (const c of campos) porCampo.set(c, (porCampo.get(c) ?? 0) + 1)
  }

  for (const campo of CAMPOS) {
    const d = datas[campo]
    if (d && d > hoje) {
      motivos.push(`a ${ROTULO_CAMPO_DATA[campo]} (${dataBr(d)}) está no futuro`)
      marcar(campo)
    }
  }
  for (const [antes, depois] of ORDEM) {
    const a = datas[antes]
    const b = datas[depois]
    if (a && b && a > b) {
      motivos.push(`a ${ROTULO_CAMPO_DATA[antes]} (${dataBr(a)}) é posterior à ${ROTULO_CAMPO_DATA[depois]} (${dataBr(b)})`)
      marcar(antes, depois)
    }
  }
  for (const depois of ['data_venda', 'data_chegada'] as const) {
    const a = datas.data_exame
    const b = datas[depois]
    if (a && b && a <= b && diasEntre(a, b) > LIMITE_DIAS_EXAME_ATE_ENTREGA) {
      motivos.push(
        `há ${diasEntre(a, b)} dias entre a data do exame (${dataBr(a)}) e a ${ROTULO_CAMPO_DATA[depois]} (${dataBr(b)})`
      )
      marcar('data_exame', depois)
    }
  }
  return { motivos, porCampo }
}

/**
 * O que se sabe de OUTROS exames, para decidir o ano quando as outras datas do
 * proprio exame nao bastam.
 */
export interface ContextoDatas {
  /** Ano (da data do exame ou, na falta, da venda) dos exames de codigo mais proximo. */
  anosVizinhos: number[]
}

/**
 * No sistema antigo o codigo do exame cresce com o tempo: exames de codigo
 * proximo foram feitos em datas proximas. Devolve, para cada exame, os anos dos
 * ate `janela` exames antes e `janela` depois dele.
 */
export function calcularAnosVizinhos(
  exames: { id_exame: number; data_exame: string | null; data_venda: string | null }[],
  janela = 5
): Map<number, number[]> {
  const ordenados = [...exames].sort((a, b) => a.id_exame - b.id_exame)
  const anos = ordenados.map((e) => {
    const d = dataValidaOuNull(e.data_exame) ?? dataValidaOuNull(e.data_venda)
    return d ? Number(d.slice(0, 4)) : null
  })
  const mapa = new Map<number, number[]>()
  ordenados.forEach((e, i) => {
    const vizinhos: number[] = []
    for (let j = Math.max(0, i - janela); j <= Math.min(ordenados.length - 1, i + janela); j++) {
      const ano = anos[j]
      if (j !== i && ano !== null) vizinhos.push(ano)
    }
    mapa.set(e.id_exame, vizinhos)
  })
  return mapa
}

/** O ano que mais se repete, se houver um vencedor claro (empate nao vale; `maioria` exige mais da metade). */
function anoMaisFrequente(anos: number[], maioria = false): { ano: number; votos: number } | null {
  const contagem = new Map<number, number>()
  for (const a of anos) contagem.set(a, (contagem.get(a) ?? 0) + 1)
  const ordenado = [...contagem.entries()].sort((x, y) => y[1] - x[1])
  if (ordenado.length === 0) return null
  if (ordenado.length > 1 && ordenado[0][1] === ordenado[1][1]) return null
  if (maioria && ordenado[0][1] * 2 <= anos.length) return null
  return { ano: ordenado[0][0], votos: ordenado[0][1] }
}

interface Sugestao {
  campo: CampoDataExame
  /** Data hoje gravada no campo (vazio quando nao havia uma data utilizavel). */
  atual: string
  sugerido: string
  /** Em que a sugestao se apoia, em portugues, para o administrador julgar. */
  base: string
  /** true quando e um palpite (nao ha ano para votar): o administrador deve conferir. */
  estimativa?: boolean
}

/**
 * Sugere o ano de uma data suspeita votando entre as evidencias:
 * 1. as OUTRAS datas do proprio exame (venda, envio, chegada); se concordam num ano, vale esse;
 * 2. se nao ha ou nao concordam, o ano que a maioria dos exames de codigo proximo tem.
 * Mantem dia e mes. So sugere se a data nova deixa o exame inteiro em ordem.
 */
function sugerirPorAno(
  datas: Partial<Record<CampoDataExame, string>>,
  campo: CampoDataExame,
  hoje: string,
  contexto: ContextoDatas
): Sugestao | null {
  const atual = datas[campo]
  if (!atual) return null

  const anoHoje = Number(hoje.slice(0, 4))
  const outras = CAMPOS.filter((c) => c !== campo && datas[c] && Number((datas[c] as string).slice(0, 4)) <= anoHoje)
  const proprio = anoMaisFrequente(outras.map((c) => Number((datas[c] as string).slice(0, 4))))

  let ano: number
  let base: string
  if (proprio) {
    ano = proprio.ano
    const quais = outras.filter((c) => Number((datas[c] as string).slice(0, 4)) === ano).map((c) => ROTULO_CAMPO_DATA[c])
    base = `as outras datas deste exame (${quais.join(', ')}) estão em ${ano}`
  } else {
    const vizinho = anoMaisFrequente(contexto.anosVizinhos, true)
    if (!vizinho) return null
    ano = vizinho.ano
    base = `${vizinho.votos} dos ${contexto.anosVizinhos.length} exames de código próximo estão em ${ano}`
  }

  const anoAtual = Number(atual.slice(0, 4))
  if (ano === anoAtual) return null
  const sugerido = trocarAno(atual, ano - anoAtual)
  if (violacoes({ ...datas, [campo]: sugerido }, hoje).motivos.length > 0) return null
  return { campo, atual, sugerido, base }
}

/** Exame sem data utilizavel: o exame costuma ser no dia da compra ou pouco antes, entao a data da venda e um bom ponto de partida. */
function estimarDataDoExame(datas: Partial<Record<CampoDataExame, string>>, hoje: string): Sugestao | null {
  const venda = datas.data_venda
  if (!venda) return null
  if (violacoes({ ...datas, data_exame: venda }, hoje).motivos.length > 0) return null
  return {
    campo: 'data_exame',
    atual: '',
    sugerido: venda,
    base: 'a data da venda (o exame costuma ser no mesmo dia ou pouco antes da compra)',
    estimativa: true
  }
}

export interface AnaliseDatasExame {
  /** Datas ja saneadas, prontas para a importacao usar. */
  datas: Record<CampoDataExame, string | null>
  pendencias: PendenciaPrevista[]
}

export function analisarDatasExame(
  exameId: number,
  origem: DatasExameOrigem,
  hoje: string,
  contexto: ContextoDatas = { anosVizinhos: [] }
): AnaliseDatasExame {
  const pendencias: PendenciaPrevista[] = []
  const datas = {} as Record<CampoDataExame, string | null>
  const invalidas: CampoDataExame[] = []
  const brutos = {} as Record<CampoDataExame, string | null>

  for (const campo of CAMPOS) {
    const bruto = origem[campo]?.trim() || null
    const semSentinela = bruto && bruto !== '1111-11-11' ? bruto : null
    brutos[campo] = semSentinela
    const valida = dataValidaOuNull(semSentinela)
    datas[campo] = valida
    if (semSentinela && !valida) invalidas.push(campo)
  }

  const base = { origemTabela: 'exames', origemId: exameId }
  /** O que veio do sistema antigo, tal e qual: ajuda a decidir a data certa. */
  const origemBruta = {
    origemExame: brutos.data_exame,
    origemVenda: brutos.data_venda,
    origemSaida: brutos.data_saida,
    origemChegada: brutos.data_chegada
  }

  const presentes: Partial<Record<CampoDataExame, string>> = {}
  for (const c of CAMPOS) if (datas[c]) presentes[c] = datas[c] as string

  const exameInvalido = invalidas.includes('data_exame')
  const exameVazio = !datas.data_exame && !exameInvalido

  if (invalidas.length > 0) {
    const lista = invalidas.map((c) => `${ROTULO_CAMPO_DATA[c]} (“${brutos[c]}”)`).join('; ')
    const sugestao = exameInvalido ? estimarDataDoExame(presentes, hoje) : null
    pendencias.push({
      ...base,
      tipo: 'DATA_INVALIDA',
      gravidade: 'atencao',
      motivo: `O exame ${exameId} tem data que não existe no calendário: ${lista}.`,
      sugestao: sugestao
        ? `Informe a data certa. Como ponto de partida, ${sugestao.base}: ${dataBr(sugestao.sugerido)}. É um palpite, confira antes de aplicar.`
        : 'Descubra a data certa no sistema antigo (ou na ficha do cliente) e informe aqui.',
      dados: {
        ...origemBruta,
        ...(sugestao ? { campo: sugestao.campo, sugerido: sugestao.sugerido, estimativa: 'sim', base: sugestao.base } : {})
      }
    })
  }

  if (exameVazio) {
    const sugestao = estimarDataDoExame(presentes, hoje)
    pendencias.push({
      ...base,
      tipo: 'DATA_AUSENTE',
      gravidade: 'atencao',
      motivo: `O exame ${exameId} não tem data de exame no sistema antigo. Foi usada ${datas.data_venda ? 'a data da venda' : 'a data de hoje'} no lugar.`,
      sugestao: sugestao
        ? `Informe a data real do exame. Como ponto de partida, ${sugestao.base}: ${dataBr(sugestao.sugerido)}. É um palpite, confira antes de aplicar.`
        : 'Informe a data real do exame (veja a ficha do cliente).',
      dados: {
        ...origemBruta,
        ...(sugestao ? { campo: sugestao.campo, sugerido: sugestao.sugerido, estimativa: 'sim', base: sugestao.base } : {})
      }
    })
  }

  const { motivos, porCampo } = violacoes(presentes, hoje)
  if (motivos.length > 0) {
    const maximo = Math.max(...porCampo.values())
    const suspeitos = [...porCampo.entries()].filter(([, n]) => n === maximo).map(([c]) => c)
    const candidatos = suspeitos.length === 1 ? suspeitos : [...porCampo.keys()]
    // Se mais de um campo poderia ser o errado e cada um daria uma sugestao, nao ha como saber qual: nao chuta.
    const achadas = candidatos.map((c) => sugerirPorAno(presentes, c, hoje, contexto)).filter((x): x is Sugestao => x !== null)
    const sugestao = achadas.length === 1 ? achadas[0] : null

    pendencias.push({
      ...base,
      tipo: 'DATA_INCOERENTE',
      gravidade: 'atencao',
      motivo: `No exame ${exameId}: ${motivos.join('; ')}.`,
      sugestao: sugestao
        ? `Provavelmente o ano da ${ROTULO_CAMPO_DATA[sugestao.campo]} foi digitado errado: ${sugestao.base}. Trocar ${dataBr(sugestao.atual)} por ${dataBr(sugestao.sugerido)} deixa as datas em ordem.`
        : 'Confira as datas na ficha do cliente. Não foi possível identificar sozinho qual delas está errada.',
      dados: {
        ...origemBruta,
        ...(sugestao ? { campo: sugestao.campo, atual: sugestao.atual, sugerido: sugestao.sugerido, base: sugestao.base } : {})
      }
    })
  }

  return { datas, pendencias }
}

// ---------------------------------------------------------------------
// Registros em branco do sistema antigo
// ---------------------------------------------------------------------

const textoVazio = (v: string | null | undefined): boolean => !v || !v.trim()
const numeroVazio = (v: string | number | null | undefined): boolean => {
  const n = paraNumero(v)
  return n === null || n === 0
}

/**
 * Exame sem nenhum conteudo: graus todos zerados ou vazios, sem armacao, lentes,
 * tratamentos, observacao, laboratorio nem optometrista, valor zero, sem envio nem
 * chegada, e ainda "em aberto". E o que sobra de um cadastro iniciado e nunca preenchido.
 */
export function exameSemConteudo(e: ExameOrigemRow): boolean {
  const graus = [
    e.plonge_od_esf, e.plonge_oe_esf, e.plonge_od_cil, e.plonge_oe_cil, e.plonge_od_eixo, e.plonge_oe_eixo,
    e.plonge_od_dnp, e.plonge_oe_dnp, e.pperto_od_esf, e.pperto_oe_esf, e.pperto_od_cil, e.pperto_oe_cil,
    e.pperto_od_eixo, e.pperto_oe_eixo, e.pperto_od_dnp, e.pperto_oe_dnp, e.adicao
  ]
  return (
    graus.every(numeroVazio) &&
    [e.lentes, e.tratamentos, e.armacao, e.observacao, e.laboratorio, e.med_opto].every(textoVazio) &&
    paraCentavos(e.valor_exame) + paraCentavos(e.valor_oculos) === 0 &&
    !dataOuNull(e.data_saida) &&
    !dataOuNull(e.data_chegada) &&
    mapearSituacaoOS(e.situacao) === 'EM ABERTO'
  )
}

/** Cliente so com o nome: sem CPF, telefone, nascimento nem endereco. Nao ha como contata-lo. */
export function clienteSemDadosDeContato(c: ClienteOrigemRow): boolean {
  return (
    !cpfOuNull(c.cpf) &&
    !celularOuNull(c.celular) &&
    !dataOuNull(c.data_nasc) &&
    [c.logradouro, c.numero, c.complemento, c.bairro, c.cidade].every(textoVazio)
  )
}

/**
 * Clientes que sao so um registro em branco: sem dados de contato E com exames
 * (pelo menos um) que estao todos sem conteudo. Devolve, por codigo de cliente, os
 * codigos dos exames dele. Quem tem qualquer dado de contato, ou um exame com
 * conteudo, nunca entra aqui.
 */
export function identificarRegistrosVazios(clientes: ClienteOrigemRow[], exames: ExameOrigemRow[]): Map<number, number[]> {
  const porCliente = new Map<number, ExameOrigemRow[]>()
  for (const e of exames) {
    if (e.id_cliente) porCliente.set(e.id_cliente, [...(porCliente.get(e.id_cliente) ?? []), e])
  }
  const vazios = new Map<number, number[]>()
  for (const c of clientes) {
    const seus = porCliente.get(c.id_cliente) ?? []
    if (seus.length > 0 && seus.every(exameSemConteudo) && clienteSemDadosDeContato(c)) {
      vazios.set(c.id_cliente, seus.map((e) => e.id_exame))
    }
  }
  return vazios
}

export function pendenciaRegistroVazio(c: ClienteOrigemRow, examesIds: number[], jaNoSistema: boolean): PendenciaPrevista {
  const quem = `${c.nome?.trim() || '(sem nome)'} (código ${c.id_cliente} no sistema antigo)`
  return {
    tipo: 'REGISTRO_VAZIO',
    gravidade: 'info',
    origemTabela: 'clientes',
    origemId: c.id_cliente,
    motivo: `${quem} não tem CPF, telefone, endereço nem nascimento, e ${examesIds.length === 1 ? 'o exame' : 'os exames'} ${examesIds.join(', ')} não ${examesIds.length === 1 ? 'tem' : 'têm'} nenhum dado (graus, item, valor, laboratório): é um registro em branco. ${jaNoSistema ? 'Já estava importado e será removido do sistema.' : 'Não será importado.'}`,
    sugestao: 'Nada a fazer. Se for um cadastro de verdade, preencha os dados no sistema antigo e importe de novo.',
    dados: { exames: examesIds.join(',') }
  }
}
