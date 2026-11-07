-- Receita optica: DP (distancia pupilar) por olho, para longe e para perto,
-- no mesmo padrao do DNP (pedido da otica). Todas as colunas sao nulas e sem
-- default: as receitas que ja existem ficam exatamente como estao.
--
-- `altura` (valor unico, 001_init.sql) passa a ser LEGADO: a coluna continua
-- no banco com o que ja foi gravado, mas nao aparece mais no formulario, no
-- card nem no PDF.
ALTER TABLE receita_optica ADD COLUMN longe_od_dp REAL;
ALTER TABLE receita_optica ADD COLUMN longe_oe_dp REAL;
ALTER TABLE receita_optica ADD COLUMN perto_od_dp REAL;
ALTER TABLE receita_optica ADD COLUMN perto_oe_dp REAL;
