-- GERADO por scripts/gerar-sync-sql.mjs a partir de src/main/sync/tabelasSincronizaveis.ts.
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

-- ---------------------------------------------------------------- empresa
ALTER TABLE empresa ADD COLUMN uuid TEXT;
ALTER TABLE empresa ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE empresa ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE empresa SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_empresa_uuid ON empresa(uuid);
CREATE INDEX idx_empresa_sync_rev ON empresa(sync_rev);

CREATE TRIGGER trg_empresa_sync_ai AFTER INSERT ON empresa
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE empresa SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_empresa_sync_au AFTER UPDATE ON empresa WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE empresa SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_empresa_sync_ad AFTER DELETE ON empresa WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('empresa', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- configuracao
ALTER TABLE configuracao ADD COLUMN uuid TEXT;
ALTER TABLE configuracao ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE configuracao ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE configuracao SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_configuracao_uuid ON configuracao(uuid);
CREATE INDEX idx_configuracao_sync_rev ON configuracao(sync_rev);

CREATE TRIGGER trg_configuracao_sync_ai AFTER INSERT ON configuracao
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE configuracao SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_configuracao_sync_au AFTER UPDATE ON configuracao WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE configuracao SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_configuracao_sync_ad AFTER DELETE ON configuracao WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('configuracao', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- usuario
ALTER TABLE usuario ADD COLUMN uuid TEXT;
ALTER TABLE usuario ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE usuario SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_usuario_uuid ON usuario(uuid);
CREATE INDEX idx_usuario_sync_rev ON usuario(sync_rev);

CREATE TRIGGER trg_usuario_sync_ai AFTER INSERT ON usuario
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE usuario SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_usuario_sync_au AFTER UPDATE ON usuario WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE usuario SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_usuario_sync_ad AFTER DELETE ON usuario WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('usuario', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- lista_valor
ALTER TABLE lista_valor ADD COLUMN uuid TEXT;
ALTER TABLE lista_valor ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lista_valor ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE lista_valor SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_lista_valor_uuid ON lista_valor(uuid);
CREATE INDEX idx_lista_valor_sync_rev ON lista_valor(sync_rev);

CREATE TRIGGER trg_lista_valor_sync_ai AFTER INSERT ON lista_valor
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE lista_valor SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_lista_valor_sync_au AFTER UPDATE ON lista_valor WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE lista_valor SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_lista_valor_sync_ad AFTER DELETE ON lista_valor WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('lista_valor', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- profissional
ALTER TABLE profissional ADD COLUMN uuid TEXT;
ALTER TABLE profissional ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profissional ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE profissional SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_profissional_uuid ON profissional(uuid);
CREATE INDEX idx_profissional_sync_rev ON profissional(sync_rev);

CREATE TRIGGER trg_profissional_sync_ai AFTER INSERT ON profissional
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE profissional SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_profissional_sync_au AFTER UPDATE ON profissional WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE profissional SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_profissional_sync_ad AFTER DELETE ON profissional WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('profissional', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- cliente
ALTER TABLE cliente ADD COLUMN uuid TEXT;
ALTER TABLE cliente ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE cliente SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_cliente_uuid ON cliente(uuid);
CREATE INDEX idx_cliente_sync_rev ON cliente(sync_rev);

CREATE TRIGGER trg_cliente_sync_ai AFTER INSERT ON cliente
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE cliente SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_cliente_sync_au AFTER UPDATE ON cliente WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE cliente SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_cliente_sync_ad AFTER DELETE ON cliente WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('cliente', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- receita_optica
ALTER TABLE receita_optica ADD COLUMN uuid TEXT;
ALTER TABLE receita_optica ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE receita_optica ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE receita_optica SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_receita_optica_uuid ON receita_optica(uuid);
CREATE INDEX idx_receita_optica_sync_rev ON receita_optica(sync_rev);

CREATE TRIGGER trg_receita_optica_sync_ai AFTER INSERT ON receita_optica
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE receita_optica SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_receita_optica_sync_au AFTER UPDATE ON receita_optica WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE receita_optica SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_receita_optica_sync_ad AFTER DELETE ON receita_optica WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('receita_optica', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- contato
ALTER TABLE contato ADD COLUMN uuid TEXT;
ALTER TABLE contato ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contato ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE contato SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_contato_uuid ON contato(uuid);
CREATE INDEX idx_contato_sync_rev ON contato(sync_rev);

CREATE TRIGGER trg_contato_sync_ai AFTER INSERT ON contato
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE contato SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_contato_sync_au AFTER UPDATE ON contato WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE contato SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_contato_sync_ad AFTER DELETE ON contato WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('contato', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- produto
ALTER TABLE produto ADD COLUMN uuid TEXT;
ALTER TABLE produto ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE produto ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE produto SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_produto_uuid ON produto(uuid);
CREATE INDEX idx_produto_sync_rev ON produto(sync_rev);

CREATE TRIGGER trg_produto_sync_ai AFTER INSERT ON produto
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE produto SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_produto_sync_au AFTER UPDATE ON produto WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE produto SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_produto_sync_ad AFTER DELETE ON produto WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('produto', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- produto_lente
ALTER TABLE produto_lente ADD COLUMN uuid TEXT;
ALTER TABLE produto_lente ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE produto_lente ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE produto_lente SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_produto_lente_uuid ON produto_lente(uuid);
CREATE INDEX idx_produto_lente_sync_rev ON produto_lente(sync_rev);

CREATE TRIGGER trg_produto_lente_sync_ai AFTER INSERT ON produto_lente
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE produto_lente SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_produto_lente_sync_au AFTER UPDATE ON produto_lente WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE produto_lente SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_produto_lente_sync_ad AFTER DELETE ON produto_lente WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('produto_lente', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- fornecedor
ALTER TABLE fornecedor ADD COLUMN uuid TEXT;
ALTER TABLE fornecedor ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE fornecedor ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE fornecedor SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_fornecedor_uuid ON fornecedor(uuid);
CREATE INDEX idx_fornecedor_sync_rev ON fornecedor(sync_rev);

CREATE TRIGGER trg_fornecedor_sync_ai AFTER INSERT ON fornecedor
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE fornecedor SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_fornecedor_sync_au AFTER UPDATE ON fornecedor WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE fornecedor SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_fornecedor_sync_ad AFTER DELETE ON fornecedor WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('fornecedor', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- compra
ALTER TABLE compra ADD COLUMN uuid TEXT;
ALTER TABLE compra ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE compra ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE compra SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_compra_uuid ON compra(uuid);
CREATE INDEX idx_compra_sync_rev ON compra(sync_rev);

CREATE TRIGGER trg_compra_sync_ai AFTER INSERT ON compra
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE compra SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_compra_sync_au AFTER UPDATE ON compra WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE compra SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_compra_sync_ad AFTER DELETE ON compra WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('compra', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- compra_item
ALTER TABLE compra_item ADD COLUMN uuid TEXT;
ALTER TABLE compra_item ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE compra_item ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE compra_item SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_compra_item_uuid ON compra_item(uuid);
CREATE INDEX idx_compra_item_sync_rev ON compra_item(sync_rev);

CREATE TRIGGER trg_compra_item_sync_ai AFTER INSERT ON compra_item
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE compra_item SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_compra_item_sync_au AFTER UPDATE ON compra_item WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE compra_item SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_compra_item_sync_ad AFTER DELETE ON compra_item WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('compra_item', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- estoque_movimento
ALTER TABLE estoque_movimento ADD COLUMN uuid TEXT;
ALTER TABLE estoque_movimento ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE estoque_movimento ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE estoque_movimento SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_estoque_movimento_uuid ON estoque_movimento(uuid);
CREATE INDEX idx_estoque_movimento_sync_rev ON estoque_movimento(sync_rev);

CREATE TRIGGER trg_estoque_movimento_sync_ai AFTER INSERT ON estoque_movimento
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE estoque_movimento SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_estoque_movimento_sync_au AFTER UPDATE ON estoque_movimento WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE estoque_movimento SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_estoque_movimento_sync_ad AFTER DELETE ON estoque_movimento WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('estoque_movimento', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- venda
ALTER TABLE venda ADD COLUMN uuid TEXT;
ALTER TABLE venda ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE venda ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE venda SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_venda_uuid ON venda(uuid);
CREATE INDEX idx_venda_sync_rev ON venda(sync_rev);

CREATE TRIGGER trg_venda_sync_ai AFTER INSERT ON venda
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE venda SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_venda_sync_au AFTER UPDATE ON venda WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE venda SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_venda_sync_ad AFTER DELETE ON venda WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('venda', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- venda_item
ALTER TABLE venda_item ADD COLUMN uuid TEXT;
ALTER TABLE venda_item ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE venda_item ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE venda_item SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_venda_item_uuid ON venda_item(uuid);
CREATE INDEX idx_venda_item_sync_rev ON venda_item(sync_rev);

CREATE TRIGGER trg_venda_item_sync_ai AFTER INSERT ON venda_item
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE venda_item SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_venda_item_sync_au AFTER UPDATE ON venda_item WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE venda_item SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_venda_item_sync_ad AFTER DELETE ON venda_item WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('venda_item', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- venda_pagamento
ALTER TABLE venda_pagamento ADD COLUMN uuid TEXT;
ALTER TABLE venda_pagamento ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE venda_pagamento ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE venda_pagamento SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_venda_pagamento_uuid ON venda_pagamento(uuid);
CREATE INDEX idx_venda_pagamento_sync_rev ON venda_pagamento(sync_rev);

CREATE TRIGGER trg_venda_pagamento_sync_ai AFTER INSERT ON venda_pagamento
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE venda_pagamento SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_venda_pagamento_sync_au AFTER UPDATE ON venda_pagamento WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE venda_pagamento SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_venda_pagamento_sync_ad AFTER DELETE ON venda_pagamento WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('venda_pagamento', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- ordem_servico
ALTER TABLE ordem_servico ADD COLUMN uuid TEXT;
ALTER TABLE ordem_servico ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ordem_servico ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE ordem_servico SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_ordem_servico_uuid ON ordem_servico(uuid);
CREATE INDEX idx_ordem_servico_sync_rev ON ordem_servico(sync_rev);

CREATE TRIGGER trg_ordem_servico_sync_ai AFTER INSERT ON ordem_servico
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE ordem_servico SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_ordem_servico_sync_au AFTER UPDATE ON ordem_servico WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE ordem_servico SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_ordem_servico_sync_ad AFTER DELETE ON ordem_servico WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('ordem_servico', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- comissao
ALTER TABLE comissao ADD COLUMN uuid TEXT;
ALTER TABLE comissao ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE comissao ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE comissao SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_comissao_uuid ON comissao(uuid);
CREATE INDEX idx_comissao_sync_rev ON comissao(sync_rev);

CREATE TRIGGER trg_comissao_sync_ai AFTER INSERT ON comissao
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE comissao SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_comissao_sync_au AFTER UPDATE ON comissao WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE comissao SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_comissao_sync_ad AFTER DELETE ON comissao WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('comissao', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- conta_receber
ALTER TABLE conta_receber ADD COLUMN uuid TEXT;
ALTER TABLE conta_receber ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conta_receber ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE conta_receber SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_conta_receber_uuid ON conta_receber(uuid);
CREATE INDEX idx_conta_receber_sync_rev ON conta_receber(sync_rev);

CREATE TRIGGER trg_conta_receber_sync_ai AFTER INSERT ON conta_receber
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE conta_receber SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_conta_receber_sync_au AFTER UPDATE ON conta_receber WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE conta_receber SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_conta_receber_sync_ad AFTER DELETE ON conta_receber WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('conta_receber', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- recebimento
ALTER TABLE recebimento ADD COLUMN uuid TEXT;
ALTER TABLE recebimento ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE recebimento ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE recebimento SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_recebimento_uuid ON recebimento(uuid);
CREATE INDEX idx_recebimento_sync_rev ON recebimento(sync_rev);

CREATE TRIGGER trg_recebimento_sync_ai AFTER INSERT ON recebimento
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE recebimento SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_recebimento_sync_au AFTER UPDATE ON recebimento WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE recebimento SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_recebimento_sync_ad AFTER DELETE ON recebimento WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('recebimento', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- conta_pagar
ALTER TABLE conta_pagar ADD COLUMN uuid TEXT;
ALTER TABLE conta_pagar ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conta_pagar ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE conta_pagar SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_conta_pagar_uuid ON conta_pagar(uuid);
CREATE INDEX idx_conta_pagar_sync_rev ON conta_pagar(sync_rev);

CREATE TRIGGER trg_conta_pagar_sync_ai AFTER INSERT ON conta_pagar
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE conta_pagar SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_conta_pagar_sync_au AFTER UPDATE ON conta_pagar WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE conta_pagar SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_conta_pagar_sync_ad AFTER DELETE ON conta_pagar WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('conta_pagar', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- pagamento
ALTER TABLE pagamento ADD COLUMN uuid TEXT;
ALTER TABLE pagamento ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pagamento ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE pagamento SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_pagamento_uuid ON pagamento(uuid);
CREATE INDEX idx_pagamento_sync_rev ON pagamento(sync_rev);

CREATE TRIGGER trg_pagamento_sync_ai AFTER INSERT ON pagamento
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE pagamento SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_pagamento_sync_au AFTER UPDATE ON pagamento WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE pagamento SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_pagamento_sync_ad AFTER DELETE ON pagamento WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('pagamento', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- lancamento
ALTER TABLE lancamento ADD COLUMN uuid TEXT;
ALTER TABLE lancamento ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lancamento ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE lancamento SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_lancamento_uuid ON lancamento(uuid);
CREATE INDEX idx_lancamento_sync_rev ON lancamento(sync_rev);

CREATE TRIGGER trg_lancamento_sync_ai AFTER INSERT ON lancamento
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE lancamento SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_lancamento_sync_au AFTER UPDATE ON lancamento WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE lancamento SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_lancamento_sync_ad AFTER DELETE ON lancamento WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('lancamento', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- caixa
ALTER TABLE caixa ADD COLUMN uuid TEXT;
ALTER TABLE caixa ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE caixa ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE caixa SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_caixa_uuid ON caixa(uuid);
CREATE INDEX idx_caixa_sync_rev ON caixa(sync_rev);

CREATE TRIGGER trg_caixa_sync_ai AFTER INSERT ON caixa
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE caixa SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_caixa_sync_au AFTER UPDATE ON caixa WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE caixa SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_caixa_sync_ad AFTER DELETE ON caixa WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('caixa', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- auditoria
ALTER TABLE auditoria ADD COLUMN uuid TEXT;
ALTER TABLE auditoria ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE auditoria ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE auditoria SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_auditoria_uuid ON auditoria(uuid);
CREATE INDEX idx_auditoria_sync_rev ON auditoria(sync_rev);

CREATE TRIGGER trg_auditoria_sync_ai AFTER INSERT ON auditoria
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE auditoria SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_auditoria_sync_au AFTER UPDATE ON auditoria WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE auditoria SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_auditoria_sync_ad AFTER DELETE ON auditoria WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('auditoria', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- Identidade deste computador na nuvem (nunca sincroniza: ver CHAVES_CONFIGURACAO_LOCAIS).
INSERT OR IGNORE INTO configuracao (chave, valor, tipo) VALUES ('sync_dispositivo_id', lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), 'texto');
