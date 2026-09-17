import { getDb } from '@main/db/connection'
import type { ReceitaOptica } from '@shared/types'
import type { ReceitaOpticaInput } from '@shared/ipc'

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
  longe_oe_esf: number | null
  longe_oe_cil: number | null
  longe_oe_eixo: number | null
  longe_oe_dnp: number | null
  perto_od_esf: number | null
  perto_od_cil: number | null
  perto_od_eixo: number | null
  perto_od_dnp: number | null
  perto_oe_esf: number | null
  perto_oe_cil: number | null
  perto_oe_eixo: number | null
  perto_oe_dnp: number | null
  adicao: number | null
  altura: number | null
  tipo_lente: string | null
  tratamentos: string | null
  armacao: string | null
  observacao: string | null
  versao: number
  criado_em: string
}

function toDomain(row: ReceitaRow): ReceitaOptica {
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
    longeOeEsf: row.longe_oe_esf,
    longeOeCil: row.longe_oe_cil,
    longeOeEixo: row.longe_oe_eixo,
    longeOeDnp: row.longe_oe_dnp,
    pertoOdEsf: row.perto_od_esf,
    pertoOdCil: row.perto_od_cil,
    pertoOdEixo: row.perto_od_eixo,
    pertoOdDnp: row.perto_od_dnp,
    pertoOeEsf: row.perto_oe_esf,
    pertoOeCil: row.perto_oe_cil,
    pertoOeEixo: row.perto_oe_eixo,
    pertoOeDnp: row.perto_oe_dnp,
    adicao: row.adicao,
    altura: row.altura,
    tipoLente: row.tipo_lente,
    tratamentos: row.tratamentos,
    armacao: row.armacao,
    observacao: row.observacao,
    versao: row.versao,
    criadoEm: row.criado_em
  }
}

export const receitaOpticaRepository = {
  buscarPorId(id: number): ReceitaOptica | null {
    const row = getDb()
      .prepare(
        `SELECT r.*, p.nome AS profissional_nome
         FROM receita_optica r
         LEFT JOIN profissional p ON p.id = r.profissional_id
         WHERE r.id = :id`
      )
      .get({ id }) as unknown as ReceitaRow | undefined
    return row ? toDomain(row) : null
  },

  listarPorCliente(clienteId: number): ReceitaOptica[] {
    const rows = getDb()
      .prepare(
        `SELECT r.*, p.nome AS profissional_nome
         FROM receita_optica r
         LEFT JOIN profissional p ON p.id = r.profissional_id
         WHERE r.cliente_id = :clienteId
         ORDER BY r.data_exame DESC, r.id DESC`
      )
      .all({ clienteId }) as unknown as ReceitaRow[]
    return rows.map(toDomain)
  },

  proximaVersao(clienteId: number): number {
    const row = getDb()
      .prepare('SELECT COALESCE(MAX(versao), 0) AS maxVersao FROM receita_optica WHERE cliente_id = :clienteId')
      .get({ clienteId }) as { maxVersao: number }
    return row.maxVersao + 1
  },

  criar(data: ReceitaOpticaInput, profissionalId: number | null, versao: number, criadoPor: number): number {
    const info = getDb()
      .prepare(
        `INSERT INTO receita_optica (
           cliente_id, profissional_id, data_exame,
           longe_od_esf, longe_od_cil, longe_od_eixo, longe_od_dnp,
           longe_oe_esf, longe_oe_cil, longe_oe_eixo, longe_oe_dnp,
           perto_od_esf, perto_od_cil, perto_od_eixo, perto_od_dnp,
           perto_oe_esf, perto_oe_cil, perto_oe_eixo, perto_oe_dnp,
           adicao, altura, tipo_lente, tratamentos, armacao, observacao,
           versao, criado_por
         ) VALUES (
           :clienteId, :profissionalId, :dataExame,
           :longeOdEsf, :longeOdCil, :longeOdEixo, :longeOdDnp,
           :longeOeEsf, :longeOeCil, :longeOeEixo, :longeOeDnp,
           :pertoOdEsf, :pertoOdCil, :pertoOdEixo, :pertoOdDnp,
           :pertoOeEsf, :pertoOeCil, :pertoOeEixo, :pertoOeDnp,
           :adicao, :altura, :tipoLente, :tratamentos, :armacao, :observacao,
           :versao, :criadoPor
         )`
      )
      .run({
        clienteId: data.clienteId,
        profissionalId,
        dataExame: data.dataExame,
        longeOdEsf: data.longeOdEsf,
        longeOdCil: data.longeOdCil,
        longeOdEixo: data.longeOdEixo,
        longeOdDnp: data.longeOdDnp,
        longeOeEsf: data.longeOeEsf,
        longeOeCil: data.longeOeCil,
        longeOeEixo: data.longeOeEixo,
        longeOeDnp: data.longeOeDnp,
        pertoOdEsf: data.pertoOdEsf,
        pertoOdCil: data.pertoOdCil,
        pertoOdEixo: data.pertoOdEixo,
        pertoOdDnp: data.pertoOdDnp,
        pertoOeEsf: data.pertoOeEsf,
        pertoOeCil: data.pertoOeCil,
        pertoOeEixo: data.pertoOeEixo,
        pertoOeDnp: data.pertoOeDnp,
        adicao: data.adicao,
        altura: data.altura,
        tipoLente: data.tipoLente || null,
        tratamentos: data.tratamentos || null,
        armacao: data.armacao?.toUpperCase() || null,
        observacao: data.observacao || null,
        versao,
        criadoPor
      })
    return Number(info.lastInsertRowid)
  }
}
