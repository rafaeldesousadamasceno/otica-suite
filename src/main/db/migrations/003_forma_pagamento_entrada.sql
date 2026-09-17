-- Adiciona "ENTRADA" as formas de pagamento (RF-10): permite registrar o
-- valor pago na hora e financiar o restante em outra linha de pagamento
-- parcelada, na mesma venda. Ordem 0 para aparecer primeiro na lista -
-- e normalmente a primeira linha que se adiciona numa venda financiada.
INSERT INTO lista_valor (tipo, valor, ordem) VALUES
  ('forma_pagamento', 'ENTRADA', 0);
