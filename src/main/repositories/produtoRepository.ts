import { getDb } from '@main/db/connection'
import type { CategoriaProduto, Produto } from '@shared/types'
import type { ProdutoInput, ProdutosListQuery } from '@shared/ipc'

interface ProdutoRow {
  id: number
  codigo: string | null
  codigo_barras: string | null
  descricao: string
  categoria: CategoriaProduto
  marca: string | null
  modelo: string | null
  cor: string | null
  tamanho: string | null
  unidade: string
  custo_centavos: number
  margem: number
  preco_venda_centavos: number
  estoque_minimo: number
  foto_path: string | null
  ativo: number
  lente_material: string | null
  lente_indice: number | null
  lente_tipo: string | null
  lente_grau_min: number | null
  lente_grau_max: number | null
}

function toDomain(row: ProdutoRow): Produto {
  return {
    id: row.id,
    codigo: row.codigo,
    codigoBarras: row.codigo_barras,
    descricao: row.descricao,
    categoria: row.categoria,
    marca: row.marca,
    modelo: row.modelo,
    cor: row.cor,
    tamanho: row.tamanho,
    unidade: row.unidade,
    custoCentavos: row.custo_centavos,
    margem: row.margem,
    precoVendaCentavos: row.preco_venda_centavos,
    estoqueMinimo: row.estoque_minimo,
    fotoPath: row.foto_path,
    ativo: row.ativo === 1,
    lenteMaterial: row.lente_material,
    lenteIndice: row.lente_indice,
    lenteTipo: row.lente_tipo,
    lenteGrauMin: row.lente_grau_min,
    lenteGrauMax: row.lente_grau_max
  }
}

const SELECT_BASE = `
  SELECT
    p.id, p.codigo, p.codigo_barras, p.descricao, p.categoria, p.marca,
    p.modelo, p.cor, p.tamanho, p.unidade, p.custo_centavos, p.margem,
    p.preco_venda_centavos, p.estoque_minimo, p.foto_path, p.ativo,
    pl.material AS lente_material, pl.indice AS lente_indice,
    pl.tipo AS lente_tipo, pl.grau_min AS lente_grau_min, pl.grau_max AS lente_grau_max
  FROM produto p
  LEFT JOIN produto_lente pl ON pl.produto_id = p.id
`

function normalizar(v: string | null | undefined): string | null {
  const t = v?.trim()
  return t ? t : null
}

