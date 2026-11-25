import type { TabelaSync } from './tabelasSincronizaveis'

/**
 * Gera o DDL Postgres (Supabase) do ESPELHO da loja na nuvem, a partir da mesma lista de tabelas da
 * sincronização (`tabelasSincronizaveis.ts`) e do schema atual do SQLite. Ver docs/Arquitetura-Sincronizacao.md.
 *
 * Regras do espelho:
 *  - uma tabela por item da lista, no schema `optialeph`, com a chave (loja_id, uuid): o `id` inteiro local não viaja;
 *  - chave estrangeira `x_id` vira `x_uuid` (o worker de envio traduz). SEM constraint de FK: os lotes chegam em
 *    pedidos separados e a ordem não é garantida, então a integridade é a do PC; só há índice para consulta;
 *  - tipos 1 para 1 (INTEGER -> bigint, REAL -> double precision, TEXT -> text), datas continuam texto;
 *  - colunas que nunca saem do computador (`colunasLocais`) não existem na nuvem;
 *  - RLS ligada: o celular só LÊ as lojas de que é membro; só o PC (token com loja_id e dispositivo_id) grava.
 */

export interface ColunaSqlite {
  name: string
  type: string
  notnull: number
}

export interface FkSqlite {
  from: string
  table: string
}

export interface InfoTabela {
  colunas: ColunaSqlite[]
  fks: FkSqlite[]
}

const TIPOS: Record<string, string> = { INTEGER: 'bigint', REAL: 'double precision', TEXT: 'text' }

const q = (nome: string): string => `"${nome}"`

/** Nome da coluna de chave estrangeira na nuvem: `cliente_id` -> `cliente_uuid`; `criado_por` -> `criado_por_uuid`. */
export function colunaUuid(coluna: string): string {
  return coluna.endsWith('_id') ? coluna.replace(/_id$/, '_uuid') : `${coluna}_uuid`
}

function tabelaSql(t: TabelaSync, info: InfoTabela, sincronizadas: Set<string>): string {
  const locais = new Set(t.colunasLocais ?? [])
  for (const f of info.fks) {
    // Uma FK para tabela que nao sincroniza viraria um numero local sem sentido na nuvem.
    if (!sincronizadas.has(f.table) && !locais.has(f.from)) {
      throw new Error(`${t.nome}.${f.from} referencia ${f.table}, que nao sincroniza: classifique a tabela ou marque a coluna como local.`)
    }
  }
  const fkPorColuna = new Map(info.fks.filter((f) => sincronizadas.has(f.table)).map((f) => [f.from, f.table]))

  const linhas: string[] = [
    '  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE',
    '  uuid        uuid   NOT NULL'
  ]
  for (const c of info.colunas) {
    if (c.name === 'id' || c.name === 'uuid' || locais.has(c.name)) continue
    if (c.name === 'sync_rev') {
      linhas.push('  sync_rev    bigint NOT NULL DEFAULT 0')
      continue
    }
    const nulo = c.notnull ? ' NOT NULL' : ''
    const ref = fkPorColuna.get(c.name)
    if (ref) {
      linhas.push(`  ${q(colunaUuid(c.name))} uuid${nulo}`)
      continue
    }
    const tipo = TIPOS[c.type.toUpperCase()]
    if (!tipo) throw new Error(`Tipo SQLite sem correspondência no espelho: ${t.nome}.${c.name} (${c.type})`)
    // Sem DEFAULT nem CHECK: o PC já validou, a nuvem só guarda. NOT NULL é mantido para detectar envio incompleto.
    linhas.push(`  ${q(c.name)} ${tipo}${nulo}`)
  }
  linhas.push('  recebido_em timestamptz NOT NULL DEFAULT now()')
  linhas.push('  PRIMARY KEY (loja_id, uuid)')

  const n = t.nome
  const indicesFk = [...fkPorColuna.keys()].map(
    (c) => `CREATE INDEX ${q(`idx_${n}_${colunaUuid(c)}`)} ON optialeph.${q(n)} (loja_id, ${q(colunaUuid(c))});`
  )

  return `-- ---------------------------------------------------------------- ${n}
CREATE TABLE optialeph.${q(n)} (
${linhas.join(',\n')}
);
CREATE INDEX ${q(`idx_${n}_sync_rev`)} ON optialeph.${q(n)} (loja_id, sync_rev);
${indicesFk.length ? indicesFk.join('\n') + '\n' : ''}
ALTER TABLE optialeph.${q(n)} ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY ${q(`${n}_leitura`)} ON optialeph.${q(n)} FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY ${q(`${n}_escrita_pc`)} ON optialeph.${q(n)} FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph.${q(n)} TO authenticated;
GRANT ALL ON optialeph.${q(n)} TO service_role;
`
}

export function gerarEspelhoSupabase(tabelas: TabelaSync[], infoDe: (tabela: string) => InfoTabela): string {
  const sincronizadas = new Set(tabelas.map((t) => t.nome))
  const cabecalho = `-- GERADO por scripts/gerar-espelho-supabase.mjs a partir de src/main/sync/tabelasSincronizaveis.ts.
-- NAO EDITE A MAO: rode "node scripts/gerar-espelho-supabase.mjs" e confira com "npm test".
--
-- Espelho da loja na nuvem (docs/Arquitetura-Sincronizacao.md). Depende de 0001_controle.sql
-- (schema optialeph, tabela loja e funcao lojas_do_usuario). Sem chave estrangeira entre tabelas
-- do espelho: os lotes chegam fora de ordem e a integridade e a do SQLite do PC.
`
  return `${cabecalho}\n${tabelas.map((t) => tabelaSql(t, infoDe(t.nome), sincronizadas)).join('\n')}`
}
