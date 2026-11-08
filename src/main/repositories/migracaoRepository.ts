import { getDb } from '@main/db/connection'
import type { SituacaoOS } from '@shared/types'
import { temMojibake } from '@main/migracao/transformar'
import { DESCRICAO_PRODUTO_IMPORTADO } from '@shared/importacao'
import { maiusculo, maiusculoOuNulo } from '@shared/texto'
import type { CampoDataExame, DetalhesExamePendencia, OsAntigasAbertas } from '@shared/importacao'
import type { ClienteExistente } from '@main/migracao/analisar'

const SISTEMA_ORIGEM = 'mdoculos'

export interface ClienteTransformado {
  nome: string
  dataNasc: string | null
  /** So digitos (formato do sistema novo) ou null. */
  cpf: string | null
  /** Anotacao livre, ex.: o CPF original quando ele foi retirado do cadastro. */
  observacao?: string | null
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
  const existente = db.prepare(`SELECT id FROM produto WHERE descricao = :descricao LIMIT 1`).get({ descricao: DESCRICAO_PRODUTO_IMPORTADO }) as
    | { id: number }
    | undefined
  if (existente) return existente.id

  const info = db
    .prepare(
      `INSERT INTO produto (descricao, categoria, unidade, custo_centavos, margem, preco_venda_centavos, estoque_minimo)
       VALUES (:descricao, 'servico', 'UN', 0, 0, 0, 0)`
    )
    .run({ descricao: DESCRICAO_PRODUTO_IMPORTADO })
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
        `INSERT INTO cliente (nome, data_nasc, cpf, observacao, celular, logradouro, numero, complemento, bairro, cidade, uf)
         VALUES (:nome, :dataNasc, :cpf, :observacao, :celular, :logradouro, :numero, :complemento, :bairro, :cidade, :uf)`
      )
      .run({
        nome: maiusculo(dados.nome),
        dataNasc: dados.dataNasc,
        cpf: dados.cpf,
        observacao: dados.observacao ?? null,
        celular: dados.celular,
        logradouro: maiusculoOuNulo(dados.logradouro),
        numero: dados.numero,
        complemento: maiusculoOuNulo(dados.complemento),
        bairro: maiusculoOuNulo(dados.bairro),
        cidade: maiusculoOuNulo(dados.cidade),
        uf: maiusculoOuNulo(dados.uf)
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

/**
 * Cliente sem nome que veio de uma importacao anterior e nao tem nenhuma
 * receita no sistema antigo: sai do banco. So remove se, no OptiAleph, ele
 * continua sem nome (ninguem completou o cadastro) e nao tem nada atrelado -
 * receita, venda, OS, conta a receber ou contato do Relacionamento. Devolve
 * `false` quando o cliente fica.
 */
export function removerClienteImportadoSemNome(clienteId: number): boolean {
  const db = getDb()
  db.exec('BEGIN IMMEDIATE')
  try {
    const cliente = db.prepare(`SELECT nome FROM cliente WHERE id = :id`).get({ id: clienteId }) as
      | { nome: string | null }
      | undefined
    const continuaSemNome = cliente !== undefined && !(cliente.nome ?? '').trim()

    const vinculo = continuaSemNome
      ? (db
          .prepare(
            `SELECT EXISTS (SELECT 1 FROM receita_optica WHERE cliente_id = :id)
                 OR EXISTS (SELECT 1 FROM venda WHERE cliente_id = :id)
                 OR EXISTS (SELECT 1 FROM ordem_servico WHERE cliente_id = :id)
                 OR EXISTS (SELECT 1 FROM conta_receber WHERE cliente_id = :id)
                 OR EXISTS (SELECT 1 FROM contato WHERE cliente_id = :id) AS tem`
          )
          .get({ id: clienteId }) as { tem: number })
      : null

    if (!continuaSemNome || vinculo?.tem === 1) {
      db.exec('ROLLBACK')
      return false
    }

    db.prepare(
      `DELETE FROM migracao_registro
       WHERE origem_sistema = :sistema AND destino_tabela = 'cliente' AND destino_id = :id`
    ).run({ sistema: SISTEMA_ORIGEM, id: clienteId })
    db.prepare(`DELETE FROM cliente WHERE id = :id`).run({ id: clienteId })

    db.exec('COMMIT')
    return true
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function corrigirTextosCliente(
  clienteId: number,
  dados: Pick<ClienteTransformado, 'nome' | 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'cidade'>
): boolean {
  return corrigirCampos('cliente', clienteId, {
    nome: maiusculoOuNulo(dados.nome),
    logradouro: maiusculoOuNulo(dados.logradouro),
    numero: dados.numero,
    complemento: maiusculoOuNulo(dados.complemento),
    bairro: maiusculoOuNulo(dados.bairro),
    cidade: maiusculoOuNulo(dados.cidade)
  })
}

// ---------------------------------------------------------------------
// CPF e mesclagem de clientes
// ---------------------------------------------------------------------

/** Todos os clientes deste sistema, para comparar CPF por digitos (ha CPFs antigos gravados com mascara). */
export function listarClientesExistentes(): ClienteExistente[] {
  const rows = getDb().prepare('SELECT id, nome, data_nasc, cpf FROM cliente').all() as unknown as {
    id: number
    nome: string | null
    data_nasc: string | null
    cpf: string | null
  }[]
  return rows.map((r) => ({ clienteId: r.id, nome: r.nome, dataNasc: r.data_nasc, cpf: r.cpf }))
}

export function atualizarCpfCliente(clienteId: number, cpf: string | null): void {
  getDb().prepare('UPDATE cliente SET cpf = :cpf WHERE id = :id').run({ id: clienteId, cpf })
}

/**
 * Une um cliente do sistema antigo a um cliente que ja existe aqui: o codigo
 * antigo passa a apontar para ele (os exames dele seguem para o mesmo
 * cadastro) e so os campos que estavam vazios no cadastro principal sao
 * preenchidos com o que o duplicado tinha.
 */
export function mesclarCliente(origemId: number, destinoClienteId: number, dados: ClienteTransformado): void {
  const db = getDb()
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare(
      `UPDATE cliente SET
         data_nasc   = COALESCE(NULLIF(data_nasc, ''), :dataNasc),
         celular     = COALESCE(NULLIF(celular, ''), :celular),
         logradouro  = COALESCE(NULLIF(logradouro, ''), :logradouro),
         numero      = COALESCE(NULLIF(numero, ''), :numero),
         complemento = COALESCE(NULLIF(complemento, ''), :complemento),
         bairro      = COALESCE(NULLIF(bairro, ''), :bairro),
         cidade      = COALESCE(NULLIF(cidade, ''), :cidade),
         uf          = COALESCE(NULLIF(uf, ''), :uf)
       WHERE id = :id`
    ).run({
      id: destinoClienteId,
      dataNasc: dados.dataNasc,
      celular: dados.celular,
      logradouro: maiusculoOuNulo(dados.logradouro),
      numero: dados.numero,
      complemento: maiusculoOuNulo(dados.complemento),
      bairro: maiusculoOuNulo(dados.bairro),
      cidade: maiusculoOuNulo(dados.cidade),
      uf: maiusculoOuNulo(dados.uf)
    })

    db.prepare(
      `INSERT INTO migracao_registro (origem_sistema, origem_tabela, origem_id, destino_tabela, destino_id)
       VALUES (:sistema, 'clientes', :origemId, 'cliente', :destinoId)`
    ).run({ sistema: SISTEMA_ORIGEM, origemId, destinoId: destinoClienteId })

    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// ---------------------------------------------------------------------
// Datas de exames ja importados: ler o valor atual e aplicar uma correcao
// ---------------------------------------------------------------------

/** Datas de um exame importado como estao hoje no banco novo (so o dia). */
export function datasAtuaisDoExame(vendaId: number): Record<CampoDataExame, string | null> {
  const db = getDb()
  const linha = db
    .prepare(
      `SELECT r.data_exame AS data_exame, v.data AS data_venda,
              os.data_envio AS data_saida, os.data_chegada AS data_chegada
       FROM venda v
       LEFT JOIN receita_optica r ON r.id = v.receita_optica_id
       LEFT JOIN ordem_servico os ON os.venda_id = v.id
       WHERE v.id = :id`
    )
    .get({ id: vendaId }) as Record<CampoDataExame, string | null> | undefined
  const corte = (v: string | null | undefined): string | null => (v ? v.slice(0, 10) : null)
  return {
    data_exame: corte(linha?.data_exame),
    data_venda: corte(linha?.data_venda),
    data_saida: corte(linha?.data_saida),
    data_chegada: corte(linha?.data_chegada)
  }
}

/**
 * Corrige UMA data de um exame importado, junto com tudo o que foi gravado a
 * partir dela (OS, lancamento da venda, data de entrega presumida). Cada
 * dependente so muda se ainda tiver o valor antigo: o que alguem ja ajustou a
 * mao fica como esta. Devolve `false`, sem gravar nada, se a data atual nao for
 * mais a que a pendencia apontou (alguem ja mexeu).
 */
export function aplicarCorrecaoData(vendaId: number, campo: CampoDataExame, atual: string | null, sugerido: string): boolean {
  if (datasAtuaisDoExame(vendaId)[campo] !== atual) return false

  const db = getDb()
  const p = { vendaId, atual, sugerido }
  db.exec('BEGIN IMMEDIATE')
  try {
    if (campo === 'data_exame') {
      db.prepare(
        `UPDATE receita_optica SET data_exame = :sugerido
         WHERE id = (SELECT receita_optica_id FROM venda WHERE id = :vendaId)`
      ).run({ vendaId, sugerido })
      db.prepare(
        `UPDATE ordem_servico SET data_abertura = :sugerido
         WHERE venda_id = :vendaId AND substr(data_abertura, 1, 10) = :atual`
      ).run(p)
      // A data da venda e do lancamento financeiro NAO acompanham: venda e dinheiro tem data propria.
    } else if (campo === 'data_venda') {
      db.prepare(`UPDATE venda SET data = :sugerido WHERE id = :vendaId`).run({ vendaId, sugerido })
      db.prepare(
        `UPDATE lancamento SET data = :sugerido
         WHERE origem_tipo = 'venda' AND origem_id = :vendaId AND substr(data, 1, 10) = :atual`
      ).run(p)
    } else if (campo === 'data_saida') {
      db.prepare(`UPDATE ordem_servico SET data_envio = :sugerido WHERE venda_id = :vendaId`).run({ vendaId, sugerido })
    } else {
      db.prepare(`UPDATE ordem_servico SET data_chegada = :sugerido WHERE venda_id = :vendaId`).run({ vendaId, sugerido })
      // A importacao usou a chegada como data de entrega das OS ja entregues.
      db.prepare(
        `UPDATE ordem_servico SET data_entrega = :sugerido
         WHERE venda_id = :vendaId AND substr(data_entrega, 1, 10) = :atual`
      ).run(p)
    }
    db.exec('COMMIT')
    return true
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
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

/** Dados do exame importado para a tela de pendencias: cliente, item, laboratorio e as datas gravadas. */
export function detalhesDoExame(vendaId: number): DetalhesExamePendencia | null {
  const db = getDb()
  const l = db
    .prepare(
      `SELECT v.numero AS numero_venda, v.total_centavos, v.data AS data_venda,
              c.id AS cliente_id, c.nome AS cliente_nome, c.celular, c.cpf,
              r.data_exame, pr.nome AS profissional,
              os.numero AS numero_os, os.situacao, os.laboratorio,
              os.data_abertura, os.data_envio, os.data_chegada, os.data_entrega,
              (SELECT descricao FROM venda_item WHERE venda_id = v.id ORDER BY id LIMIT 1) AS item,
              (SELECT forma_pagamento FROM venda_pagamento WHERE venda_id = v.id ORDER BY id LIMIT 1) AS forma
       FROM venda v
       JOIN cliente c ON c.id = v.cliente_id
       LEFT JOIN receita_optica r ON r.id = v.receita_optica_id
       LEFT JOIN profissional pr ON pr.id = r.profissional_id
       LEFT JOIN ordem_servico os ON os.venda_id = v.id
       WHERE v.id = :id`
    )
    .get({ id: vendaId }) as Record<string, string | number | null> | undefined
  if (!l) return null

  const dia = (v: string | number | null | undefined): string | null => (typeof v === 'string' && v ? v.slice(0, 10) : null)
  const texto = (v: string | number | null | undefined): string | null => (typeof v === 'string' && v ? v : null)

  const outros = db
    .prepare(
      `SELECT v.numero, r.data_exame, v.data AS data_venda
       FROM venda v LEFT JOIN receita_optica r ON r.id = v.receita_optica_id
       WHERE v.cliente_id = :clienteId AND v.id != :id
       ORDER BY v.id DESC LIMIT 5`
    )
    .all({ clienteId: l.cliente_id, id: vendaId }) as unknown as { numero: string; data_exame: string | null; data_venda: string | null }[]

  return {
    cliente: { id: Number(l.cliente_id), nome: String(l.cliente_nome ?? ''), celular: texto(l.celular), cpf: texto(l.cpf) },
    numeroVenda: String(l.numero_venda),
    numeroOS: texto(l.numero_os),
    item: texto(l.item),
    laboratorio: texto(l.laboratorio),
    profissional: texto(l.profissional),
    valorCentavos: Number(l.total_centavos ?? 0),
    formaPagamento: texto(l.forma),
    situacaoOS: texto(l.situacao),
    datas: {
      exame: dia(l.data_exame),
      venda: dia(l.data_venda),
      abertura: dia(l.data_abertura),
      envio: dia(l.data_envio),
      chegada: dia(l.data_chegada),
      entrega: dia(l.data_entrega)
    },
    outros: outros.map((o) => ({ numero: o.numero, dataExame: dia(o.data_exame), dataVenda: dia(o.data_venda) }))
  }
}

// ---------------------------------------------------------------------
// Entregas antigas em aberto
// ---------------------------------------------------------------------
// As OS vindas do sistema antigo (numero "MDO-...") que nunca foram entregues
// ficariam para sempre nas telas de OS, no painel e no Relacionamento.

const OS_ANTIGA_ABERTA = `numero LIKE 'MDO-%' AND situacao NOT IN ('ENTREGUE', 'CANCELADA')`

export function resumoOsAntigasAbertas(hoje: string): OsAntigasAbertas {
  const db = getDb()
  const porSituacao: Record<string, number> = {}
  const grupos = db
    .prepare(`SELECT situacao, COUNT(*) AS n FROM ordem_servico WHERE ${OS_ANTIGA_ABERTA} GROUP BY situacao`)
    .all() as unknown as { situacao: string; n: number }[]
  let total = 0
  for (const g of grupos) {
    porSituacao[g.situacao] = g.n
    total += g.n
  }
  if (total === 0) return { total: 0, porSituacao, maisAntiga: null, sugestaoData: null }

  const linha = db
    .prepare(
      `SELECT MIN(substr(os.data_abertura, 1, 10)) AS mais_antiga,
              MAX(MAX(COALESCE(substr(os.data_abertura, 1, 10), ''), COALESCE(substr(os.data_envio, 1, 10), ''),
                      COALESCE(substr(os.data_chegada, 1, 10), ''), COALESCE(substr(v.data, 1, 10), ''))) AS mais_recente
       FROM ordem_servico os LEFT JOIN venda v ON v.id = os.venda_id
       WHERE ${OS_ANTIGA_ABERTA.replace(/\b(numero|situacao)\b/g, 'os.$1')}`
    )
    .get() as { mais_antiga: string | null; mais_recente: string | null }

  // Ignora o que for lixo (data no futuro ou que nao e data): a sugestao nunca passa de hoje.
  const recente = linha.mais_recente && /^\d{4}-\d{2}-\d{2}$/.test(linha.mais_recente) ? linha.mais_recente : null
  return {
    total,
    porSituacao,
    maisAntiga: linha.mais_antiga,
    sugestaoData: recente ? (recente > hoje ? hoje : recente) : hoje
  }
}

/**
 * Marca como ENTREGUE todas as OS antigas ainda abertas. A data de entrega e a
 * escolhida, mas nunca anterior ao que a propria OS ja registra (abertura, envio
 * ou chegada): a ordem das datas continua fazendo sentido. Devolve o que mudou
 * (para a auditoria poder desfazer a mao).
 */
export function encerrarOsAntigasAbertas(data: string): { id: number; situacaoAnterior: string; dataEntrega: string }[] {
  const db = getDb()
  const alvo = db
    .prepare(
      `SELECT id, situacao, substr(data_abertura, 1, 10) AS abertura, substr(data_envio, 1, 10) AS envio,
              substr(data_chegada, 1, 10) AS chegada
       FROM ordem_servico WHERE ${OS_ANTIGA_ABERTA}`
    )
    .all() as unknown as { id: number; situacao: string; abertura: string | null; envio: string | null; chegada: string | null }[]

  const feitas: { id: number; situacaoAnterior: string; dataEntrega: string }[] = []
  db.exec('BEGIN IMMEDIATE')
  try {
    const atualizar = db.prepare(`UPDATE ordem_servico SET situacao = 'ENTREGUE', data_entrega = :entrega WHERE id = :id`)
    for (const os of alvo) {
      const validas = [data, os.abertura, os.envio, os.chegada].filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d))
      const entrega = validas.reduce((a, b) => (a > b ? a : b))
      atualizar.run({ id: os.id, entrega })
      feitas.push({ id: os.id, situacaoAnterior: os.situacao, dataEntrega: entrega })
    }
    db.exec('COMMIT')
    return feitas
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// ---------------------------------------------------------------------
// Registros em branco que ja tinham sido importados
// ---------------------------------------------------------------------

const COLUNAS_DA_RECEITA_COM_CONTEUDO = [
  'longe_od_esf', 'longe_od_cil', 'longe_od_eixo', 'longe_od_dnp', 'longe_od_dp',
  'longe_oe_esf', 'longe_oe_cil', 'longe_oe_eixo', 'longe_oe_dnp', 'longe_oe_dp',
  'perto_od_esf', 'perto_od_cil', 'perto_od_eixo', 'perto_od_dnp', 'perto_od_dp',
  'perto_oe_esf', 'perto_oe_cil', 'perto_oe_eixo', 'perto_oe_dnp', 'perto_oe_dp',
  'adicao', 'altura'
]
const COLUNAS_DO_CLIENTE_COM_DADOS = [
  'data_nasc', 'cpf', 'rg', 'celular', 'telefone', 'email', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade',
  'cep', 'profissao', 'indicado_por', 'observacao'
]

/**
 * O cliente importado continua sendo so um registro em branco? So devolve `true`
 * se NADA foi feito com ele depois da importacao: continua sem dado nenhum, as
 * receitas seguem zeradas na versao original, as vendas e OS sao todas da
 * importacao, valem zero e estao em aberto, e nao ha conta a receber nem contato
 * do Relacionamento. Qualquer coisa a mais e sinal de uso real: o cliente fica.
 */
export function registroVazioRemovivel(clienteId: number): boolean {
  const db = getDb()
  const cliente = db.prepare(`SELECT ${COLUNAS_DO_CLIENTE_COM_DADOS.join(', ')} FROM cliente WHERE id = :id`).get({ id: clienteId }) as
    | Record<string, string | null>
    | undefined
  if (!cliente) return false
  if (COLUNAS_DO_CLIENTE_COM_DADOS.some((c) => cliente[c] !== null && String(cliente[c]).trim() !== '')) return false

  const receitaComConteudo = COLUNAS_DA_RECEITA_COM_CONTEUDO.map((c) => `(${c} IS NOT NULL AND ${c} != 0)`).join(' OR ')
  const usado = db
    .prepare(
      `SELECT
         EXISTS (SELECT 1 FROM receita_optica WHERE cliente_id = :id AND (
                   ${receitaComConteudo}
                   OR COALESCE(TRIM(tipo_lente), '') != '' OR COALESCE(TRIM(tratamentos), '') != ''
                   OR COALESCE(TRIM(armacao), '') != '' OR COALESCE(TRIM(observacao), '') != ''
                   OR profissional_id IS NOT NULL OR versao != 1 OR substituida_por_id IS NOT NULL))
         OR EXISTS (SELECT 1 FROM venda WHERE cliente_id = :id AND (
                   numero NOT LIKE 'MDO-%' OR total_centavos != 0 OR desconto_centavos != 0 OR situacao != 'CONCLUIDA'))
         OR EXISTS (SELECT 1 FROM ordem_servico WHERE cliente_id = :id AND (
                   numero NOT LIKE 'MDO-%' OR situacao != 'EM ABERTO' OR COALESCE(TRIM(laboratorio), '') != ''
                   OR COALESCE(TRIM(observacao), '') != ''))
         OR EXISTS (SELECT 1 FROM conta_receber WHERE cliente_id = :id)
         OR EXISTS (SELECT 1 FROM contato WHERE cliente_id = :id) AS tem`
    )
    .get({ id: clienteId }) as { tem: number }
  return usado.tem === 0
}

/**
 * Apaga de vez um registro em branco ja importado: o cliente e tudo o que a
 * importacao criou para ele (receita, venda com item e pagamento, OS), mais o mapa
 * da importacao e as pendencias. Uma transacao so; se algo impedir (ex.: um vinculo
 * inesperado), nada e apagado. Devolve `false` quando o cliente fica.
 */
export function removerRegistroVazioImportado(clienteId: number): boolean {
  if (!registroVazioRemovivel(clienteId)) return false

  const db = getDb()
  const vendas = (db.prepare('SELECT id FROM venda WHERE cliente_id = :id').all({ id: clienteId }) as unknown as { id: number }[]).map((v) => v.id)
  const lista = (ids: number[]): string => (ids.length > 0 ? ids.join(', ') : 'NULL') // ids vem do proprio banco, nunca do usuario

  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('DELETE FROM ordem_servico WHERE cliente_id = :id').run({ id: clienteId })
    db.prepare(`DELETE FROM comissao WHERE venda_id IN (${lista(vendas)})`).run()
    db.prepare(`DELETE FROM lancamento WHERE origem_tipo = 'venda' AND origem_id IN (${lista(vendas)})`).run()
    db.prepare(`DELETE FROM venda_pagamento WHERE venda_id IN (${lista(vendas)})`).run()
    db.prepare(`DELETE FROM venda_item WHERE venda_id IN (${lista(vendas)})`).run()
    db.prepare('DELETE FROM venda WHERE cliente_id = :id').run({ id: clienteId })
    db.prepare('DELETE FROM receita_optica WHERE cliente_id = :id').run({ id: clienteId })
    db.prepare(
      `DELETE FROM migracao_registro WHERE origem_sistema = :sistema AND (
         (destino_tabela = 'cliente' AND destino_id = :id) OR (destino_tabela = 'venda' AND destino_id IN (${lista(vendas)})))`
    ).run({ sistema: SISTEMA_ORIGEM, id: clienteId })
    db.prepare(
      `DELETE FROM migracao_pendencia WHERE (destino_tabela = 'cliente' AND destino_id = :id)
         OR (destino_tabela = 'venda' AND destino_id IN (${lista(vendas)}))`
    ).run({ id: clienteId })
    db.prepare('DELETE FROM cliente WHERE id = :id').run({ id: clienteId })
    db.exec('COMMIT')
    return true
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
