import type { DatabaseSync } from 'node:sqlite'
import { getDb } from '@main/db/connection'
import { termoBusca } from '@shared/texto'
import { registrarMovimento } from './estoqueRepository'
import { comissaoRepository } from './comissaoRepository'
import { contaReceberRepository } from './contaReceberRepository'
import type { VendaCreateInput } from '@shared/ipc'
import type {
  BloqueioExclusaoVenda,
  VendaDetalhada,
  VendaItemDetalhe,
  VendaPagamentoDetalhe,
  VendaResumo
} from '@shared/types'
import type {
  ComportamentoFinanceiro,
  DescontoAdicional,
  FormaPagamentoConfig,
  PagamentoCalculado,
  TipoAcrescimo,
  TipoDesconto,
  TipoFormaPagamento
} from '@shared/vendaCalculo'
import { brl } from '@shared/vendaCalculo'
import { hojeLocal } from '@shared/data'

function hoje(): string {
  return hojeLocal()
}

function dataBr(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

interface ProdutoParaVenda {
  id: number
  descricao: string
  categoria: string
  custo_centavos: number
}

function buscarProdutoAtivo(db: ReturnType<typeof getDb>, id: number): ProdutoParaVenda | null {
  const row = db
    .prepare('SELECT id, descricao, categoria, custo_centavos FROM produto WHERE id = :id AND ativo = 1')
    .get({ id }) as ProdutoParaVenda | undefined
  return row ?? null
}

// A venda EXCLUIDA nunca aparece em lista nenhuma (`excluido_em IS NULL` em toda consulta de venda). Alem disso ela
// fica com situacao CANCELADA, e e isso que faz o painel, os relatorios, a comissao e o Relacionamento (que ja
// ignoram CANCELADA) tambem ignora-la.
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

/** Uma linha de pagamento ja resolvida e calculada pelo servico: o repositorio so grava (snapshot). */
export interface PagamentoResolvido {
  forma: Pick<FormaPagamentoConfig, 'id' | 'nome' | 'tipo'>
  calculado: PagamentoCalculado
}

export interface ContextoCriarVenda {
  vendedorId: number
  autorizadoPorId: number | null
  /** Data da venda (a mesma usada nos vencimentos calculados). */
  dataVenda: string
  subtotalCentavos: number
  /** Itens + adicional. */
  descontoCentavos: number
  descontoAdicional: DescontoAdicional
  descontoAdicionalCentavos: number
  totalCentavos: number
  comissaoPercentual: number
  /** Um por linha de `input.pagamentos`, na mesma ordem. */
  pagamentos: PagamentoResolvido[]
}

/**
 * RN-11: desfaz o que a venda fez - estoque, financeiro e comissao - DENTRO da transacao de quem chama
 * (cancelar ou excluir). Servico nunca teve baixa de estoque (RF-07/08), entao nunca entra no estorno. O
 * financeiro e estornado com um lancamento de DESPESA compensatorio (nunca edita nem apaga o lancamento
 * original - mesma logica de "so soma" do estoque_movimento) somando o que foi recebido a vista na criacao
 * com o que ja tinha sido recebido em parcelas (do cliente ou da operadora) antes.
 */
function reverterVenda(db: DatabaseSync, vendaId: number, usuarioId: number): void {
  const venda = db.prepare('SELECT numero FROM venda WHERE id = :id').get({ id: vendaId }) as { numero: string } | undefined
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
        usuarioId
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
      usuarioId
    })
  }

  comissaoRepository.cancelar(db, vendaId)
  db.prepare("UPDATE venda SET situacao = 'CANCELADA' WHERE id = :vendaId").run({ vendaId })
}

interface PagamentoRow {
  id: number
  forma_pagamento: string
  valor_centavos: number
  parcelas: number
  forma_pagamento_id: number | null
  forma_tipo: TipoFormaPagamento | null
  comportamento: ComportamentoFinanceiro | null
  bandeira_nome: string | null
  taxa_bp: number | null
  desconto_cliente_bp: number
  desconto_cliente_centavos: number
  bruto_centavos: number | null
  liquido_centavos: number | null
  data_prevista: string | null
  acrescimo_tipo: TipoAcrescimo | null
  acrescimo_valor: number
  acrescimo_centavos: number
  intervalo_dias: number | null
}

