-- Painel gerencial: lucro bruto com o custo da EPOCA da venda e indices para as
-- consultas por periodo.
--
-- `custo_unitario_centavos` guarda o custo do produto no momento da venda
-- (preenchido nas vendas novas). Fica NULO em tudo que ja existe: sem
-- backfill, porque o custo antigo nao e conhecido - as consultas usam o custo
-- atual do produto como alternativa, exatamente como o Lucro/Prejuizo ja fazia,
-- e deixam de fora itens sem custo conhecido (servico importado, produto
-- removido, custo zerado).
ALTER TABLE venda_item ADD COLUMN custo_unitario_centavos INTEGER;

CREATE INDEX idx_venda_item_venda ON venda_item(venda_id);
CREATE INDEX idx_venda_pagamento_venda ON venda_pagamento(venda_id);
CREATE INDEX idx_recebimento_conta ON recebimento(conta_receber_id);
CREATE INDEX idx_pagamento_conta ON pagamento(conta_pagar_id);
CREATE INDEX idx_comissao_venda ON comissao(venda_id);
CREATE INDEX idx_venda_cliente_data ON venda(cliente_id, data);
