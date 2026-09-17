-- RF-02/F7: bookkeeping da migracao de dados do sistema anterior (MD Óculos).
-- Guarda o mapeamento origem->destino de cada registro ja importado, para a
-- importacao ser idempotente (CA1: rodar duas vezes nao duplica) - antes de
-- inserir qualquer coisa, o servico confere se aquele registro de origem ja
-- tem uma linha aqui.
CREATE TABLE migracao_registro (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  origem_sistema  TEXT NOT NULL,
  origem_tabela   TEXT NOT NULL,
  origem_id       INTEGER NOT NULL,
  destino_tabela  TEXT NOT NULL,
  destino_id      INTEGER NOT NULL,
  criado_em       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (origem_sistema, origem_tabela, origem_id)
);
