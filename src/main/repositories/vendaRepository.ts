import { getDb } from '@main/db/connection'
import { registrarMovimento } from './estoqueRepository'
import { comissaoRepository } from './comissaoRepository'
import { contaReceberRepository } from './contaReceberRepository'
import { calcularParcelas, calcularVencimentos } from '@shared/parcelamento'
import type { VendaCreateInput } from '@shared/ipc'
import type { VendaDetalhada, VendaItemDetalhe, VendaPagamentoDetalhe, VendaResumo } from '@shared/types'
import { hojeLocal } from '@shared/data'

function hoje(): string {
  return hojeLocal()
}

interface ProdutoParaVenda {
  id: number
  descricao: string
  categoria: string
}

function buscarProdutoAtivo(db: ReturnType<typeof getDb>, id: number): ProdutoParaVenda | null {
  const row = db
    .prepare('SELECT id, descricao, categoria FROM produto WHERE id = :id AND ativo = 1')
    .get({ id }) as ProdutoParaVenda | undefined
  return row ?? null
}

const SELECT_RESUMO = `
  SELECT v.id, v.numero, v.cliente_id, c.nome AS cliente_nome,
         v.vendedor_id, u.nome AS vendedor_nome,
         v.data, v.total_centavos, v.situacao
  FROM venda v
  INNER JOIN cliente c ON c.id = v.cliente_id
  INNER JOIN usuario u ON u.id = v.vendedor_id
`

interface ResumoRow {
  id: number
  numero: string
  cliente_id: number
  cliente_nome: string
  vendedor_id: number
  vendedor_nome: string
  data: string
  total_centavos: number
  situacao: 'CONCLUIDA' | 'CANCELADA'
}

function toResumo(row: ResumoRow): VendaResumo {
  return {
    id: row.id,
    numero: row.numero,
    clienteId: row.cliente_id,
    clienteNome: row.cliente_nome,
    vendedorId: row.vendedor_id,
    vendedorNome: row.vendedor_nome,
    data: row.data,
    totalCentavos: row.total_centavos,
    situacao: row.situacao
  }
}

export interface ContextoCriarVenda {
  vendedorId: number
  autorizadoPorId: number | null
  subtotalCentavos: number
  descontoCentavos: number
  totalCentavos: number
  comissaoPercentual: number
}

