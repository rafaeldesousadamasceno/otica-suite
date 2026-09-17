import type { DatabaseSync } from 'node:sqlite'
import { getDb } from '@main/db/connection'
import type { CategoriaProduto, EstoqueItem } from '@shared/types'
import type { EstoqueListQuery } from '@shared/ipc'

/**
 * Saldo = ultimo `saldo_apos` gravado para o produto (0 se nunca teve
 * movimentacao) - mais barato que somar todas as linhas a cada consulta.
 *
 * RF-08, CA2: por padrao a venda ainda pode deixar o saldo negativo (a
 * config `estoque_bloqueia_venda_sem_saldo` comeca desligada - ver
 * migration 004) - so passa a exigir autorizacao de Admin quando a otica
 * liga essa opcao em Configuracoes, depois que ja tem entrada de mercadoria
 * (compraRepository.confirmarEntrada) para manter saldo positivo de verdade.
 */
export function saldoAtual(db: DatabaseSync, produtoId: number): number {
  const row = db
    .prepare(
      `SELECT saldo_apos FROM estoque_movimento
       WHERE produto_id = :produtoId
       ORDER BY id DESC LIMIT 1`
    )
    .get({ produtoId }) as { saldo_apos: number } | undefined
  return row?.saldo_apos ?? 0
}

/** Registra uma movimentacao e devolve o novo saldo. Chame dentro de uma transacao. */
export function registrarMovimento(
  db: DatabaseSync,
  params: {
    produtoId: number
    tipo: string
    quantidade: number // sinalizado: negativo = saida, positivo = entrada
    documentoTipo: string
    documentoId: number
    motivo?: string | null
    usuarioId: number
  }
): number {
  const novoSaldo = saldoAtual(db, params.produtoId) + params.quantidade

  db.prepare(
    `INSERT INTO estoque_movimento (
       produto_id, tipo, quantidade, saldo_apos, documento_tipo, documento_id, motivo, usuario_id
     ) VALUES (
       :produtoId, :tipo, :quantidade, :saldoApos, :documentoTipo, :documentoId, :motivo, :usuarioId
     )`
  ).run({
    produtoId: params.produtoId,
    tipo: params.tipo,
    quantidade: params.quantidade,
    saldoApos: novoSaldo,
    documentoTipo: params.documentoTipo,
    documentoId: params.documentoId,
    motivo: params.motivo ?? null,
    usuarioId: params.usuarioId
  })

  return novoSaldo
}

/** Variante sem transacao externa, para quem so precisa ler (ex.: vendaService checando saldo antes de vender). */
export function saldoAtualProduto(produtoId: number): number {
  return saldoAtual(getDb(), produtoId)
}

interface EstoqueRow {
  id: number
  descricao: string
  categoria: CategoriaProduto
  marca: string | null
  unidade: string
  estoque_minimo: number
  ativo: number
  saldo: number
}

/**
 * RF-08: consulta de saldo com filtro por categoria, marca (via `busca`) e
 * situacao. Servico nunca aparece aqui - nao tem estoque para controlar
 * (RF-07/08). A situacao (abaixo do minimo / zerado) e filtrada em JS
 * porque depende do saldo calculado, nao de uma coluna - dataset de uma
 * otica nao justifica complicar o SQL por isso.
 */
export function listarComSaldo(query: EstoqueListQuery): EstoqueItem[] {
  const rows = getDb()
    .prepare(
      `SELECT p.id, p.descricao, p.categoria, p.marca, p.unidade, p.estoque_minimo, p.ativo,
              COALESCE(
                (SELECT em.saldo_apos FROM estoque_movimento em WHERE em.produto_id = p.id ORDER BY em.id DESC LIMIT 1),
                0
              ) AS saldo
       FROM produto p
       WHERE p.categoria != 'servico'
         AND p.ativo = 1
         AND (p.descricao LIKE :termo OR p.codigo LIKE :termo OR p.marca LIKE :termo)
         AND (:categoria = '' OR p.categoria = :categoria)
       ORDER BY p.descricao
       LIMIT 500`
    )
    .all({
      termo: `%${query.busca?.trim() ?? ''}%`,
      categoria: query.categoria ?? ''
    }) as unknown as EstoqueRow[]

  const itens: EstoqueItem[] = rows.map((r) => ({
    produtoId: r.id,
    descricao: r.descricao,
    categoria: r.categoria,
    marca: r.marca,
    unidade: r.unidade,
    saldo: r.saldo,
    estoqueMinimo: r.estoque_minimo,
    ativo: r.ativo === 1
  }))

  if (query.situacao === 'zerado') return itens.filter((i) => i.saldo <= 0)
  if (query.situacao === 'abaixo_minimo') return itens.filter((i) => i.estoqueMinimo > 0 && i.saldo < i.estoqueMinimo)
  return itens
}

/**
 * RF-08: inventario - contagem fisica comparada ao saldo do sistema, com
 * geracao do ajuste. Sem tabela de "sessao de inventario" no schema (PRD
 * secao 10.2 so modela `estoque_movimento`): um ajuste e so mais uma
 * movimentacao, com o delta contado a mao, rastreavel por usuario e motivo.
 */
export function ajustar(produtoId: number, saldoContado: number, motivo: string, usuarioId: number): number {
  const db = getDb()
  db.exec('BEGIN IMMEDIATE')
  try {
    const atual = saldoAtual(db, produtoId)
    const delta = saldoContado - atual
    if (delta !== 0) {
      registrarMovimento(db, {
        produtoId,
        tipo: 'ajuste_inventario',
        quantidade: delta,
        documentoTipo: 'ajuste',
        documentoId: produtoId,
        motivo,
        usuarioId
      })
    }
    db.exec('COMMIT')
    return saldoContado
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
