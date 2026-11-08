import type { TabelaSync } from './tabelasSincronizaveis'

/**
 * Gera o SQL da migração 010 (base de sincronização) a partir da lista de
 * tabelas e das colunas que cada uma já tem. O arquivo `010_sync_base.sql` é
 * esta saída gravada: o script `scripts/gerar-sync-sql.mjs` o recria, e um
 * teste confere que o arquivo não ficou desatualizado. Não edite o .sql à mão.
 *
 * O que cada tabela ganha:
 *  - `uuid`: identidade global do registro (a chave inteira local continua);
 *  - `sync_rev`: número da última alteração, crescente em TODAS as tabelas
 *    (vem de `sync_contador`), para o worker pedir "tudo o que mudou depois de N";
 *  - `atualizado_em`, onde ainda não existe;
 *  - gatilhos que cuidam de tudo isso em qualquer caminho de gravação, sem
 *    mexer nos repositórios, e que registram exclusões em `sync_exclusao`.
 */

/** UUID versão 4 em SQL puro (o SQLite não tem função de uuid). Avaliado uma vez por linha. */
const UUID_SQL =
  "lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || " +
  "substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))"

const PROXIMA_REVISAO = '(SELECT valor FROM sync_contador WHERE id = 1)'

function tabelaSql(t: TabelaSync, colunas: string[]): string {
  const n = t.nome
  const temAtualizadoEm = colunas.includes('atualizado_em')
  return `-- ---------------------------------------------------------------- ${n}
ALTER TABLE ${n} ADD COLUMN uuid TEXT;
ALTER TABLE ${n} ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;${temAtualizadoEm ? '' : `\nALTER TABLE ${n} ADD COLUMN atualizado_em TEXT;`}
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE ${n} SET uuid = ${UUID_SQL}, sync_rev = 1;
CREATE UNIQUE INDEX idx_${n}_uuid ON ${n}(uuid);
CREATE INDEX idx_${n}_sync_rev ON ${n}(sync_rev);

CREATE TRIGGER trg_${n}_sync_ai AFTER INSERT ON ${n}
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE ${n} SET uuid = COALESCE(uuid, ${UUID_SQL}), sync_rev = ${PROXIMA_REVISAO}, atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_${n}_sync_au AFTER UPDATE ON ${n} WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE ${n} SET sync_rev = ${PROXIMA_REVISAO}, atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_${n}_sync_ad AFTER DELETE ON ${n} WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('${n}', OLD.uuid, ${PROXIMA_REVISAO}, datetime('now'));
END;
`
}

export function gerarSyncSql(tabelas: TabelaSync[], colunasDe: (tabela: string) => string[]): string {
  const cabecalho = `-- GERADO por scripts/gerar-sync-sql.mjs a partir de src/main/sync/tabelasSincronizaveis.ts.
-- NAO EDITE A MAO: rode "node scripts/gerar-sync-sql.mjs" e confira com "npm test".
--
-- Base da sincronizacao com a nuvem (docs/Arquitetura-Sincronizacao.md). Nada sai do
-- computador por causa desta migracao: ela so prepara o banco - identidade (uuid), numero
-- da ultima alteracao (sync_rev) e registro de exclusoes. As linhas existentes nao mudam
-- de conteudo; so ganham as colunas novas.

-- Contador unico de revisoes, compartilhado por todas as tabelas.
CREATE TABLE sync_contador (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  valor INTEGER NOT NULL
);
INSERT INTO sync_contador (id, valor) VALUES (1, 1);

-- Exclusoes ainda nao enviadas: o registro apagado some da tabela, entao o gatilho guarda o uuid aqui.
CREATE TABLE sync_exclusao (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tabela      TEXT NOT NULL,
  uuid        TEXT NOT NULL,
  sync_rev    INTEGER NOT NULL,
  excluido_em TEXT NOT NULL
);
CREATE INDEX idx_sync_exclusao_rev ON sync_exclusao(sync_rev);
`
  const corpo = tabelas.map((t) => tabelaSql(t, colunasDe(t.nome))).join('\n')
  const rodape = `
-- Identidade deste computador na nuvem (nunca sincroniza: ver CHAVES_CONFIGURACAO_LOCAIS).
INSERT OR IGNORE INTO configuracao (chave, valor, tipo) VALUES ('sync_dispositivo_id', ${UUID_SQL}, 'texto');
`
  return `${cabecalho}\n${corpo}${rodape}`
}
