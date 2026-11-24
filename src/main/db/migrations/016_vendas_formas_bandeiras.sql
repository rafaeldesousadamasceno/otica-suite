-- Vendas (fase 5): cadastro de formas de pagamento e de bandeiras, desconto em % ou R$, acrescimo da
-- promissoria, recebivel da operadora do cartao e exclusao logica da venda.
--
-- Nada e apagado nem recalculado: as vendas, os pagamentos e as parcelas de antes continuam como
-- estao (o texto da forma de pagamento fica gravado em venda_pagamento.forma_pagamento, e as
-- parcelas ja existentes seguem como parcelas DO CLIENTE). So entram colunas novas e tabelas novas.
--
-- Mapeamento da lista antiga (lista_valor tipo 'forma_pagamento') para o cadastro novo:
--   ENTRADA          -> Dinheiro, INATIVA: a entrada agora e uma linha comum (Dinheiro ou PIX);
--   A VISTA          -> Dinheiro, INATIVA: o cadastro novo ganha a forma padrao DINHEIRO no lugar;
--   PIX              -> PIX;   TRANSFER...  -> Transferencia;
--   ...DEBITO...     -> Cartao de Debito;   ...CREDITO... -> Cartao de Credito;
--   CARTAO (so isso) -> Cartao de Credito, INATIVA: nao ha como saber se era debito ou credito;
--   PROMISSORIA, CARNE, CREDIARIO -> Promissoria (ate 12x, a cada 30 dias, sem acrescimo);
--   BOLETO, CHEQUE   -> como a Promissoria;
--   qualquer outro nome -> Outro (recebido na hora), com o ativo/inativo que tinha.
-- Os textos que so existem em vendas antigas (ex.: vindos da importacao) tambem viram cadastro,
-- INATIVOS, para a venda antiga apontar para uma forma. As formas padrao que faltarem sao criadas.
-- A lista antiga (lista_valor) NAO e alterada: Contas a Pagar ainda a usa.

-- ===================== Formas de pagamento =====================

CREATE TABLE forma_pagamento (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  nome             TEXT NOT NULL,
  tipo             TEXT NOT NULL CHECK (tipo IN ('DINHEIRO', 'PIX', 'TRANSFERENCIA', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'PROMISSORIA', 'BOLETO', 'CHEQUE', 'OUTRO')),
  ordem            INTEGER NOT NULL DEFAULT 0,
  ativo            INTEGER NOT NULL DEFAULT 1,
  -- So Promissoria, Boleto e Cheque (parcelas do cliente):
  max_parcelas     INTEGER,
  intervalo_dias   INTEGER NOT NULL DEFAULT 30,
  acrescimo_tipo   TEXT CHECK (acrescimo_tipo IN ('PERCENTUAL', 'VALOR')),
  -- pontos-base (8,99% = 899) quando PERCENTUAL, centavos quando VALOR
  acrescimo_valor  INTEGER NOT NULL DEFAULT 0,
  excluido_em      TEXT,
  excluido_motivo  TEXT,
  criado_em        TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Mesmo nome (sem diferenca de maiuscula de letra sem acento) nao convive; o excluido libera o nome.
CREATE UNIQUE INDEX idx_forma_pagamento_nome ON forma_pagamento(nome COLLATE NOCASE) WHERE excluido_em IS NULL;

-- 1) o que a otica ja tinha na lista antiga (mantem ativo/inativo, salvo os casos acima)
WITH origem AS (
  SELECT trim(valor) AS nome, ativo FROM lista_valor WHERE tipo = 'forma_pagamento' AND trim(valor) <> ''
), tipada AS (
  SELECT nome, ativo,
    CASE
      WHEN nome LIKE '%D_BITO%' THEN 'CARTAO_DEBITO'
      WHEN nome LIKE '%CR_DITO%' THEN 'CARTAO_CREDITO'
      WHEN nome LIKE '%CART%' THEN 'CARTAO_CREDITO'
      WHEN nome LIKE '%PROMISS%' OR nome LIKE '%CARN%' OR nome LIKE '%CREDI_RIO%' THEN 'PROMISSORIA'
      WHEN nome LIKE '%BOLETO%' THEN 'BOLETO'
      WHEN nome LIKE '%CHEQUE%' THEN 'CHEQUE'
      WHEN nome LIKE '%PIX%' THEN 'PIX'
      WHEN nome LIKE '%TRANSFER%' THEN 'TRANSFERENCIA'
      WHEN nome LIKE 'ENTRADA' OR nome LIKE '%VISTA%' OR nome LIKE '%DINHEIRO%' THEN 'DINHEIRO'
      ELSE 'OUTRO'
    END AS tipo,
    (nome LIKE 'ENTRADA' OR nome LIKE '%VISTA%'
      OR (nome LIKE '%CART%' AND nome NOT LIKE '%D_BITO%' AND nome NOT LIKE '%CR_DITO%')) AS legada_inativa
  FROM origem
)
INSERT OR IGNORE INTO forma_pagamento (nome, tipo, ordem, ativo, max_parcelas)
SELECT nome, tipo,
  CASE tipo WHEN 'DINHEIRO' THEN 1 WHEN 'PIX' THEN 2 WHEN 'TRANSFERENCIA' THEN 3 WHEN 'CARTAO_DEBITO' THEN 4
            WHEN 'CARTAO_CREDITO' THEN 5 WHEN 'PROMISSORIA' THEN 6 WHEN 'BOLETO' THEN 7 WHEN 'CHEQUE' THEN 8 ELSE 9 END
    + CASE WHEN legada_inativa = 1 OR ativo = 0 THEN 90 ELSE 0 END,
  CASE WHEN legada_inativa = 1 THEN 0 ELSE ativo END,
  CASE WHEN tipo IN ('PROMISSORIA', 'BOLETO', 'CHEQUE') THEN 12 END
