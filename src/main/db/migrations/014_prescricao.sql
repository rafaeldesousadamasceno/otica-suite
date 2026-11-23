-- Prescricao (antes "receita optica"; o nome interno da tabela nao muda).
--
-- Nada e apagado nem sobrescrito: as colunas antigas (perto_*, adicao, altura,
-- armacao, DP por olho) continuam como estavam. O que muda e que:
--  * a adicao passa a ser POR OLHO e o perto deixa de ser gravado: vem de
--    Longe + Adicao na hora de mostrar. Prescricao antiga cujo perto nao segue
--    essa regra fica marcada `formato_anterior` e continua mostrando o perto
--    que foi gravado, so para leitura;
--  * a DP (soma das DNPs) passa a ser gravada;
--  * altura, prisma e base do prisma passam a ser por olho;
--  * armacao e medidas ganham campos proprios; o texto antigo da armacao vai
--    para o "modelo";
--  * exclusao logica (`excluido_em`).

ALTER TABLE receita_optica ADD COLUMN longe_od_alt REAL;
ALTER TABLE receita_optica ADD COLUMN longe_oe_alt REAL;
ALTER TABLE receita_optica ADD COLUMN longe_od_prisma REAL NOT NULL DEFAULT 0;
ALTER TABLE receita_optica ADD COLUMN longe_oe_prisma REAL NOT NULL DEFAULT 0;
ALTER TABLE receita_optica ADD COLUMN longe_od_base_prisma TEXT NOT NULL DEFAULT 'NENHUM';
ALTER TABLE receita_optica ADD COLUMN longe_oe_base_prisma TEXT NOT NULL DEFAULT 'NENHUM';
ALTER TABLE receita_optica ADD COLUMN adicao_od REAL;
ALTER TABLE receita_optica ADD COLUMN adicao_oe REAL;
ALTER TABLE receita_optica ADD COLUMN indice_refracao TEXT;
ALTER TABLE receita_optica ADD COLUMN armacao_tipo TEXT;
ALTER TABLE receita_optica ADD COLUMN armacao_modelo TEXT;
ALTER TABLE receita_optica ADD COLUMN armacao_marca TEXT;
ALTER TABLE receita_optica ADD COLUMN armacao_cor TEXT;
ALTER TABLE receita_optica ADD COLUMN ponte REAL;
ALTER TABLE receita_optica ADD COLUMN horizontal REAL;
ALTER TABLE receita_optica ADD COLUMN vertical REAL;
ALTER TABLE receita_optica ADD COLUMN diagonal_maior REAL;
ALTER TABLE receita_optica ADD COLUMN dp_longe REAL;
ALTER TABLE receita_optica ADD COLUMN dp_perto REAL;
ALTER TABLE receita_optica ADD COLUMN formato_anterior INTEGER NOT NULL DEFAULT 0;
ALTER TABLE receita_optica ADD COLUMN excluido_em TEXT;
ALTER TABLE receita_optica ADD COLUMN excluido_motivo TEXT;

-- ---------------------------------------------------------------- conversao
-- Mesma conta de converterLegado() em src/shared/prescricao.ts (um teste confere os dois).

-- Adicao de cada olho: perto - longe; sem perto gravado, a adicao unica de antes (ou 0).
UPDATE receita_optica SET
  adicao_od = CASE
    WHEN perto_od_esf IS NOT NULL THEN (CASE WHEN longe_od_esf IS NULL THEN NULL ELSE round(perto_od_esf - longe_od_esf, 2) END)
    ELSE COALESCE(adicao, 0) END,
  adicao_oe = CASE
    WHEN perto_oe_esf IS NOT NULL THEN (CASE WHEN longe_oe_esf IS NULL THEN NULL ELSE round(perto_oe_esf - longe_oe_esf, 2) END)
    ELSE COALESCE(adicao, 0) END;

-- So segue a regra se a adicao esta em 0..+4 de 0,25 em 0,25 e o cilindro/eixo de perto,
-- quando informados, sao os de longe. Senao: formato anterior, sem recalcular.
UPDATE receita_optica SET formato_anterior = CASE WHEN (
  adicao_od IS NOT NULL AND adicao_od >= 0 AND adicao_od <= 4 AND abs(adicao_od * 4 - round(adicao_od * 4)) < 0.000001
  AND adicao_oe IS NOT NULL AND adicao_oe >= 0 AND adicao_oe <= 4 AND abs(adicao_oe * 4 - round(adicao_oe * 4)) < 0.000001
  AND (perto_od_cil IS NULL OR perto_od_cil = longe_od_cil)
  AND (perto_od_eixo IS NULL OR perto_od_eixo = longe_od_eixo)
  AND (perto_oe_cil IS NULL OR perto_oe_cil = longe_oe_cil)
  AND (perto_oe_eixo IS NULL OR perto_oe_eixo = longe_oe_eixo)
) THEN 0 ELSE 1 END;

