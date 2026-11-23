-- Laboratorios: o texto livre da OS passa a ser um CADASTRO (RG-02).
--
-- Nada e apagado: a coluna `ordem_servico.laboratorio` (texto) continua gravada. Os
-- laboratorios nascem do que a otica ja usava (a lista antiga + os textos distintos das
-- OS) e cada OS com laboratorio ganha o vinculo. Um laboratorio com OS nunca e excluido,
-- so inativado; `excluido_em` e a exclusao logica (so de quem nunca foi usado).
-- A OS ganha tambem o entregador (quem leva a armacao ao laboratorio), gravado nela.

CREATE TABLE laboratorio (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  nome                 TEXT NOT NULL,
  razao_social         TEXT,
  cnpj                 TEXT,
  telefone             TEXT,
  whatsapp             TEXT,
  email                TEXT,
  endereco             TEXT,
  contato_responsavel  TEXT,
  prazo_medio_dias     INTEGER,
  observacoes          TEXT,
  ativo                INTEGER NOT NULL DEFAULT 1,
  excluido_em          TEXT,
  excluido_motivo      TEXT,
  criado_em            TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Dois laboratorios com o mesmo nome (sem diferenca de maiuscula) nao convivem; o excluido libera o nome.
CREATE UNIQUE INDEX idx_laboratorio_nome ON laboratorio(nome COLLATE NOCASE) WHERE excluido_em IS NULL;

ALTER TABLE ordem_servico ADD COLUMN laboratorio_id INTEGER REFERENCES laboratorio(id);
ALTER TABLE ordem_servico ADD COLUMN entregador_nome TEXT;
ALTER TABLE ordem_servico ADD COLUMN entregador_contato TEXT;
CREATE INDEX idx_os_laboratorio ON ordem_servico(laboratorio_id);

-- Carga inicial: primeiro a lista que a otica configurava (mantem ativo/inativo), depois os
-- textos que so existem nas OS (ex.: vindos da importacao). Nome repetido entra uma vez so, sem
-- diferenca de maiuscula - mas o SQLite so ignora maiuscula em letras SEM acento: "LABORATÓRIO" e
-- "laboratório" viram dois cadastros (a otica inativa o repetido na tela de Laboratorios).
INSERT OR IGNORE INTO laboratorio (nome, ativo)
SELECT trim(valor), ativo FROM lista_valor
 WHERE tipo = 'laboratorio' AND trim(valor) <> ''
 ORDER BY ordem, valor;

INSERT OR IGNORE INTO laboratorio (nome)
SELECT DISTINCT trim(laboratorio) FROM ordem_servico
 WHERE laboratorio IS NOT NULL AND trim(laboratorio) <> ''
 ORDER BY trim(laboratorio);

-- Sincronizacao (mesmo SQL do gerador: src/main/sync/gerarSyncSql.ts, sqlSyncTabelaNova).
-- ---------------------------------------------------------------- laboratorio
ALTER TABLE laboratorio ADD COLUMN uuid TEXT;
ALTER TABLE laboratorio ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE laboratorio ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE laboratorio SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_laboratorio_uuid ON laboratorio(uuid);
CREATE INDEX idx_laboratorio_sync_rev ON laboratorio(sync_rev);

CREATE TRIGGER trg_laboratorio_sync_ai AFTER INSERT ON laboratorio
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE laboratorio SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_laboratorio_sync_au AFTER UPDATE ON laboratorio WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE laboratorio SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_laboratorio_sync_ad AFTER DELETE ON laboratorio WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('laboratorio', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- Vinculo das OS que ja tinham laboratorio (pelo nome, sem diferenca de maiuscula).
UPDATE ordem_servico
   SET laboratorio_id = (SELECT l.id FROM laboratorio l WHERE l.nome = trim(ordem_servico.laboratorio) COLLATE NOCASE AND l.excluido_em IS NULL)
 WHERE laboratorio IS NOT NULL AND trim(laboratorio) <> '';