FROM tipada ORDER BY nome;

-- 2) os textos que so existem em vendas antigas: cadastro INATIVO, so para a venda antiga apontar para ele
WITH origem AS (
  SELECT DISTINCT trim(forma_pagamento) AS nome FROM venda_pagamento WHERE trim(forma_pagamento) <> ''
)
INSERT OR IGNORE INTO forma_pagamento (nome, tipo, ordem, ativo, max_parcelas)
SELECT nome,
  CASE
    WHEN nome LIKE '%D_BITO%' THEN 'CARTAO_DEBITO'
    WHEN nome LIKE '%CR_DITO%' THEN 'CARTAO_CREDITO'
    WHEN nome LIKE '%CART%' THEN 'CARTAO_CREDITO'
    WHEN nome LIKE '%PROMISS%' OR nome LIKE '%CARN%' OR nome LIKE '%CREDI_RIO%' THEN 'PROMISSORIA'
    WHEN nome LIKE '%BOLETO%' THEN 'BOLETO'
    WHEN nome LIKE '%CHEQUE%' THEN 'CHEQUE'
    WHEN nome LIKE '%PIX%' THEN 'PIX'
    WHEN nome LIKE '%TRANSFER%' THEN 'TRANSFERENCIA'
    WHEN nome LIKE 'ENTRADA' OR nome LIKE '%VISTA%' OR nome LIKE '%DINHEIRO%' THEN 'DINHEIRO'
    ELSE 'OUTRO'
  END,
  99, 0,
  CASE WHEN nome LIKE '%PROMISS%' OR nome LIKE '%CARN%' OR nome LIKE '%CREDI_RIO%' OR nome LIKE '%BOLETO%' OR nome LIKE '%CHEQUE%' THEN 12 END
FROM origem ORDER BY nome;