UPDATE receita_optica SET adicao_od = NULL, adicao_oe = NULL WHERE formato_anterior = 1;

-- Armacao: o texto livre de antes vira o modelo. Prisma: ja nasce 0 / "Nenhum" (default das colunas).
UPDATE receita_optica SET armacao_modelo = armacao WHERE armacao IS NOT NULL AND trim(armacao) <> '';

-- DP = DNP direito + DNP esquerdo, quando ha os dois lados.
UPDATE receita_optica SET
  dp_longe = CASE WHEN longe_od_dnp IS NOT NULL AND longe_oe_dnp IS NOT NULL THEN round(longe_od_dnp + longe_oe_dnp, 1) END,
  dp_perto = CASE WHEN perto_od_dnp IS NOT NULL AND perto_oe_dnp IS NOT NULL THEN round(perto_od_dnp + perto_oe_dnp, 1) END;

-- ------------------------------------------------------------------- listas
-- Tipo de lente: entra Ocupacional.
INSERT OR IGNORE INTO lista_valor (tipo, valor, ordem) VALUES ('tipo_lente', 'OCUPACIONAL', 4);

-- Tratamentos: "FILTRO AZUL" passa a se chamar "ANTIRREFLEXO BLUE" (mesmo tratamento; pedido da otica),
-- do mesmo jeito que o ENDURECEDOR virou ANTIRRISCO. As prescricoes ja gravadas nao mudam.
DELETE FROM lista_valor
 WHERE tipo = 'tratamento_lente' AND valor = 'FILTRO AZUL' COLLATE NOCASE
   AND EXISTS (SELECT 1 FROM lista_valor WHERE tipo = 'tratamento_lente' AND valor = 'ANTIRREFLEXO BLUE' COLLATE NOCASE);
UPDATE lista_valor SET valor = 'ANTIRREFLEXO BLUE'
 WHERE tipo = 'tratamento_lente' AND valor = 'FILTRO AZUL' COLLATE NOCASE;

INSERT OR IGNORE INTO lista_valor (tipo, valor, ordem) VALUES
  ('tratamento_lente', 'ANTIRRISCO', 1),
  ('tratamento_lente', 'ANTIRREFLEXO', 2),
  ('tratamento_lente', 'ANTIRREFLEXO BLUE', 3),
  ('tratamento_lente', 'FOTOSSENSÍVEL', 4),
  ('tratamento_lente', 'COLORAÇÃO', 5),
  ('tratamento_lente', 'COLORAÇÃO DEGRADÊ', 6);
-- Ordem pedida: Antirrisco, Antirreflexo, Antirreflexo Blue, Fotossensivel, Coloracao, Coloracao Degrade.
UPDATE lista_valor SET ordem = 1 WHERE tipo = 'tratamento_lente' AND valor = 'ANTIRRISCO';
UPDATE lista_valor SET ordem = 2 WHERE tipo = 'tratamento_lente' AND valor = 'ANTIRREFLEXO';
UPDATE lista_valor SET ordem = 3 WHERE tipo = 'tratamento_lente' AND valor = 'ANTIRREFLEXO BLUE';
UPDATE lista_valor SET ordem = 4 WHERE tipo = 'tratamento_lente' AND valor = 'FOTOSSENSÍVEL';
UPDATE lista_valor SET ordem = 5 WHERE tipo = 'tratamento_lente' AND valor = 'COLORAÇÃO';
UPDATE lista_valor SET ordem = 6 WHERE tipo = 'tratamento_lente' AND valor = 'COLORAÇÃO DEGRADÊ';

-- Indice de refracao (lista fixa, facil de estender: basta uma linha nova aqui ou na tabela).
INSERT OR IGNORE INTO lista_valor (tipo, valor, ordem) VALUES
  ('indice_refracao', '1,49', 1),
  ('indice_refracao', '1,56', 2),
  ('indice_refracao', '1,59', 3),
  ('indice_refracao', '1,60', 4),
  ('indice_refracao', '1,61', 5),
  ('indice_refracao', '1,67', 6),
  ('indice_refracao', '1,74', 7);

-- Tipo de armacao, na ordem pedida.
INSERT OR IGNORE INTO lista_valor (tipo, valor, ordem) VALUES
  ('tipo_armacao', 'ACETATO', 1),
  ('tipo_armacao', 'ACETATO COM NYLON', 2),
  ('tipo_armacao', 'ESPECIAL SPORT', 3),
  ('tipo_armacao', 'FIO DE AÇO', 4),
  ('tipo_armacao', 'FURADA', 5),
  ('tipo_armacao', 'METAL', 6),
  ('tipo_armacao', 'METAL COM NYLON', 7),
  ('tipo_armacao', 'NATAÇÃO', 8),
  ('tipo_armacao', 'ÓCULOS DE SEGURANÇA', 9),
  ('tipo_armacao', 'SOLAR ACETATO', 10),
  ('tipo_armacao', 'SOLAR METAL', 11),
  ('tipo_armacao', 'SOLAR NYLON', 12);
