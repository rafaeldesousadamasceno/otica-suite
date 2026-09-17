-- Valores padrao das listas configuraveis (RF-01) e das opcoes operacionais.
-- Tudo aqui pode ser editado depois pela tela de Configuracoes; isto e
-- so o ponto de partida, preservando os valores do sistema anterior.

INSERT INTO lista_valor (tipo, valor, ordem) VALUES
  ('situacao_os', 'EM ABERTO', 1),
  ('situacao_os', 'LABORATÓRIO', 2),
  ('situacao_os', 'CHEGOU', 3),
  ('situacao_os', 'ENTREGUE', 4),
  ('situacao_os', 'CANCELADA', 5),
  ('forma_pagamento', 'À VISTA', 1),
  ('forma_pagamento', 'PIX', 2),
  ('forma_pagamento', 'CARTÃO', 3),
  ('forma_pagamento', 'PROMISSÓRIA', 4),
  ('tipo_lente', 'VISÃO SIMPLES', 1),
  ('tipo_lente', 'BIFOCAL', 2),
  ('tipo_lente', 'MULTIFOCAL', 3),
  ('tratamento_lente', 'ANTIRREFLEXO', 1),
  ('tratamento_lente', 'FOTOSSENSÍVEL', 2),
  ('tratamento_lente', 'FILTRO AZUL', 3),
  ('tratamento_lente', 'ENDURECEDOR', 4),
  ('laboratorio', 'LABORATÓRIO PRÓPRIO', 1),
  ('categoria_despesa', 'ALUGUEL', 1),
  ('categoria_despesa', 'ENERGIA', 2),
  ('categoria_despesa', 'ÁGUA', 3),
  ('categoria_despesa', 'SALÁRIOS', 4),
  ('categoria_despesa', 'MARKETING', 5),
  ('categoria_despesa', 'OUTRAS', 6);

INSERT INTO configuracao (chave, valor, tipo) VALUES
  ('limite_desconto_vendedor_pct', '10', 'numero'),
  ('comissao_padrao_pct', '3', 'numero'),
  ('dias_garantia', '90', 'numero'),
  ('sessao_expira_minutos', '30', 'numero'),
  ('prefixo_os', '', 'texto');
