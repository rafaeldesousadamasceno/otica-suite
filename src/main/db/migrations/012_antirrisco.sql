-- Tratamento de lente: "ENDURECEDOR" passa a se chamar "ANTIRRISCO" (pedido da
-- otica: e o mesmo tratamento, so que com o nome que o balcao usa).
--
-- So a LISTA de opcoes muda. As receitas que ja foram gravadas com ENDURECEDOR
-- ficam exatamente como estao (sao um registro do que foi pedido ao laboratorio);
-- ao editar uma delas o valor antigo continua aparecendo marcado.
--
-- Se a otica ja tinha cadastrado ANTIRRISCO por conta propria, o nome novo ja
-- existe (a lista nao aceita repetido): nesse caso so retira o ENDURECEDOR.
DELETE FROM lista_valor
 WHERE tipo = 'tratamento_lente'
   AND valor = 'ENDURECEDOR' COLLATE NOCASE
   AND EXISTS (SELECT 1 FROM lista_valor WHERE tipo = 'tratamento_lente' AND valor = 'ANTIRRISCO' COLLATE NOCASE);

UPDATE lista_valor SET valor = 'ANTIRRISCO'
 WHERE tipo = 'tratamento_lente' AND valor = 'ENDURECEDOR' COLLATE NOCASE;
