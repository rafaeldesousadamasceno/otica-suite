-- Recorrencia de contas a pagar: a SERIE (aluguel, energia...) passa a existir por si so, e cada
-- ocorrencia e uma conta a pagar (lancamento) com valor proprio. Antes, a conta marcada como recorrente
-- gerava a proxima ao ser paga, sem fim e sem como reajustar o valor.
--
-- Nada e apagado nem muda de valor: as contas que ja existem so ganham o vinculo com a serie
-- (recorrencia_id + competencia AAAA-MM). Contas pagas nao sao alteradas. `excluido_em` e a exclusao
-- logica. O indice unico (recorrencia_id, competencia) NAO filtra por excluido_em: assim o job que
-- completa o horizonte nao recria uma ocorrencia removida com "Excluir somente esta".

CREATE TABLE recorrencia (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao       TEXT NOT NULL,
  categoria       TEXT,
  fornecedor_id   INTEGER REFERENCES fornecedor(id),
  frequencia      TEXT NOT NULL DEFAULT 'MENSAL' CHECK (frequencia IN ('MENSAL', 'ANUAL')),
  dia_vencimento  INTEGER NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
  data_inicio     TEXT NOT NULL,
  data_fim        TEXT,
  status          TEXT NOT NULL DEFAULT 'ATIVA' CHECK (status IN ('ATIVA', 'ENCERRADA')),
  criado_em       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Historico de vigencia do valor: vale da competencia `vigente_desde` (AAAA-MM) ate a proxima vigencia.
CREATE TABLE recorrencia_valor (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  recorrencia_id  INTEGER NOT NULL REFERENCES recorrencia(id),
  valor_centavos  INTEGER NOT NULL,
  vigente_desde   TEXT NOT NULL,
  criado_em       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (recorrencia_id, vigente_desde)
);

ALTER TABLE conta_pagar ADD COLUMN recorrencia_id INTEGER REFERENCES recorrencia(id);
ALTER TABLE conta_pagar ADD COLUMN competencia TEXT;
ALTER TABLE conta_pagar ADD COLUMN excluido_em TEXT;
ALTER TABLE conta_pagar ADD COLUMN excluido_motivo TEXT;

-- ---------------------------------------------------------------------------------------------
-- Series que a otica ja tinha: as contas marcadas como recorrentes (conta_pagar.recorrente = 1).
--
-- Uma serie = a mesma DESCRICAO + a mesma CATEGORIA, comparadas por IGUALDADE EXATA do texto (so sem
-- os espacos das pontas). Nao se usa NOCASE: o SQLite so ignora maiuscula em letra SEM acento, entao
-- "ALUGUEL" e "aluguel" seriam iguais mas "ENERGIA ELÉTRICA" e "ENERGIA ELéTRICA" nao; a igualdade
-- exata trata todos do mesmo jeito (os textos ja foram padronizados em maiusculas pelo sistema).
-- Mesma descricao com categoria diferente = series diferentes; categoria vazia e categoria nula
-- contam como a mesma. Conta sem data no formato AAAA-MM-DD fica de fora (nao entra em serie nenhuma).
--
-- Cada serie vira uma recorrencia MENSAL ATIVA, com:
--   data de inicio = o menor vencimento da serie;
--   dia de vencimento = o dia do vencimento mais recente (em mes mais curto vale o ultimo dia);
--   valor = o da conta mais recente (a nao cancelada de maior vencimento), em uma vigencia que
--           comeca na competencia do inicio. As contas ja geradas MANTEM o valor que tem.
-- Cada conta recebe recorrencia_id + competencia (AAAA-MM do vencimento). Se uma serie tiver duas
-- contas na mesma competencia, so uma (a nao cancelada de menor id) e vinculada; a outra continua
-- como esta, sem vinculo, para a chave (recorrencia_id, competencia) ser unica.
-- ---------------------------------------------------------------------------------------------

CREATE TEMP TABLE conta_017 AS
SELECT *,
       ROW_NUMBER() OVER (PARTITION BY descricao_chave, categoria_chave
                          ORDER BY cancelada, vencimento DESC, id DESC) AS rn_atual,
       ROW_NUMBER() OVER (PARTITION BY descricao_chave, categoria_chave, competencia_calc
                          ORDER BY cancelada, id) AS rn_competencia
  FROM (
    SELECT id,
           trim(descricao) AS descricao_chave,
           COALESCE(trim(categoria), '') AS categoria_chave,
           fornecedor_id,
           vencimento,
           valor_centavos,
           CASE WHEN situacao = 'CANCELADA' THEN 1 ELSE 0 END AS cancelada,
           substr(vencimento, 1, 7) AS competencia_calc
      FROM conta_pagar
     WHERE recorrente = 1
       AND vencimento GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'
  );

INSERT INTO recorrencia (descricao, categoria, fornecedor_id, frequencia, dia_vencimento, data_inicio, data_fim, status)
SELECT a.descricao_chave,
       NULLIF(a.categoria_chave, ''),
       a.fornecedor_id,
       'MENSAL',
       MIN(31, MAX(1, CAST(substr(a.vencimento, 9, 2) AS INTEGER))),
       (SELECT MIN(c.vencimento) FROM conta_017 c
         WHERE c.descricao_chave = a.descricao_chave AND c.categoria_chave = a.categoria_chave),
       NULL,
       'ATIVA'
  FROM conta_017 a
 WHERE a.rn_atual = 1
 ORDER BY a.descricao_chave, a.categoria_chave;

INSERT INTO recorrencia_valor (recorrencia_id, valor_centavos, vigente_desde)
SELECT r.id, a.valor_centavos, substr(r.data_inicio, 1, 7)
  FROM recorrencia r
  JOIN conta_017 a ON a.descricao_chave = r.descricao AND a.categoria_chave = COALESCE(r.categoria, '') AND a.rn_atual = 1;

-- Sincronizacao (mesmo SQL do gerador: src/main/sync/gerarSyncSql.ts, sqlSyncTabelaNova).
-- ---------------------------------------------------------------- recorrencia
ALTER TABLE recorrencia ADD COLUMN uuid TEXT;
ALTER TABLE recorrencia ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE recorrencia ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE recorrencia SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_recorrencia_uuid ON recorrencia(uuid);
CREATE INDEX idx_recorrencia_sync_rev ON recorrencia(sync_rev);

CREATE TRIGGER trg_recorrencia_sync_ai AFTER INSERT ON recorrencia
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE recorrencia SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_recorrencia_sync_au AFTER UPDATE ON recorrencia WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE recorrencia SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_recorrencia_sync_ad AFTER DELETE ON recorrencia WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('recorrencia', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- recorrencia_valor
ALTER TABLE recorrencia_valor ADD COLUMN uuid TEXT;
ALTER TABLE recorrencia_valor ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE recorrencia_valor ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE recorrencia_valor SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_recorrencia_valor_uuid ON recorrencia_valor(uuid);
CREATE INDEX idx_recorrencia_valor_sync_rev ON recorrencia_valor(sync_rev);

CREATE TRIGGER trg_recorrencia_valor_sync_ai AFTER INSERT ON recorrencia_valor
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE recorrencia_valor SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_recorrencia_valor_sync_au AFTER UPDATE ON recorrencia_valor WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE recorrencia_valor SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_recorrencia_valor_sync_ad AFTER DELETE ON recorrencia_valor WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('recorrencia_valor', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

UPDATE conta_pagar
   SET recorrencia_id = (SELECT r.id FROM recorrencia r
                           JOIN conta_017 c ON c.descricao_chave = r.descricao AND c.categoria_chave = COALESCE(r.categoria, '')
                          WHERE c.id = conta_pagar.id),
       competencia = substr(vencimento, 1, 7)
 WHERE id IN (SELECT id FROM conta_017 WHERE rn_competencia = 1);

DROP TABLE conta_017;

CREATE UNIQUE INDEX idx_conta_pagar_recorrencia_competencia ON conta_pagar(recorrencia_id, competencia);
CREATE INDEX idx_recorrencia_valor_recorrencia ON recorrencia_valor(recorrencia_id);
CREATE INDEX idx_recorrencia_status ON recorrencia(status);
