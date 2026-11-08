-- Pendencias da importacao do sistema anterior (MD Oculos): tudo o que a
-- importacao encontrou de errado, incoerente ou que mexeu (CPF repetido
-- ou invalido, cliente mesclado, exame sem cliente, datas suspeitas...).
-- Antes disso as falhas so apareciam na tela e se perdiam ao sair dela.
--
-- Uma linha por (tipo, origem): reimportar atualiza a linha em vez de duplicar.
-- `dados_json` guarda o necessario para o administrador agir (ex.: campo de data,
-- valor atual e valor sugerido).
CREATE TABLE migracao_pendencia (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo           TEXT NOT NULL,
  gravidade      TEXT NOT NULL CHECK (gravidade IN ('info', 'atencao', 'erro')),
  origem_tabela  TEXT NOT NULL,
  origem_id      INTEGER NOT NULL,
  destino_tabela TEXT,
  destino_id     INTEGER,
  motivo         TEXT NOT NULL,
  sugestao       TEXT,
  dados_json     TEXT,
  status         TEXT NOT NULL DEFAULT 'ABERTA' CHECK (status IN ('ABERTA', 'RESOLVIDA', 'IGNORADA')),
  criado_em      TEXT NOT NULL DEFAULT (datetime('now')),
  resolvido_em   TEXT,
  resolvido_por  INTEGER REFERENCES usuario(id),
  UNIQUE (tipo, origem_tabela, origem_id)
);

CREATE INDEX idx_migracao_pendencia_status ON migracao_pendencia (status, tipo);
