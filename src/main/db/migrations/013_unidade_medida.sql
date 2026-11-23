-- Unidade de medida do produto: deixa de ser texto livre e passa a ser escolhida
-- de uma lista que a otica pode ampliar. A lista mora em lista_valor, como as
-- demais: `valor` e a SIGLA (o que fica gravado no produto) e a coluna nova
-- `descricao` diz o que ela significa ("CX" = "CAIXA"). As outras listas nao
-- usam a descricao e continuam como estao.
ALTER TABLE lista_valor ADD COLUMN descricao TEXT;

INSERT OR IGNORE INTO lista_valor (tipo, valor, descricao, ordem) VALUES
  ('unidade_medida', 'UN', 'UNIDADE', 1),
  ('unidade_medida', 'PAR', 'PAR', 2),
  ('unidade_medida', 'CX', 'CAIXA', 3),
  ('unidade_medida', 'KIT', 'KIT', 4);

-- Produtos ja cadastrados: como o campo era livre, "un" e "UN" eram a mesma
-- unidade digitada de jeitos diferentes. A sigla fica em maiusculas e sem
-- espacos nas pontas; vazio vira UN (o padrao do sistema).
UPDATE produto SET unidade = 'UN' WHERE trim(unidade) = '';
UPDATE produto SET unidade = upper(trim(unidade)) WHERE unidade <> upper(trim(unidade));

-- Sigla em uso que nao e uma das quatro acima (ex.: "FR") entra na lista, para
-- continuar aparecendo como opcao ao editar o produto. A descricao fica em
-- branco ate a otica preencher na tela de unidades.
INSERT INTO lista_valor (tipo, valor, ordem)
SELECT 'unidade_medida', unidade, 4 + ROW_NUMBER() OVER (ORDER BY unidade)
  FROM (SELECT DISTINCT unidade FROM produto)
 WHERE unidade NOT IN (SELECT valor FROM lista_valor WHERE tipo = 'unidade_medida');