export const vendaRepository = {
  buscarProdutoParaVenda: (id: number) => buscarProdutoAtivo(getDb(), id),

  /**
   * Grava a venda inteira - itens, baixa de estoque, pagamentos, recebiveis/parcelas (contas a receber)
   * e comissao - numa unica transacao (RN-05). Se qualquer insert falhar, o ROLLBACK desfaz tudo; nunca
   * fica uma venda "pela metade" (com item mas sem financeiro, por exemplo).
   *
   * Cada pagamento grava o SNAPSHOT do que foi calculado (taxa, acrescimo, liquido, parcelas): mudar o
   * cadastro depois nunca refaz o que ja foi vendido (RG-02). O que cada tipo de forma gera:
   *  - IMEDIATO: lancamento de receita na data da venda;
   *  - OPERADORA: UM recebivel da operadora (tipo OPERADORA) pelo liquido, na data prevista;
   *  - PARCELADO_CLIENTE: as parcelas do cliente (a receita entra na baixa de cada uma, RF-11.1).
   */
  criar(input: VendaCreateInput, ctx: ContextoCriarVenda): number {
    const db = getDb()
    db.exec('BEGIN IMMEDIATE')
    try {
      // O numero nunca e reaproveitado: a venda excluida continua na tabela, entao o maior numero ja usado a inclui.
      const ano = new Date().getFullYear()
      const prefixoAno = `${ano}-`
      const ultimo = db
        .prepare(`SELECT numero FROM venda WHERE numero LIKE :padrao ORDER BY numero DESC LIMIT 1`)
        .get({ padrao: `${prefixoAno}%` }) as { numero: string } | undefined
      const sequencial = ultimo ? Number(ultimo.numero.slice(prefixoAno.length)) + 1 : 1
      const numero = `${prefixoAno}${String(sequencial).padStart(5, '0')}`
      const dataVenda = ctx.dataVenda

      const infoVenda = db
        .prepare(
          `INSERT INTO venda (
             numero, cliente_id, vendedor_id, receita_optica_id, data,
             subtotal_centavos, desconto_centavos, total_centavos, situacao, autorizado_por_id,
             desconto_adicional_tipo, desconto_adicional_valor, desconto_adicional_centavos
           ) VALUES (
             :numero, :clienteId, :vendedorId, :receitaOpticaId, :data,
             :subtotal, :desconto, :total, 'CONCLUIDA', :autorizadoPorId,
             :descontoTipo, :descontoValor, :descontoAdicional
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
          autorizadoPorId: ctx.autorizadoPorId,
          descontoTipo: ctx.descontoAdicional.tipo,
          descontoValor: ctx.descontoAdicional.valor,
          descontoAdicional: ctx.descontoAdicionalCentavos
        })
      const vendaId = Number(infoVenda.lastInsertRowid)

      for (const item of input.itens) {
        const produto = buscarProdutoAtivo(db, item.produtoId)
        if (!produto) throw new Error(`Produto #${item.produtoId} não encontrado ou inativo.`)

        const totalItem = item.quantidade * item.precoUnitarioCentavos - item.descontoCentavos
        db.prepare(
          `INSERT INTO venda_item (
             venda_id, produto_id, descricao, quantidade,
             preco_unitario_centavos, desconto_centavos, total_centavos, custo_unitario_centavos
           ) VALUES (
             :vendaId, :produtoId, :descricao, :quantidade, :precoUnitario, :desconto, :total, :custo
           )`
        ).run({
          vendaId,
          produtoId: item.produtoId,
          descricao: produto.descricao,
          quantidade: item.quantidade,
          precoUnitario: item.precoUnitarioCentavos,
          desconto: item.descontoCentavos,
          total: totalItem,
          // Custo da epoca da venda. Custo zerado em produto com estoque e "nao cadastrado", nao "de graca":
          // fica nulo para o painel nao inflar a margem. Servico sem custo e custo zero de verdade.
          custo: produto.custo_centavos > 0 || produto.categoria === 'servico' ? produto.custo_centavos : null
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

      for (const { forma, calculado } of ctx.pagamentos) {
        const operadora = calculado.comportamento === 'OPERADORA' ? calculado : null
        const cliente = calculado.comportamento === 'PARCELADO_CLIENTE' ? calculado : null
        const infoPagamento = db
          .prepare(
            `INSERT INTO venda_pagamento (
               venda_id, forma_pagamento, valor_centavos, parcelas,
               forma_pagamento_id, forma_tipo, comportamento,
               bandeira_id, bandeira_nome, taxa_bp, desconto_cliente_bp, desconto_cliente_centavos,
               bruto_centavos, liquido_centavos, data_prevista,
               intervalo_dias, acrescimo_tipo, acrescimo_valor, acrescimo_centavos
             ) VALUES (
               :vendaId, :forma, :valor, :parcelas,
               :formaId, :formaTipo, :comportamento,
               :bandeiraId, :bandeiraNome, :taxaBp, :descontoClienteBp, :descontoClienteCentavos,
               :bruto, :liquido, :dataPrevista,
               :intervaloDias, :acrescimoTipo, :acrescimoValor, :acrescimoCentavos
             )`
          )
          .run({
            vendaId,
            forma: forma.nome,
            valor: calculado.valorCentavos,
            parcelas: calculado.parcelas,
            formaId: forma.id,
            formaTipo: forma.tipo,
            comportamento: calculado.comportamento,
            bandeiraId: operadora?.bandeiraId ?? null,
            bandeiraNome: operadora?.bandeiraNome ?? null,
            taxaBp: operadora?.taxaBp ?? null,
            descontoClienteBp: operadora?.descontoClienteBp ?? 0,
            descontoClienteCentavos: operadora?.descontoClienteCentavos ?? 0,
            bruto: operadora?.brutoCentavos ?? null,
            liquido: operadora?.liquidoCentavos ?? null,
            dataPrevista: operadora?.vencimento ?? null,
            intervaloDias: cliente?.intervaloDias ?? null,
            acrescimoTipo: cliente?.acrescimoTipo ?? null,
            acrescimoValor: cliente?.acrescimoValor ?? 0,
            acrescimoCentavos: cliente?.acrescimoCentavos ?? 0
          })
        const vendaPagamentoId = Number(infoPagamento.lastInsertRowid)

        if (calculado.comportamento === 'IMEDIATO') {
          // Pago agora - entra direto no financeiro (RN-05, resolve o D9 do sistema anterior: a venda nunca
          // mais fica sem lancamento).
          db.prepare(
            `INSERT INTO lancamento (tipo, categoria, descricao, valor_centavos, data, origem_tipo, origem_id, usuario_id)
             VALUES ('RECEITA', 'VENDA', :descricao, :valor, :data, 'venda', :vendaId, :usuarioId)`
          ).run({
            descricao: `Venda ${numero} - ${forma.nome}`,
            valor: calculado.recebidoCentavos,
            data: dataVenda,
            vendaId,
            usuarioId: ctx.vendedorId
          })
        } else if (calculado.comportamento === 'OPERADORA') {
          // Cartao: NAO e divida do cliente. Um unico recebivel da operadora, pelo liquido, na data prevista.
          db.prepare(
            `INSERT INTO conta_receber (
               venda_id, cliente_id, parcela, total_parcelas, valor_centavos, vencimento, situacao,
               tipo, venda_pagamento_id, bandeira_nome, operadora_parcelas, taxa_bp, bruto_centavos
             ) VALUES (
               :vendaId, :clienteId, 1, 1, :liquido, :vencimento, 'ABERTA',
               'OPERADORA', :vendaPagamentoId, :bandeiraNome, :operadoraParcelas, :taxaBp, :bruto
             )`
          ).run({
            vendaId,
            clienteId: input.clienteId,
            liquido: calculado.liquidoCentavos,
            vencimento: calculado.vencimento,
            vendaPagamentoId,
            bandeiraNome: calculado.bandeiraNome,
            operadoraParcelas: calculado.parcelas,
            taxaBp: calculado.taxaBp,
            bruto: calculado.brutoCentavos
          })
        } else {
          // Parcelado pelo cliente - vira contas a receber; o lancamento acontece na baixa de cada parcela (RF-11.1).
          calculado.valoresParcelas.forEach((valor, i) => {
            db.prepare(
              `INSERT INTO conta_receber (venda_id, cliente_id, parcela, total_parcelas, valor_centavos, vencimento, situacao, tipo, venda_pagamento_id)
               VALUES (:vendaId, :clienteId, :parcela, :totalParcelas, :valor, :vencimento, 'ABERTA', 'CLIENTE', :vendaPagamentoId)`
            ).run({
              vendaId,
              clienteId: input.clienteId,
              parcela: i + 1,
              totalParcelas: calculado.parcelas,
              valor,
              vencimento: calculado.vencimentos[i],
              vendaPagamentoId
            })
          })
        }
      }

      // RN-08: comissao provisionada sobre o total da venda (itens menos desconto). O acrescimo da promissoria e a
      // taxa do cartao ficam FORA da base: a comissao e sobre o que foi vendido, nao sobre juros nem custo financeiro.
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

      // RN-08: venda sem nenhuma parcela do cliente em aberto ja nasce quitada (caso classico: pagamento 100% a
      // vista ou no cartao) - a comissao e liberada na hora, sem esperar uma baixa que nunca vai existir.
      comissaoRepository.liberarSeQuitada(db, vendaId)

      db.exec('COMMIT')
      return vendaId
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  },

  /** RN-11: cancela a venda estornando estoque, financeiro e comissao numa unica transacao. */
  cancelar(vendaId: number, ctx: { usuarioId: number }): void {
    const db = getDb()
    db.exec('BEGIN IMMEDIATE')
    try {
      reverterVenda(db, vendaId, ctx.usuarioId)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  },

  /**
   * O que impede (sem a senha do Administrador) excluir a venda: dinheiro que ja entrou (parcela paga, recebivel
   * da operadora baixado, pagamento a vista) ou uma OS ligada a ela. Venda ja cancelada nao tem bloqueio: tudo
   * ja foi estornado. Cada item vem em uma frase pronta para a tela listar.
   */
  bloqueiosExclusao(vendaId: number): BloqueioExclusaoVenda[] {
    const db = getDb()
    const venda = db.prepare('SELECT situacao FROM venda WHERE id = :id').get({ id: vendaId }) as { situacao: string } | undefined
    if (!venda || venda.situacao === 'CANCELADA') return []

    const bloqueios: BloqueioExclusaoVenda[] = []

    const parcelas = db
      .prepare(
        `SELECT cr.tipo, cr.parcela, cr.total_parcelas, cr.valor_centavos, cr.vencimento, cr.bandeira_nome, cr.operadora_parcelas,
                COALESCE((SELECT SUM(r.valor_centavos) FROM recebimento r WHERE r.conta_receber_id = cr.id), 0) AS recebido
         FROM conta_receber cr
         WHERE cr.venda_id = :vendaId AND cr.situacao IN ('ABERTA', 'PAGA')
         ORDER BY cr.tipo, cr.parcela, cr.id`
      )
      .all({ vendaId }) as unknown as {
      tipo: 'CLIENTE' | 'OPERADORA'
      parcela: number
      total_parcelas: number
      valor_centavos: number
      vencimento: string
      bandeira_nome: string | null
      operadora_parcelas: number | null
      recebido: number
    }[]
    for (const p of parcelas) {
      if (p.recebido <= 0) continue
      if (p.tipo === 'OPERADORA') {
        bloqueios.push({
          tipo: 'RECEBIVEL_BAIXADO',
          descricao: `Recebível da operadora${p.bandeira_nome ? ` ${p.bandeira_nome}` : ''} em ${p.operadora_parcelas ?? 1}x (${brl(p.valor_centavos)}, previsto para ${dataBr(p.vencimento)}) já foi baixado: ${brl(p.recebido)} recebido.`
        })
      } else {
        bloqueios.push({
          tipo: 'PARCELA_PAGA',
          descricao: `Parcela ${p.parcela}/${p.total_parcelas} (${brl(p.valor_centavos)}, vencimento ${dataBr(p.vencimento)}) já recebeu ${brl(p.recebido)}.`
        })
      }
    }

    const aVista = db
      .prepare(
        `SELECT forma_pagamento, valor_centavos FROM venda_pagamento
         WHERE venda_id = :vendaId AND COALESCE(comportamento, CASE WHEN parcelas > 1 THEN 'PARCELADO_CLIENTE' ELSE 'IMEDIATO' END) = 'IMEDIATO'
         ORDER BY id`
      )
      .all({ vendaId }) as unknown as { forma_pagamento: string; valor_centavos: number }[]
    for (const p of aVista) {
      bloqueios.push({
        tipo: 'PAGAMENTO_A_VISTA',
        descricao: `Pagamento à vista em ${p.forma_pagamento} de ${brl(p.valor_centavos)} já entrou no caixa.`
      })
    }

    const ordens = db
      .prepare('SELECT numero, situacao FROM ordem_servico WHERE venda_id = :vendaId ORDER BY id')
      .all({ vendaId }) as unknown as { numero: string; situacao: string }[]
    for (const os of ordens) {
      bloqueios.push({ tipo: 'ORDEM_SERVICO', descricao: `A ordem de serviço ${os.numero} (${os.situacao}) está ligada a esta venda.` })
    }

    return bloqueios
  },

  /**
   * Exclusao logica da venda (9.6), tudo numa transacao: estorno do estoque, do financeiro e da comissao (o
   * mesmo do cancelamento), recebiveis e parcelas ainda em aberto cancelados, a OS (se houver) solta da venda e a
   * venda marcada como excluida. A linha continua na tabela (o numero nunca e reaproveitado) e fica com
   * situacao CANCELADA, para os filtros de "venda valida" de todo o sistema ignora-la.
   */
  excluir(vendaId: number, ctx: { usuarioId: number; motivo: string | null }): void {
    const db = getDb()
    db.exec('BEGIN IMMEDIATE')
    try {
      const venda = db.prepare('SELECT situacao FROM venda WHERE id = :id AND excluido_em IS NULL').get({ id: vendaId }) as
        | { situacao: string }
        | undefined
      if (!venda) throw new Error(`Venda #${vendaId} não encontrada.`)

      // Venda ja cancelada ja teve tudo estornado: nao estorna de novo.
      if (venda.situacao !== 'CANCELADA') reverterVenda(db, vendaId, ctx.usuarioId)

      db.prepare('UPDATE ordem_servico SET venda_id = NULL WHERE venda_id = :vendaId').run({ vendaId })
      db.prepare(
        `UPDATE venda SET situacao = 'CANCELADA', excluido_em = datetime('now'), excluido_motivo = :motivo, excluido_por = :usuarioId
         WHERE id = :vendaId`
      ).run({ vendaId, motivo: ctx.motivo, usuarioId: ctx.usuarioId })

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
         WHERE v.excluido_em IS NULL
           AND (sem_acento(c.nome) LIKE :termo OR sem_acento(v.numero) LIKE :termo)
           AND (:dataInicio = '' OR v.data >= :dataInicio)
           AND (:dataFim = '' OR v.data <= :dataFim)
         ORDER BY v.data DESC, v.id DESC
         LIMIT 300`
      )
      .all({
        termo: termoBusca(query.busca),
        dataInicio: query.dataInicio?.trim() || '',
        dataFim: query.dataFim?.trim() || ''
      }) as unknown as ResumoRow[]
    return rows.map(toResumo)
  },

  listarPorCliente(clienteId: number): VendaResumo[] {
    const rows = getDb()
      .prepare(`${SELECT_RESUMO} WHERE v.cliente_id = :clienteId AND v.excluido_em IS NULL ORDER BY v.id DESC`)
      .all({ clienteId }) as unknown as ResumoRow[]
    return rows.map(toResumo)
  },

  listarPorVendedor(vendedorId: number): VendaResumo[] {
    const rows = getDb()
      .prepare(`${SELECT_RESUMO} WHERE v.vendedor_id = :vendedorId AND v.excluido_em IS NULL ORDER BY v.id DESC LIMIT 300`)
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
                v.desconto_adicional_tipo, v.desconto_adicional_valor, v.desconto_adicional_centavos,
                au.nome AS autorizado_por_nome
         FROM venda v
         INNER JOIN cliente c ON c.id = v.cliente_id
         INNER JOIN usuario u ON u.id = v.vendedor_id
         LEFT JOIN usuario au ON au.id = v.autorizado_por_id
         WHERE v.id = :id AND v.excluido_em IS NULL`
      )
      .get({ id }) as
      | (ResumoRow & {
          subtotal_centavos: number
          desconto_centavos: number
          receita_optica_id: number | null
          desconto_adicional_tipo: TipoDesconto
          desconto_adicional_valor: number
          desconto_adicional_centavos: number
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
      .prepare(
        `SELECT id, forma_pagamento, valor_centavos, parcelas, forma_pagamento_id, forma_tipo, comportamento,
                bandeira_nome, taxa_bp, desconto_cliente_bp, desconto_cliente_centavos, bruto_centavos, liquido_centavos,
                data_prevista, acrescimo_tipo, acrescimo_valor, acrescimo_centavos, intervalo_dias
         FROM venda_pagamento WHERE venda_id = :id ORDER BY id`
      )
      .all({ id }) as unknown as PagamentoRow[]

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
      parcelas: r.parcelas,
      formaPagamentoId: r.forma_pagamento_id,
      formaTipo: r.forma_tipo,
      comportamento: r.comportamento,
      bandeiraNome: r.bandeira_nome,
      taxaBp: r.taxa_bp,
      descontoClienteBp: r.desconto_cliente_bp,
      descontoClienteCentavos: r.desconto_cliente_centavos,
      brutoCentavos: r.bruto_centavos,
      liquidoCentavos: r.liquido_centavos,
      dataPrevista: r.data_prevista,
      acrescimoTipo: r.acrescimo_tipo,
      acrescimoValor: r.acrescimo_valor,
      acrescimoCentavos: r.acrescimo_centavos,
      intervaloDias: r.intervalo_dias
    }))

    const acrescimoCentavos = pagamentos.reduce((s, p) => s + p.acrescimoCentavos, 0)
    const descontoClienteCentavos = pagamentos.reduce((s, p) => s + p.descontoClienteCentavos, 0)

    return {
      ...toResumo(header),
      subtotalCentavos: header.subtotal_centavos,
      descontoCentavos: header.desconto_centavos,
      descontoAdicionalTipo: header.desconto_adicional_tipo,
      descontoAdicionalValor: header.desconto_adicional_valor,
      descontoAdicionalCentavos: header.desconto_adicional_centavos,
      acrescimoCentavos,
      descontoClienteCentavos,
      totalClienteCentavos: header.total_centavos + acrescimoCentavos - descontoClienteCentavos,
      receitaOpticaId: header.receita_optica_id,
      autorizadoPorNome: header.autorizado_por_nome,
      itens,
      pagamentos,
      // O carne e a cobranca sao so do CLIENTE; o que a maquininha vai depositar vem separado.
      parcelas: contaReceberRepository.listarPorVenda(id, 'CLIENTE'),
      recebiveisOperadora: contaReceberRepository.listarPorVenda(id, 'OPERADORA'),
      comissao: comissaoRepository.buscarPorVenda(id)
    }
  }
}
