-- RF-08, CA2: liga/desliga a exigencia de autorizacao de Admin para vender
-- um item sem saldo suficiente. Comeca desligada (0) para preservar o
-- comportamento atual (venda pode deixar saldo negativo) ate a otica optar
-- por ligar, na tela de Configuracoes.
INSERT INTO configuracao (chave, valor, tipo) VALUES
  ('estoque_bloqueia_venda_sem_saldo', '0', 'booleano');