-- 3) as formas padrao que ainda nao tem nenhuma ATIVA do mesmo tipo
INSERT OR IGNORE INTO forma_pagamento (nome, tipo, ordem, ativo)
SELECT 'DINHEIRO', 'DINHEIRO', 1, 1 WHERE NOT EXISTS (SELECT 1 FROM forma_pagamento WHERE tipo = 'DINHEIRO' AND ativo = 1 AND excluido_em IS NULL);
INSERT OR IGNORE INTO forma_pagamento (nome, tipo, ordem, ativo)
SELECT 'PIX', 'PIX', 2, 1 WHERE NOT EXISTS (SELECT 1 FROM forma_pagamento WHERE tipo = 'PIX' AND ativo = 1 AND excluido_em IS NULL);
INSERT OR IGNORE INTO forma_pagamento (nome, tipo, ordem, ativo)
SELECT 'TRANSFERÊNCIA', 'TRANSFERENCIA', 3, 1 WHERE NOT EXISTS (SELECT 1 FROM forma_pagamento WHERE tipo = 'TRANSFERENCIA' AND ativo = 1 AND excluido_em IS NULL);
INSERT OR IGNORE INTO forma_pagamento (nome, tipo, ordem, ativo)
SELECT 'CARTÃO DE DÉBITO', 'CARTAO_DEBITO', 4, 1 WHERE NOT EXISTS (SELECT 1 FROM forma_pagamento WHERE tipo = 'CARTAO_DEBITO' AND ativo = 1 AND excluido_em IS NULL);
INSERT OR IGNORE INTO forma_pagamento (nome, tipo, ordem, ativo)
SELECT 'CARTÃO DE CRÉDITO', 'CARTAO_CREDITO', 5, 1 WHERE NOT EXISTS (SELECT 1 FROM forma_pagamento WHERE tipo = 'CARTAO_CREDITO' AND ativo = 1 AND excluido_em IS NULL);
INSERT OR IGNORE INTO forma_pagamento (nome, tipo, ordem, ativo, max_parcelas)
SELECT 'PROMISSÓRIA', 'PROMISSORIA', 6, 1, 12 WHERE NOT EXISTS (SELECT 1 FROM forma_pagamento WHERE tipo = 'PROMISSORIA' AND ativo = 1 AND excluido_em IS NULL);
INSERT OR IGNORE INTO forma_pagamento (nome, tipo, ordem, ativo, max_parcelas)
SELECT 'BOLETO', 'BOLETO', 7, 1, 12 WHERE NOT EXISTS (SELECT 1 FROM forma_pagamento WHERE tipo = 'BOLETO' AND ativo = 1 AND excluido_em IS NULL);
INSERT OR IGNORE INTO forma_pagamento (nome, tipo, ordem, ativo, max_parcelas)
SELECT 'CHEQUE', 'CHEQUE', 8, 1, 12 WHERE NOT EXISTS (SELECT 1 FROM forma_pagamento WHERE tipo = 'CHEQUE' AND ativo = 1 AND excluido_em IS NULL);

-- ===================== Bandeiras (cartao) =====================

CREATE TABLE bandeira (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  nome               TEXT NOT NULL,
  adquirente         TEXT,
  aceita_debito      INTEGER NOT NULL DEFAULT 0,
  aceita_credito     INTEGER NOT NULL DEFAULT 0,
  -- Debito: taxa em pontos-base (1,99% = 199) e prazo de recebimento em dias.
  debito_taxa_bp     INTEGER,
  debito_prazo_dias  INTEGER,
  ativo              INTEGER NOT NULL DEFAULT 1,
  excluido_em        TEXT,
  excluido_motivo    TEXT,
  criado_em          TEXT NOT NULL DEFAULT (datetime('now'))
);
-- A mesma bandeira pode existir em maquininhas (adquirentes) diferentes; o excluido libera o nome.
CREATE UNIQUE INDEX idx_bandeira_nome ON bandeira(nome COLLATE NOCASE, COALESCE(adquirente, '') COLLATE NOCASE) WHERE excluido_em IS NULL;

-- Credito: uma linha por quantidade de parcelas (1x ate Nx).
CREATE TABLE bandeira_faixa (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  bandeira_id           INTEGER NOT NULL REFERENCES bandeira(id),
  parcelas              INTEGER NOT NULL CHECK (parcelas >= 1),
  taxa_bp               INTEGER NOT NULL DEFAULT 0,
  prazo_dias            INTEGER NOT NULL DEFAULT 30,
  -- Desconto comercial ao cliente nesta quantidade de parcelas; 0 = sem efeito.
  desconto_cliente_bp   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (bandeira_id, parcelas)
);

-- ===================== Venda =====================

