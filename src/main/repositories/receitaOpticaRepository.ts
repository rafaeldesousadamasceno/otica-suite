import { getDb } from '@main/db/connection'
import { calcularDp, calcularPerto, type BasePrisma } from '@shared/prescricao'
import { maiusculoOuNulo } from '@shared/texto'
import type { ReceitaOptica } from '@shared/types'
import type { ReceitaOpticaAtualizarInput, ReceitaOpticaInput } from '@shared/ipc'

interface ReceitaRow {
  id: number
  cliente_id: number
  profissional_id: number | null
  profissional_nome: string | null
  data_exame: string
  longe_od_esf: number | null
  longe_od_cil: number | null
  longe_od_eixo: number | null
  longe_od_dnp: number | null
  longe_od_dp: number | null
  longe_oe_esf: number | null
  longe_oe_cil: number | null
  longe_oe_eixo: number | null
  longe_oe_dnp: number | null
  longe_oe_dp: number | null
  perto_od_esf: number | null
  perto_od_cil: number | null
  perto_od_eixo: number | null
  perto_od_dnp: number | null
  perto_od_dp: number | null
  perto_oe_esf: number | null
  perto_oe_cil: number | null
  perto_oe_eixo: number | null
  perto_oe_dnp: number | null
  perto_oe_dp: number | null
  adicao: number | null
  altura: number | null
  tipo_lente: string | null
  tratamentos: string | null
  armacao: string | null
  observacao: string | null
  versao: number
  criado_em: string
  longe_od_alt: number | null
  longe_oe_alt: number | null
  longe_od_prisma: number
  longe_oe_prisma: number
  longe_od_base_prisma: string
  longe_oe_base_prisma: string
  adicao_od: number | null
  adicao_oe: number | null
  indice_refracao: string | null
  armacao_tipo: string | null
  armacao_modelo: string | null
  armacao_marca: string | null
  armacao_cor: string | null
  ponte: number | null
  horizontal: number | null
  vertical: number | null
  diagonal_maior: number | null
  dp_longe: number | null
  dp_perto: number | null
  formato_anterior: number
}

function toDomain(row: ReceitaRow): ReceitaOptica {
  const formatoAnterior = row.formato_anterior === 1
  // Formato atual: o perto nao e gravado, sai de Longe + Adicao. Formato anterior: os valores originais.
  const pertoOd = formatoAnterior
    ? { esf: row.perto_od_esf, cil: row.perto_od_cil, eixo: row.perto_od_eixo }
    : calcularPerto({ esf: row.longe_od_esf, cil: row.longe_od_cil, eixo: row.longe_od_eixo }, row.adicao_od)
  const pertoOe = formatoAnterior
    ? { esf: row.perto_oe_esf, cil: row.perto_oe_cil, eixo: row.perto_oe_eixo }
    : calcularPerto({ esf: row.longe_oe_esf, cil: row.longe_oe_cil, eixo: row.longe_oe_eixo }, row.adicao_oe)

  return {
    id: row.id,
    clienteId: row.cliente_id,
    profissionalId: row.profissional_id,
    profissionalNome: row.profissional_nome,
    dataExame: row.data_exame,
    longeOdEsf: row.longe_od_esf,
    longeOdCil: row.longe_od_cil,
    longeOdEixo: row.longe_od_eixo,
    longeOdDnp: row.longe_od_dnp,
    longeOdDp: row.longe_od_dp,
    longeOeEsf: row.longe_oe_esf,
    longeOeCil: row.longe_oe_cil,
    longeOeEixo: row.longe_oe_eixo,
    longeOeDnp: row.longe_oe_dnp,
    longeOeDp: row.longe_oe_dp,
    pertoOdEsf: pertoOd.esf,
    pertoOdCil: pertoOd.cil,
    pertoOdEixo: pertoOd.eixo,
    pertoOdDnp: row.perto_od_dnp,
    pertoOdDp: row.perto_od_dp,
    pertoOeEsf: pertoOe.esf,
    pertoOeCil: pertoOe.cil,
    pertoOeEixo: pertoOe.eixo,
    pertoOeDnp: row.perto_oe_dnp,
    pertoOeDp: row.perto_oe_dp,
    adicao: row.adicao,
    altura: row.altura,
    tipoLente: row.tipo_lente,
    tratamentos: row.tratamentos,
    armacao: row.armacao,
    observacao: row.observacao,
    versao: row.versao,
    criadoEm: row.criado_em,
    longeOdAlt: row.longe_od_alt,
    longeOeAlt: row.longe_oe_alt,
    longeOdPrisma: row.longe_od_prisma,
    longeOePrisma: row.longe_oe_prisma,
    longeOdBasePrisma: row.longe_od_base_prisma as BasePrisma,
    longeOeBasePrisma: row.longe_oe_base_prisma as BasePrisma,
    adicaoOd: row.adicao_od,
    adicaoOe: row.adicao_oe,
    indiceRefracao: row.indice_refracao,
    armacaoTipo: row.armacao_tipo,
    armacaoModelo: row.armacao_modelo,
    armacaoMarca: row.armacao_marca,
    armacaoCor: row.armacao_cor,
    ponte: row.ponte,
    horizontal: row.horizontal,
    vertical: row.vertical,
    diagonalMaior: row.diagonal_maior,
    dpLonge: row.dp_longe,
    dpPerto: row.dp_perto,
    formatoAnterior
  }
}