export const produtoRepository = {
  listar(query: ProdutosListQuery): Produto[] {
    const rows = getDb()
      .prepare(
        `${SELECT_BASE}
         WHERE (:apenasAtivos = 0 OR p.ativo = 1)
           AND (:categoria = '' OR p.categoria = :categoria)
           AND (p.descricao LIKE :termo OR p.codigo LIKE :termo OR p.codigo_barras LIKE :termo)
         ORDER BY p.descricao
         LIMIT 300`
      )
      .all({
        termo: `%${query.busca?.trim() ?? ''}%`,
        categoria: query.categoria ?? '',
        apenasAtivos: query.apenasAtivos === false ? 0 : 1
      }) as unknown as ProdutoRow[]
    return rows.map(toDomain)
  },

  buscarPorId(id: number): Produto | null {
    const row = getDb().prepare(`${SELECT_BASE} WHERE p.id = :id`).get({ id }) as unknown as
      | ProdutoRow
      | undefined
    return row ? toDomain(row) : null
  },

  codigoBarrasEmUsoPorOutro(codigoBarras: string, ignorarId?: number): boolean {
    const row = getDb()
      .prepare('SELECT id FROM produto WHERE codigo_barras = :codigoBarras AND id != :ignorarId')
      .get({ codigoBarras, ignorarId: ignorarId ?? -1 })
    return row !== undefined
  },

  criar(data: ProdutoInput): number {
    const db = getDb()
    db.exec('BEGIN IMMEDIATE')
    try {
      const info = db
        .prepare(
          `INSERT INTO produto (
             codigo, codigo_barras, descricao, categoria, marca, modelo, cor, tamanho,
             unidade, custo_centavos, margem, preco_venda_centavos, estoque_minimo
           ) VALUES (
             :codigo, :codigoBarras, :descricao, :categoria, :marca, :modelo, :cor, :tamanho,
             :unidade, :custoCentavos, :margem, :precoVendaCentavos, :estoqueMinimo
           )`
        )
        .run({
          codigo: normalizar(data.codigo),
          codigoBarras: normalizar(data.codigoBarras),
          descricao: data.descricao.trim().toUpperCase(),
          categoria: data.categoria,
          marca: normalizar(data.marca)?.toUpperCase() ?? null,
          modelo: normalizar(data.modelo)?.toUpperCase() ?? null,
          cor: normalizar(data.cor)?.toUpperCase() ?? null,
          tamanho: normalizar(data.tamanho),
          unidade: data.unidade,
          custoCentavos: data.custoCentavos,
          margem: data.margem,
          precoVendaCentavos: data.precoVendaCentavos,
          estoqueMinimo: data.estoqueMinimo
        })
      const id = Number(info.lastInsertRowid)

      if (data.categoria === 'lente') {
        db.prepare(
          `INSERT INTO produto_lente (produto_id, material, indice, tipo, grau_min, grau_max)
           VALUES (:id, :material, :indice, :tipo, :grauMin, :grauMax)`
        ).run({
          id,
          material: normalizar(data.lenteMaterial),
          indice: data.lenteIndice ?? null,
          tipo: normalizar(data.lenteTipo),
          grauMin: data.lenteGrauMin ?? null,
          grauMax: data.lenteGrauMax ?? null
        })
      }

      db.exec('COMMIT')
      return id
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  },

  atualizar(id: number, data: ProdutoInput): void {
    const db = getDb()
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(
        `UPDATE produto SET
           codigo = :codigo, codigo_barras = :codigoBarras, descricao = :descricao,
           categoria = :categoria, marca = :marca, modelo = :modelo, cor = :cor,
           tamanho = :tamanho, unidade = :unidade, custo_centavos = :custoCentavos,
           margem = :margem, preco_venda_centavos = :precoVendaCentavos,
           estoque_minimo = :estoqueMinimo
         WHERE id = :id`
      ).run({
        id,
        codigo: normalizar(data.codigo),
        codigoBarras: normalizar(data.codigoBarras),
        descricao: data.descricao.trim().toUpperCase(),
        categoria: data.categoria,
        marca: normalizar(data.marca)?.toUpperCase() ?? null,
        modelo: normalizar(data.modelo)?.toUpperCase() ?? null,
        cor: normalizar(data.cor)?.toUpperCase() ?? null,
        tamanho: normalizar(data.tamanho),
        unidade: data.unidade,
        custoCentavos: data.custoCentavos,
        margem: data.margem,
        precoVendaCentavos: data.precoVendaCentavos,
        estoqueMinimo: data.estoqueMinimo
      })

      db.prepare('DELETE FROM produto_lente WHERE produto_id = :id').run({ id })
      if (data.categoria === 'lente') {
        db.prepare(
          `INSERT INTO produto_lente (produto_id, material, indice, tipo, grau_min, grau_max)
           VALUES (:id, :material, :indice, :tipo, :grauMin, :grauMax)`
        ).run({
          id,
          material: normalizar(data.lenteMaterial),
          indice: data.lenteIndice ?? null,
          tipo: normalizar(data.lenteTipo),
          grauMin: data.lenteGrauMin ?? null,
          grauMax: data.lenteGrauMax ?? null
        })
      }

      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  },

  setAtivo(id: number, ativo: boolean): void {
    getDb().prepare('UPDATE produto SET ativo = :ativo WHERE id = :id').run({ id, ativo: ativo ? 1 : 0 })
  },

  /** Reservado para quando a fase F4 (estoque/compras) precisar decidir
   * se um produto pode ser excluido de fato ou so inativado. */
  possuiMovimentacao(id: number): boolean {
    const db = getDb()
    const emVenda = db.prepare('SELECT 1 FROM venda_item WHERE produto_id = :id').get({ id })
    const emEstoque = db.prepare('SELECT 1 FROM estoque_movimento WHERE produto_id = :id').get({ id })
    return emVenda !== undefined || emEstoque !== undefined
  }
}