-- Desconto da venda: tipo, valor informado (centavos ou pontos-base) e o desconto adicional em centavos.
ALTER TABLE venda ADD COLUMN desconto_adicional_tipo TEXT NOT NULL DEFAULT 'VALOR';
ALTER TABLE venda ADD COLUMN desconto_adicional_valor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE venda ADD COLUMN desconto_adicional_centavos INTEGER NOT NULL DEFAULT 0;
-- Exclusao logica: a venda excluida nunca volta; o numero dela nunca e reaproveitado (o numero e UNIQUE e continua gravado).
ALTER TABLE venda ADD COLUMN excluido_em TEXT;
ALTER TABLE venda ADD COLUMN excluido_motivo TEXT;
ALTER TABLE venda ADD COLUMN excluido_por INTEGER REFERENCES usuario(id);

-- Vendas antigas: o desconto que nao foi dos itens foi o adicional (em R$).
UPDATE venda
   SET desconto_adicional_centavos = MAX(0, desconto_centavos - COALESCE((SELECT SUM(vi.desconto_centavos) FROM venda_item vi WHERE vi.venda_id = venda.id), 0));
UPDATE venda SET desconto_adicional_valor = desconto_adicional_centavos;

-- ===================== Pagamento da venda: o que foi calculado FICA GRAVADO (RG-02) =====================

ALTER TABLE venda_pagamento ADD COLUMN forma_pagamento_id INTEGER REFERENCES forma_pagamento(id);
ALTER TABLE venda_pagamento ADD COLUMN forma_tipo TEXT;
-- IMEDIATO | OPERADORA | PARCELADO_CLIENTE. Nas vendas antigas: a regra de antes (1 parcela = recebido na hora; mais = parcelas do cliente).
ALTER TABLE venda_pagamento ADD COLUMN comportamento TEXT;
ALTER TABLE venda_pagamento ADD COLUMN bandeira_id INTEGER REFERENCES bandeira(id);
ALTER TABLE venda_pagamento ADD COLUMN bandeira_nome TEXT;
ALTER TABLE venda_pagamento ADD COLUMN taxa_bp INTEGER;
ALTER TABLE venda_pagamento ADD COLUMN desconto_cliente_bp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE venda_pagamento ADD COLUMN desconto_cliente_centavos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE venda_pagamento ADD COLUMN bruto_centavos INTEGER;
ALTER TABLE venda_pagamento ADD COLUMN liquido_centavos INTEGER;
ALTER TABLE venda_pagamento ADD COLUMN data_prevista TEXT;
ALTER TABLE venda_pagamento ADD COLUMN intervalo_dias INTEGER;
ALTER TABLE venda_pagamento ADD COLUMN acrescimo_tipo TEXT;
ALTER TABLE venda_pagamento ADD COLUMN acrescimo_valor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE venda_pagamento ADD COLUMN acrescimo_centavos INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_venda_pagamento_forma ON venda_pagamento(forma_pagamento_id);
CREATE INDEX idx_venda_pagamento_bandeira ON venda_pagamento(bandeira_id);

UPDATE venda_pagamento
   SET comportamento = CASE WHEN parcelas > 1 THEN 'PARCELADO_CLIENTE' ELSE 'IMEDIATO' END,
       forma_pagamento_id = (SELECT f.id FROM forma_pagamento f WHERE f.nome = trim(venda_pagamento.forma_pagamento) COLLATE NOCASE AND f.excluido_em IS NULL),
       forma_tipo = (SELECT f.tipo FROM forma_pagamento f WHERE f.nome = trim(venda_pagamento.forma_pagamento) COLLATE NOCASE AND f.excluido_em IS NULL);

-- ===================== Contas a receber: do cliente ou da operadora =====================

