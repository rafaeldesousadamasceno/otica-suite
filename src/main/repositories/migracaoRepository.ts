import { getDb } from '@main/db/connection'
import type { SituacaoOS } from '@shared/types'
import { temMojibake } from '@main/migracao/transformar'

const SISTEMA_ORIGEM = 'mdoculos'

interface ClienteTransformado {
  nome: string
  dataNasc: string | null
  cpf: string | null
  celular: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
}

export interface ExameTransformado {
  clienteId: number
  profissionalId: number | null
  dataExame: string
  dataVenda: string
  longeOdEsf: number | null
  longeOdCil: number | null
  longeOdEixo: number | null
  longeOdDnp: number | null
  longeOeEsf: number | null
  longeOeCil: number | null
  longeOeEixo: number | null
  longeOeDnp: number | null
  pertoOdEsf: number | null
  pertoOdCil: number | null
  pertoOdEixo: number | null
  pertoOdDnp: number | null
  pertoOeEsf: number | null
  pertoOeCil: number | null
  pertoOeEixo: number | null
  pertoOeDnp: number | null
  adicao: number | null
  descricaoItem: string
  valorTotalCentavos: number
  formaPagamento: string
  laboratorio: string | null
  situacaoOS: SituacaoOS
  dataEnvio: string | null
  dataChegada: string | null
  dataEntrega: string | null
  vendedorId: number
}

interface DespesaTransformada {
  tipo: 'RECEITA' | 'DESPESA'
  descricao: string
  valorCentavos: number
  data: string
}

/** Ja foi importado antes (CA1: idempotente)? Devolve o id no banco novo, ou null. */
export function jaImportado(tabelaOrigem: string, origemId: number): number | null {
  const row = getDb()
    .prepare(
      `SELECT destino_id FROM migracao_registro
       WHERE origem_sistema = :sistema AND origem_tabela = :tabela AND origem_id = :origemId`
    )
    .get({ sistema: SISTEMA_ORIGEM, tabela: tabelaOrigem, origemId }) as { destino_id: number } | undefined
  return row?.destino_id ?? null
}

/** Produto generico onde entram os itens de venda migrados (PRD 11: "lentes/tratamentos/armacao -> produto 'Item importado'"). */
export function garantirProdutoGenerico(): number {
  const db = getDb()
  const existente = db.prepare(`SELECT id FROM produto WHERE descricao = 'Item importado' LIMIT 1`).get() as
    | { id: number }
    | undefined
  if (existente) return existente.id

  const info = db
    .prepare(
      `INSERT INTO produto (descricao, categoria, unidade, custo_centavos, margem, preco_venda_centavos, estoque_minimo)
       VALUES ('Item importado', 'servico', 'UN', 0, 0, 0, 0)`
    )
    .run()
  return Number(info.lastInsertRowid)
}

/** Profissional (PRD 17, Q1): find-or-create pelo nome, igual a receitaOpticaService faz para receitas novas. */
export function garantirProfissional(nome: string | null): number | null {
  const nomeNormalizado = nome?.trim()
  if (!nomeNormalizado) return null

  const db = getDb()
  const existente = db.prepare(`SELECT id FROM profissional WHERE nome = :nome`).get({ nome: nomeNormalizado }) as
    | { id: number }
    | undefined
  if (existente) return existente.id

  const info = db.prepare(`INSERT INTO profissional (nome, ativo) VALUES (:nome, 1)`).run({ nome: nomeNormalizado })
  return Number(info.lastInsertRowid)
}