export const vendaRepository = {
  buscarProdutoParaVenda: (id: number) => buscarProdutoAtivo(getDb(), id),

  /**
   * Grava a venda inteira - itens, baixa de estoque, pagamentos, parcelas
   * (contas a receber) e comissao - numa unica transacao (RN-05). Se
   * qualquer insert falhar, o ROLLBACK desfaz tudo; nunca fica uma venda
   * "pela metade" (com item mas sem financeiro, por exemplo).
   */
  criar(input: VendaCreateInput, ctx: ContextoCriarVenda): number {
    const db = getDb()
    db.exec('BEGIN IMMEDIATE')
    try {
      const ano = new Date().getFullYear()
      const prefixoAno = `${ano}-`
      const ultimo = db
        .prepare(`SELECT numero FROM venda WHERE numero LIKE :padrao ORDER BY numero DESC LIMIT 1`)
        .get({ padrao: `${prefixoAno}%` }) as { numero: string } | undefined
      const sequencial = ultimo ? Number(ultimo.numero.slice(prefixoAno.length)) + 1 : 1
      const numero = `${prefixoAno}${String(sequencial).padStart(5, '0')}`
      const dataVenda = hoje()

      const infoVenda = db
        .prepare(
          `INSERT INTO venda (
             numero, cliente_id, vendedor_id, receita_optica_id, data,
             subtotal_centavos, desconto_centavos, total_centavos, situacao, autorizado_por_id
           ) VALUES (
             :numero, :clienteId, :vendedorId, :receitaOpticaId, :data,
             :subtotal, :desconto, :total, 'CONCLUIDA', :autorizadoPorId
           )`
        )
        .run({
          numero,
          clienteId: input.clienteId,
          vendedorId: ctx.vendedorId,
          receitaOpticaId: input.receitaOpticaId ?? null,
          data: dataVenda,
          subtotal: ctx.subtotalCentavos,
          desconto: ctx.descontoCentavos,
          total: ctx.totalCentavos,
          autorizadoPorId: ctx.autorizadoPorId
        })
      const vendaId = Number(infoVenda.lastInsertRowid)

      for (const item of input.itens) {
        const produto = buscarProdutoAtivo(db, item.produtoId)
        if (!produto) throw new Error(`Produto #${item.produtoId} não encontrado ou inativo.`)

        const totalItem = item.quantidade * item.precoUnitarioCentavos - item.descontoCentavos
        db.prepare(
          `INSERT INTO venda_item (
             venda_id, produto_id, descricao, quantidade,
             preco_unitario_centavos, desconto_centavos, total_centavos
           ) VALUES (
             :vendaId, :produtoId, :descricao, :quantidade, :precoUnitario, :desconto, :total
           )`
        ).run({
          vendaId,
          produtoId: item.produtoId,
          descricao: produto.descricao,
          quantidade: item.quantidade,
          precoUnitario: item.precoUnitarioCentavos,
          desconto: item.descontoCentavos,
          total: totalItem
        })

        // Servico nao tem estoque para baixar (RF-07/08).
        if (produto.categoria !== 'servico') {
          registrarMovimento(db, {
            produtoId: item.produtoId,
            tipo: 'saida_venda',
            quantidade: -item.quantidade,
            documentoTipo: 'venda',
            documentoId: vendaId,
            usuarioId: ctx.vendedorId
          })
        }
      }

      for (const pagamento of input.pagamentos) {
        db.prepare(
          `INSERT INTO venda_pagamento (venda_id, forma_pagamento, valor_centavos, parcelas)
           VALUES (:vendaId, :forma, :valor, :parcelas)`
        ).run({
          vendaId,
          forma: pagamento.formaPagamento,
          valor: pagamento.valorCentavos,
          parcelas: pagamento.parcelas
        })

        if (pagamento.parcelas <= 1) {
          // Pago agora - entra direto no financeiro (RN-05, resolve o D9
          // do sistema anterior: a venda nunca mais fica sem lancamento).
          db.prepare(
            `INSERT INTO lancamento (tipo, categoria, descricao, valor_centavos, data, origem_tipo, origem_id, usuario_id)
             VALUES ('RECEITA', 'VENDA', :descricao, :valor, :data, 'venda', :vendaId, :usuarioId)`
          ).run({
            descricao: `Venda ${numero} - ${pagamento.formaPagamento}`,
            valor: pagamento.valorCentavos,
            data: dataVenda,
            vendaId,
            usuarioId: ctx.vendedorId
          })
        } else {
          // Parcelado - vira contas a receber; o lancamento acontece na
          // baixa de cada parcela (RF-11.1).
          const valoresParcelas = calcularParcelas(pagamento.valorCentavos, pagamento.parcelas)
          const vencimentos = calcularVencimentos(dataVenda, pagamento.parcelas)

          valoresParcelas.forEach((valor, i) => {
            db.prepare(
              `INSERT INTO conta_receber (venda_id, cliente_id, parcela, total_parcelas, valor_centavos, vencimento, situacao)
               VALUES (:vendaId, :clienteId, :parcela, :totalParcelas, :valor, :vencimento, 'ABERTA')`
            ).run({
              vendaId,
              clienteId: input.clienteId,
              parcela: i + 1,
              totalParcelas: pagamento.parcelas,
              valor,
              vencimento: vencimentos[i]
            })
          })
        }
      }

      // RN-08: comissao provisionada sobre o total liquido; libera quando
      // a venda/parcelas forem quitadas (RF-11, ainda nao construido).
      if (ctx.comissaoPercentual > 0) {
        const valorComissao = Math.round((ctx.totalCentavos * ctx.comissaoPercentual) / 100)
        db.prepare(
          `INSERT INTO comissao (venda_id, vendedor_id, base_centavos, percentual, valor_centavos, situacao)
           VALUES (:vendaId, :vendedorId, :base, :percentual, :valor, 'PROVISIONADA')`
        ).run({
          vendaId,
          vendedorId: ctx.vendedorId,
          base: ctx.totalCentavos,
          percentual: ctx.comissaoPercentual,
          valor: valorComissao
        })
      }

      if (input.ordemServicoId) {
        db.prepare('UPDATE ordem_servico SET venda_id = :vendaId WHERE id = :osId AND cliente_id = :clienteId').run({
          vendaId,
          osId: input.ordemServicoId,
          clienteId: input.clienteId
        })
      }

      // RN-08: venda sem nenhuma parcela em aberto ja nasce quitada (caso
      // classico: pagamento 100% a vista) - a comissao e liberada na hora,
      // sem esperar uma baixa que nunca vai existir.
      comissaoRepository.liberarSeQuitada(db, vendaId)

      db.exec('COMMIT')
      return vendaId
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  },

  /**
   * RN-11: cancela a venda estornando estoque, financeiro e comissao numa
   * unica transacao. Servico nunca teve baixa de estoque (RF-07/08), entao
   * nunca entra no estorno. O financeiro e estornado com um lancamento de
   * DESPESA compensatorio (nunca edita nem apaga o lancamento original -
   * mesma logica de "so soma" do estoque_movimento) somando o que foi
   * recebido a vista na criacao com o que ja tinha sido recebido em
   * parcelas pagas antes do cancelamento.
   */
  cancelar(vendaId: number, ctx: { usuarioId: number }): void {
    const db = getDb()
    db.exec('BEGIN IMMEDIATE')
    try {
      const venda = db.prepare('SELECT numero FROM venda WHERE id = :id').get({ id: vendaId }) as
        | { numero: string }
        | undefined
      if (!venda) throw new Error(`Venda #${vendaId} não encontrada.`)

      const itens = db
        .prepare(
          `SELECT vi.produto_id, vi.quantidade, p.categoria
           FROM venda_item vi
           LEFT JOIN produto p ON p.id = vi.produto_id
           WHERE vi.venda_id = :vendaId`
        )
        .all({ vendaId }) as { produto_id: number | null; quantidade: number; categoria: string | null }[]

      for (const item of itens) {
        if (item.produto_id && item.categoria !== 'servico') {
          registrarMovimento(db, {
            produtoId: item.produto_id,
            tipo: 'estorno_venda',
            quantidade: item.quantidade,
            documentoTipo: 'venda',
            documentoId: vendaId,
            usuarioId: ctx.usuarioId
          })
        }
      }

      const recebidoAvista = db
        .prepare("SELECT COALESCE(SUM(valor_centavos), 0) AS soma FROM lancamento WHERE origem_tipo = 'venda' AND origem_id = :vendaId")
        .get({ vendaId }) as { soma: number }
      const recebidoEmParcelas = contaReceberRepository.estornarPorVenda(db, vendaId)
      const totalEstorno = recebidoAvista.soma + recebidoEmParcelas

      if (totalEstorno > 0) {
        db.prepare(
          `INSERT INTO lancamento (tipo, categoria, descricao, valor_centavos, data, origem_tipo, origem_id, usuario_id)
           VALUES ('DESPESA', 'ESTORNO_VENDA', :descricao, :valor, :data, 'venda', :vendaId, :usuarioId)`
        ).run({
          descricao: `Estorno da venda ${venda.numero}`,
          valor: totalEstorno,
          data: hoje(),
          vendaId,
          usuarioId: ctx.usuarioId
        })
      }

      comissaoRepository.cancelar(db, vendaId)

      db.prepare("UPDATE venda SET situacao = 'CANCELADA' WHERE id = :vendaId").run({ vendaId })

      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  },

  listar(query: { busca?: string; dataInicio?: string | null; dataFim?: string | null }): VendaResumo[] {
    const rows = getDb()
      .prepare(
        `${SELECT_RESUMO}
         WHERE (c.nome LIKE :termo OR v.numero LIKE :termo)
           AND (:dataInicio = '' OR v.data >= :dataInicio)
           AND (:dataFim = '' OR v.data <= :dataFim)
         ORDER BY v.data DESC, v.id DESC
         LIMIT 300`
      )
      .all({
        termo: `%${query.busca?.trim() ?? ''}%`,
        dataInicio: query.dataInicio?.trim() || '',
        dataFim: query.dataFim?.trim() || ''
      }) as unknown as ResumoRow[]
    return rows.map(toResumo)
  },

  listarPorCliente(clienteId: number): VendaResumo[] {
    const rows = getDb()
      .prepare(`${SELECT_RESUMO} WHERE v.cliente_id = :clienteId ORDER BY v.id DESC`)
      .all({ clienteId }) as unknown as ResumoRow[]
    return rows.map(toResumo)
  },

  listarPorVendedor(vendedorId: number): VendaResumo[] {
    const rows = getDb()
      .prepare(`${SELECT_RESUMO} WHERE v.vendedor_id = :vendedorId ORDER BY v.id DESC LIMIT 300`)
      .all({ vendedorId }) as unknown as ResumoRow[]
    return rows.map(toResumo)
  },

  buscarPorId(id: number): VendaDetalhada | null {
    const db = getDb()
    const header = db
      .prepare(
        `SELECT v.id, v.numero, v.cliente_id, c.nome AS cliente_nome,
                v.vendedor_id, u.nome AS vendedor_nome,
                v.data, v.total_centavos, v.situacao,
                v.subtotal_centavos, v.desconto_centavos, v.receita_optica_id,
                au.nome AS autorizado_por_nome
         FROM venda v
         INNER JOIN cliente c ON c.id = v.cliente_id
         INNER JOIN usuario u ON u.id = v.vendedor_id
         LEFT JOIN usuario au ON au.id = v.autorizado_por_id
         WHERE v.id = :id`
      )
      .get({ id }) as
      | (ResumoRow & {
          subtotal_centavos: number
          desconto_centavos: number
          receita_optica_id: number | null
          autorizado_por_nome: string | null
        })
      | undefined

    if (!header) return null

    const itensRows = db
      .prepare(
        `SELECT id, produto_id, descricao, quantidade, preco_unitario_centavos, desconto_centavos, total_centavos
         FROM venda_item WHERE venda_id = :id ORDER BY id`
      )
      .all({ id }) as unknown as {
      id: number
      produto_id: number | null
      descricao: string
      quantidade: number
      preco_unitario_centavos: number
      desconto_centavos: number
      total_centavos: number
    }[]

    const pagamentosRows = db
      .prepare(`SELECT id, forma_pagamento, valor_centavos, parcelas FROM venda_pagamento WHERE venda_id = :id ORDER BY id`)
      .all({ id }) as unknown as { id: number; forma_pagamento: string; valor_centavos: number; parcelas: number }[]

    const itens: VendaItemDetalhe[] = itensRows.map((r) => ({
      id: r.id,
      produtoId: r.produto_id,
      descricao: r.descricao,
      quantidade: r.quantidade,
      precoUnitarioCentavos: r.preco_unitario_centavos,
      descontoCentavos: r.desconto_centavos,
      totalCentavos: r.total_centavos
    }))

    const pagamentos: VendaPagamentoDetalhe[] = pagamentosRows.map((r) => ({
      id: r.id,
      formaPagamento: r.forma_pagamento,
      valorCentavos: r.valor_centavos,
      parcelas: r.parcelas
    }))

    return {
      ...toResumo(header),
      subtotalCentavos: header.subtotal_centavos,
      descontoCentavos: header.desconto_centavos,
      receitaOpticaId: header.receita_optica_id,
      autorizadoPorNome: header.autorizado_por_nome,
      itens,
      pagamentos,
      parcelas: contaReceberRepository.listarPorVenda(id),
      comissao: comissaoRepository.buscarPorVenda(id)
    }
  }
}
