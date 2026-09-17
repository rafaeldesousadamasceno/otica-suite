-- RF-01: formato do quadro da logo (circulo, quadrado com bordas
-- arredondadas ou quadrado reto), escolhido pela otica em Configuracoes -
-- aplicado onde quer que a logo apareca (barra lateral, login, impressos).
ALTER TABLE empresa ADD COLUMN logo_formato TEXT NOT NULL DEFAULT 'quadrado_arredondado';