/** Valores que `criar` e `atualizar` gravam da mesma forma (o perto NAO entra: e calculado). */
function parametrosComuns(data: ReceitaOpticaInput, profissionalId: number | null): Record<string, string | number | null> {
  return {
    profissionalId,
    dataExame: data.dataExame,
    longeOdEsf: data.longeOdEsf,
    longeOdCil: data.longeOdCil,
    longeOdEixo: data.longeOdEixo,
    longeOdDnp: data.longeOdDnp,
    longeOdAlt: data.longeOdAlt,
    longeOdPrisma: data.longeOdPrisma ?? 0,
    longeOdBasePrisma: data.longeOdBasePrisma,
    adicaoOd: data.adicaoOd ?? 0,
    pertoOdDnp: data.pertoOdDnp,
    longeOeEsf: data.longeOeEsf,
    longeOeCil: data.longeOeCil,
    longeOeEixo: data.longeOeEixo,
    longeOeDnp: data.longeOeDnp,
    longeOeAlt: data.longeOeAlt,
    longeOePrisma: data.longeOePrisma ?? 0,
    longeOeBasePrisma: data.longeOeBasePrisma,
    adicaoOe: data.adicaoOe ?? 0,
    pertoOeDnp: data.pertoOeDnp,
    dpLonge: calcularDp(data.longeOdDnp, data.longeOeDnp),
    dpPerto: calcularDp(data.pertoOdDnp, data.pertoOeDnp),
    tipoLente: data.tipoLente || null,
    indiceRefracao: data.indiceRefracao || null,
    tratamentos: data.tratamentos || null,
    armacaoTipo: data.armacaoTipo || null,
    armacaoModelo: maiusculoOuNulo(data.armacaoModelo),
    armacaoMarca: maiusculoOuNulo(data.armacaoMarca),
    armacaoCor: maiusculoOuNulo(data.armacaoCor),
    ponte: arredondar1(data.ponte),
    horizontal: arredondar1(data.horizontal),
    vertical: arredondar1(data.vertical),
    diagonalMaior: arredondar1(data.diagonalMaior),
    observacao: data.observacao || null
  }
}

/** Medidas em milimetros com uma casa decimal. */
function arredondar1(v: number | null): number | null {
  return v === null ? null : Math.round(v * 10) / 10
}

const SELECT = `SELECT r.*, p.nome AS profissional_nome
                FROM receita_optica r
                LEFT JOIN profissional p ON p.id = r.profissional_id`

export interface VinculoPrescricao {
  tipo: 'OS' | 'Venda'
  numero: string
  situacao: string
}