-- 'CLIENTE' (parcela que o cliente deve: carne, cobranca, inadimplencia) ou 'OPERADORA' (o que a maquininha ainda vai
-- depositar: NAO e divida do cliente). Tudo o que ja existia e do cliente.
ALTER TABLE conta_receber ADD COLUMN tipo TEXT NOT NULL DEFAULT 'CLIENTE';
ALTER TABLE conta_receber ADD COLUMN venda_pagamento_id INTEGER REFERENCES venda_pagamento(id);
-- Recebivel da operadora: valor_centavos e o LIQUIDO e vencimento e a data prevista; o resto do snapshot fica aqui.
ALTER TABLE conta_receber ADD COLUMN bandeira_nome TEXT;
ALTER TABLE conta_receber ADD COLUMN operadora_parcelas INTEGER;
ALTER TABLE conta_receber ADD COLUMN taxa_bp INTEGER;
ALTER TABLE conta_receber ADD COLUMN bruto_centavos INTEGER;
CREATE INDEX idx_conta_receber_tipo ON conta_receber(tipo, situacao);
CREATE INDEX idx_conta_receber_venda_pagamento ON conta_receber(venda_pagamento_id);

CREATE INDEX idx_venda_excluida ON venda(excluido_em);

-- Sincronizacao (mesmo SQL do gerador: src/main/sync/gerarSyncSql.ts, sqlSyncTabelaNova).
-- ---------------------------------------------------------------- forma_pagamento
ALTER TABLE forma_pagamento ADD COLUMN uuid TEXT;
ALTER TABLE forma_pagamento ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE forma_pagamento ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE forma_pagamento SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_forma_pagamento_uuid ON forma_pagamento(uuid);
CREATE INDEX idx_forma_pagamento_sync_rev ON forma_pagamento(sync_rev);

CREATE TRIGGER trg_forma_pagamento_sync_ai AFTER INSERT ON forma_pagamento
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE forma_pagamento SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_forma_pagamento_sync_au AFTER UPDATE ON forma_pagamento WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE forma_pagamento SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_forma_pagamento_sync_ad AFTER DELETE ON forma_pagamento WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('forma_pagamento', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- bandeira
ALTER TABLE bandeira ADD COLUMN uuid TEXT;
ALTER TABLE bandeira ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bandeira ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE bandeira SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_bandeira_uuid ON bandeira(uuid);
CREATE INDEX idx_bandeira_sync_rev ON bandeira(sync_rev);

CREATE TRIGGER trg_bandeira_sync_ai AFTER INSERT ON bandeira
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE bandeira SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_bandeira_sync_au AFTER UPDATE ON bandeira WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE bandeira SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_bandeira_sync_ad AFTER DELETE ON bandeira WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('bandeira', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;

-- ---------------------------------------------------------------- bandeira_faixa
ALTER TABLE bandeira_faixa ADD COLUMN uuid TEXT;
ALTER TABLE bandeira_faixa ADD COLUMN sync_rev INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bandeira_faixa ADD COLUMN atualizado_em TEXT;
-- Linhas que já existem: cada uma ganha seu uuid e entram na revisão 1 (carga inicial).
UPDATE bandeira_faixa SET uuid = lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))), sync_rev = 1;
CREATE UNIQUE INDEX idx_bandeira_faixa_uuid ON bandeira_faixa(uuid);
CREATE INDEX idx_bandeira_faixa_sync_rev ON bandeira_faixa(sync_rev);

CREATE TRIGGER trg_bandeira_faixa_sync_ai AFTER INSERT ON bandeira_faixa
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE bandeira_faixa SET uuid = COALESCE(uuid, lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))), sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now')
   WHERE rowid = NEW.rowid;
END;

-- A guarda evita laço: o UPDATE do próprio gatilho muda o sync_rev e, por isso, não dispara de novo.
CREATE TRIGGER trg_bandeira_faixa_sync_au AFTER UPDATE ON bandeira_faixa WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  UPDATE bandeira_faixa SET sync_rev = (SELECT valor FROM sync_contador WHERE id = 1), atualizado_em = datetime('now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER trg_bandeira_faixa_sync_ad AFTER DELETE ON bandeira_faixa WHEN OLD.uuid IS NOT NULL
BEGIN
  UPDATE sync_contador SET valor = valor + 1 WHERE id = 1;
  INSERT INTO sync_exclusao (tabela, uuid, sync_rev, excluido_em)
  VALUES ('bandeira_faixa', OLD.uuid, (SELECT valor FROM sync_contador WHERE id = 1), datetime('now'));
END;