export function importarCliente(dados: ClienteTransformado, origemId: number): number {
  const db = getDb()
  db.exec('BEGIN IMMEDIATE')
  try {
    const info = db
      .prepare(
        `INSERT INTO cliente (nome, data_nasc, cpf, celular, logradouro, numero, complemento, bairro, cidade, uf)
         VALUES (:nome, :dataNasc, :cpf, :celular, :logradouro, :numero, :complemento, :bairro, :cidade, :uf)`
      )
      .run({
        nome: dados.nome,
        dataNasc: dados.dataNasc,
        cpf: dados.cpf,
        celular: dados.celular,
        logradouro: dados.logradouro,
        numero: dados.numero,
        complemento: dados.complemento,
        bairro: dados.bairro,
        cidade: dados.cidade,
        uf: dados.uf
      })
    const novoId = Number(info.lastInsertRowid)

    db.prepare(
      `INSERT INTO migracao_registro (origem_sistema, origem_tabela, origem_id, destino_tabela, destino_id)
       VALUES (:sistema, 'clientes', :origemId, 'cliente', :destinoId)`
    ).run({ sistema: SISTEMA_ORIGEM, origemId, destinoId: novoId })

    db.exec('COMMIT')
    return novoId
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

/**
 * PRD 11: "um registro de exames gera receita_optica + venda + venda_item +
 * ordem_servico + lancamento" - tudo numa unica transacao, igual a venda
 * nova (RN-05). Numero da venda/OS usa o prefixo `MDO-` + id antigo: nunca
 * colide com o formato novo (`AAAA-NNNNN`, sempre com hifen no meio de 4
 * digitos) e deixa visivel na tela que aquele registro veio do sistema
 * anterior.
 */
export function importarExame(dados: ExameTransformado, produtoGenericoId: number, origemId: number): number {
  const db = getDb()
  const numero = `MDO-${origemId}`

  db.exec('BEGIN IMMEDIATE')
  try {
    const infoReceita = db
      .prepare(
        `INSERT INTO receita_optica (
           cliente_id, profissional_id, data_exame,
           longe_od_esf, longe_od_cil, longe_od_eixo, longe_od_dnp,
           longe_oe_esf, longe_oe_cil, longe_oe_eixo, longe_oe_dnp,
           perto_od_esf, perto_od_cil, perto_od_eixo, perto_od_dnp,
           perto_oe_esf, perto_oe_cil, perto_oe_eixo, perto_oe_dnp,
           adicao
         ) VALUES (
           :clienteId, :profissionalId, :dataExame,
           :longeOdEsf, :longeOdCil, :longeOdEixo, :longeOdDnp,
           :longeOeEsf, :longeOeCil, :longeOeEixo, :longeOeDnp,
           :pertoOdEsf, :pertoOdCil, :pertoOdEixo, :pertoOdDnp,
           :pertoOeEsf, :pertoOeCil, :pertoOeEixo, :pertoOeDnp,
           :adicao
         )`
      )
      .run({
        clienteId: dados.clienteId,
        profissionalId: dados.profissionalId,
        dataExame: dados.dataExame,
        longeOdEsf: dados.longeOdEsf,
        longeOdCil: dados.longeOdCil,
        longeOdEixo: dados.longeOdEixo,
        longeOdDnp: dados.longeOdDnp,
        longeOeEsf: dados.longeOeEsf,
        longeOeCil: dados.longeOeCil,
        longeOeEixo: dados.longeOeEixo,
        longeOeDnp: dados.longeOeDnp,
        pertoOdEsf: dados.pertoOdEsf,
        pertoOdCil: dados.pertoOdCil,
        pertoOdEixo: dados.pertoOdEixo,
        pertoOdDnp: dados.pertoOdDnp,
        pertoOeEsf: dados.pertoOeEsf,
        pertoOeCil: dados.pertoOeCil,
        pertoOeEixo: dados.pertoOeEixo,
        pertoOeDnp: dados.pertoOeDnp,
        adicao: dados.adicao
      })
    const receitaId = Number(infoReceita.lastInsertRowid)

    const infoVenda = db
      .prepare(
        `INSERT INTO venda (
           numero, cliente_id, vendedor_id, receita_optica_id, data,
           subtotal_centavos, desconto_centavos, total_centavos, situacao
         ) VALUES (
           :numero, :clienteId, :vendedorId, :receitaId, :data,
           :total, 0, :total, 'CONCLUIDA'
         )`
      )
      .run({
        numero,
        clienteId: dados.clienteId,
        vendedorId: dados.vendedorId,
        receitaId,
        data: dados.dataVenda,
        total: dados.valorTotalCentavos
      })
    const vendaId = Number(infoVenda.lastInsertRowid)

    db.prepare(
      `INSERT INTO venda_item (venda_id, produto_id, descricao, quantidade, preco_unitario_centavos, desconto_centavos, total_centavos)
       VALUES (:vendaId, :produtoId, :descricao, 1, :valor, 0, :valor)`
    ).run({ vendaId, produtoId: produtoGenericoId, descricao: dados.descricaoItem, valor: dados.valorTotalCentavos })

    db.prepare(
      `INSERT INTO venda_pagamento (venda_id, forma_pagamento, valor_centavos, parcelas)
       VALUES (:vendaId, :forma, :valor, 1)`
    ).run({ vendaId, forma: dados.formaPagamento, valor: dados.valorTotalCentavos })

    if (dados.valorTotalCentavos > 0) {
      db.prepare(
        `INSERT INTO lancamento (tipo, categoria, descricao, valor_centavos, data, origem_tipo, origem_id)
         VALUES ('RECEITA', 'VENDA', :descricao, :valor, :data, 'venda', :vendaId)`
      ).run({
        descricao: `Venda ${numero} (importada do sistema anterior)`,
        valor: dados.valorTotalCentavos,
        data: dados.dataVenda,
        vendaId
      })
    }

    db.prepare(
      `INSERT INTO ordem_servico (
         numero, venda_id, cliente_id, receita_optica_id, laboratorio, situacao,
         data_abertura, data_envio, data_chegada, data_entrega
       ) VALUES (
         :numero, :vendaId, :clienteId, :receitaId, :laboratorio, :situacao,
         :dataAbertura, :dataEnvio, :dataChegada, :dataEntrega
       )`
    ).run({
      numero,
      vendaId,
      clienteId: dados.clienteId,
      receitaId,
      laboratorio: dados.laboratorio,
      situacao: dados.situacaoOS,
      dataAbertura: dados.dataExame,
      dataEnvio: dados.dataEnvio,
      dataChegada: dados.dataChegada,
      dataEntrega: dados.dataEntrega
    })

    db.prepare(
      `INSERT INTO migracao_registro (origem_sistema, origem_tabela, origem_id, destino_tabela, destino_id)
       VALUES (:sistema, 'exames', :origemId, 'venda', :destinoId)`
    ).run({ sistema: SISTEMA_ORIGEM, origemId, destinoId: vendaId })

    db.exec('COMMIT')
    return vendaId
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function importarDespesa(dados: DespesaTransformada, origemId: number): number {
  const db = getDb()
  db.exec('BEGIN IMMEDIATE')
  try {
    const info = db
      .prepare(
        `INSERT INTO lancamento (tipo, categoria, descricao, valor_centavos, data, origem_tipo, origem_id)
         VALUES (:tipo, NULL, :descricao, :valor, :data, 'migracao', :origemId)`
      )
      .run({ tipo: dados.tipo, descricao: dados.descricao, valor: dados.valorCentavos, data: dados.data, origemId })
    const novoId = Number(info.lastInsertRowid)

    db.prepare(
      `INSERT INTO migracao_registro (origem_sistema, origem_tabela, origem_id, destino_tabela, destino_id)
       VALUES (:sistema, 'receitas_despesas', :origemId, 'lancamento', :destinoId)`
    ).run({ sistema: SISTEMA_ORIGEM, origemId, destinoId: novoId })

    db.exec('COMMIT')
    return novoId
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// ---------------------------------------------------------------------
// Correcao de textos ja importados (acentos quebrados por codificacao)
// ---------------------------------------------------------------------
// So troca o valor que ainda tem cara de "acento quebrado": se alguem ja
// corrigiu o campo a mao no sistema, a reimportacao nao sobrescreve.

function corrigirCampos(tabela: string, id: number, novos: Record<string, string | null>): boolean {
  const db = getDb()
  const colunas = Object.keys(novos)
  const atual = db.prepare(`SELECT ${colunas.join(', ')} FROM ${tabela} WHERE id = :id`).get({ id }) as
    | Record<string, string | null>
    | undefined
  if (!atual) return false

  const mudancas = colunas.filter((c) => temMojibake(atual[c]) && novos[c] && novos[c] !== atual[c])
  if (mudancas.length === 0) return false

  db.prepare(`UPDATE ${tabela} SET ${mudancas.map((c) => `${c} = :${c}`).join(', ')} WHERE id = :id`).run({
    id,
    ...Object.fromEntries(mudancas.map((c) => [c, novos[c]]))
  })
  return true
}

export function corrigirTextosCliente(
  clienteId: number,
  dados: Pick<ClienteTransformado, 'nome' | 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'cidade'>
): boolean {
  return corrigirCampos('cliente', clienteId, { ...dados })
}

export function corrigirTextosExame(vendaId: number, descricaoItem: string, laboratorio: string | null, medico: string | null): boolean {
  const db = getDb()
  let mudou = false

  const item = db.prepare(`SELECT id FROM venda_item WHERE venda_id = :vendaId ORDER BY id LIMIT 1`).get({ vendaId }) as
    | { id: number }
    | undefined
  if (item) mudou = corrigirCampos('venda_item', item.id, { descricao: descricaoItem }) || mudou

  const os = db.prepare(`SELECT id, receita_optica_id FROM ordem_servico WHERE venda_id = :vendaId`).get({ vendaId }) as
    | { id: number; receita_optica_id: number | null }
    | undefined
  if (os) {
    mudou = corrigirCampos('ordem_servico', os.id, { laboratorio }) || mudou

    // O profissional e criado "por nome": se o nome antigo veio quebrado, a receita passa a apontar para o certo.
    if (os.receita_optica_id && medico?.trim()) {
      const atual = db
        .prepare(
          `SELECT p.nome FROM receita_optica r JOIN profissional p ON p.id = r.profissional_id WHERE r.id = :id`
        )
        .get({ id: os.receita_optica_id }) as { nome: string } | undefined
      if (atual && temMojibake(atual.nome)) {
        const profissionalId = garantirProfissional(medico)
        db.prepare(`UPDATE receita_optica SET profissional_id = :profissionalId WHERE id = :id`).run({
          profissionalId,
          id: os.receita_optica_id
        })
        mudou = true
      }
    }
  }
  return mudou
}

export function corrigirTextosDespesa(lancamentoId: number, descricao: string): boolean {
  return corrigirCampos('lancamento', lancamentoId, { descricao })
}