export const receitaOpticaRepository = {
  /** Prescricao excluida (exclusao logica) conta como inexistente. */
  buscarPorId(id: number): ReceitaOptica | null {
    const row = getDb().prepare(`${SELECT} WHERE r.id = :id AND r.excluido_em IS NULL`).get({ id }) as unknown as ReceitaRow | undefined
    return row ? toDomain(row) : null
  },

  listarPorCliente(clienteId: number): ReceitaOptica[] {
    const rows = getDb()
      .prepare(`${SELECT} WHERE r.cliente_id = :clienteId AND r.excluido_em IS NULL ORDER BY r.data_exame DESC, r.id DESC`)
      .all({ clienteId }) as unknown as ReceitaRow[]
    return rows.map(toDomain)
  },

  /** A versao numera tambem as excluidas, para um numero nunca se repetir na ficha do cliente. */
  proximaVersao(clienteId: number): number {
    const row = getDb()
      .prepare('SELECT COALESCE(MAX(versao), 0) AS maxVersao FROM receita_optica WHERE cliente_id = :clienteId')
      .get({ clienteId }) as { maxVersao: number }
    return row.maxVersao + 1
  },

  /**
   * Corrige uma prescricao ja salva, no mesmo registro: a versao, o cliente e quem
   * criou continuam. Salvar passa a prescricao para o formato atual; os valores
   * antigos de perto, a adicao unica e a armacao em texto continuam gravados
   * (nao sao tocados) e o valor de antes fica na auditoria (ver o service).
   * Devolve false se o id nao existe (ou foi excluida).
   */
  atualizar(data: ReceitaOpticaAtualizarInput, profissionalId: number | null): boolean {
    const info = getDb()
      .prepare(
        `UPDATE receita_optica SET
           profissional_id = :profissionalId, data_exame = :dataExame,
           longe_od_esf = :longeOdEsf, longe_od_cil = :longeOdCil, longe_od_eixo = :longeOdEixo, longe_od_dnp = :longeOdDnp,
           longe_od_alt = :longeOdAlt, longe_od_prisma = :longeOdPrisma, longe_od_base_prisma = :longeOdBasePrisma,
           adicao_od = :adicaoOd, perto_od_dnp = :pertoOdDnp,
           longe_oe_esf = :longeOeEsf, longe_oe_cil = :longeOeCil, longe_oe_eixo = :longeOeEixo, longe_oe_dnp = :longeOeDnp,
           longe_oe_alt = :longeOeAlt, longe_oe_prisma = :longeOePrisma, longe_oe_base_prisma = :longeOeBasePrisma,
           adicao_oe = :adicaoOe, perto_oe_dnp = :pertoOeDnp,
           dp_longe = :dpLonge, dp_perto = :dpPerto,
           tipo_lente = :tipoLente, indice_refracao = :indiceRefracao, tratamentos = :tratamentos,
           armacao_tipo = :armacaoTipo, armacao_modelo = :armacaoModelo, armacao_marca = :armacaoMarca, armacao_cor = :armacaoCor,
           ponte = :ponte, horizontal = :horizontal, vertical = :vertical, diagonal_maior = :diagonalMaior,
           observacao = :observacao, formato_anterior = 0
         WHERE id = :id AND excluido_em IS NULL`
      )
      .run({ id: data.id, ...parametrosComuns(data, profissionalId) })
    return Number(info.changes) > 0
  },

  criar(data: ReceitaOpticaInput, profissionalId: number | null, versao: number, criadoPor: number): number {
    const info = getDb()
      .prepare(
        `INSERT INTO receita_optica (
           cliente_id, profissional_id, data_exame,
           longe_od_esf, longe_od_cil, longe_od_eixo, longe_od_dnp, longe_od_alt, longe_od_prisma, longe_od_base_prisma, adicao_od, perto_od_dnp,
           longe_oe_esf, longe_oe_cil, longe_oe_eixo, longe_oe_dnp, longe_oe_alt, longe_oe_prisma, longe_oe_base_prisma, adicao_oe, perto_oe_dnp,
           dp_longe, dp_perto,
           tipo_lente, indice_refracao, tratamentos,
           armacao_tipo, armacao_modelo, armacao_marca, armacao_cor,
           ponte, horizontal, vertical, diagonal_maior,
           observacao, versao, criado_por
         ) VALUES (
           :clienteId, :profissionalId, :dataExame,
           :longeOdEsf, :longeOdCil, :longeOdEixo, :longeOdDnp, :longeOdAlt, :longeOdPrisma, :longeOdBasePrisma, :adicaoOd, :pertoOdDnp,
           :longeOeEsf, :longeOeCil, :longeOeEixo, :longeOeDnp, :longeOeAlt, :longeOePrisma, :longeOeBasePrisma, :adicaoOe, :pertoOeDnp,
           :dpLonge, :dpPerto,
           :tipoLente, :indiceRefracao, :tratamentos,
           :armacaoTipo, :armacaoModelo, :armacaoMarca, :armacaoCor,
           :ponte, :horizontal, :vertical, :diagonalMaior,
           :observacao, :versao, :criadoPor
         )`
      )
      .run({ clienteId: data.clienteId, ...parametrosComuns(data, profissionalId), versao, criadoPor })
    return Number(info.lastInsertRowid)
  },

  /**
   * Ordens de servico e vendas AINDA VALIDAS que usam a prescricao. As canceladas
   * nao contam: o vinculo delas nao depende mais da prescricao estar visivel.
   */
  vinculosAtivos(id: number): VinculoPrescricao[] {
    const db = getDb()
    const os = db
      .prepare("SELECT numero, situacao FROM ordem_servico WHERE receita_optica_id = :id AND situacao != 'CANCELADA' ORDER BY id")
      .all({ id }) as { numero: string; situacao: string }[]
    const vendas = db
      .prepare("SELECT numero, situacao FROM venda WHERE receita_optica_id = :id AND situacao != 'CANCELADA' ORDER BY id")
      .all({ id }) as { numero: string; situacao: string }[]
    return [
      ...os.map((o) => ({ tipo: 'OS' as const, ...o })),
      ...vendas.map((v) => ({ tipo: 'Venda' as const, ...v }))
    ]
  },

  /** Exclusao logica: o registro fica guardado (e na sincronizacao), so some das telas. */
  excluir(id: number, motivo: string | null): boolean {
    const info = getDb()
      .prepare("UPDATE receita_optica SET excluido_em = datetime('now'), excluido_motivo = :motivo WHERE id = :id AND excluido_em IS NULL")
      .run({ id, motivo })
    return Number(info.changes) > 0
  }
}
