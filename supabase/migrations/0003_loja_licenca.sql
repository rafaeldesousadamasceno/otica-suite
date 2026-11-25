-- Amarra a loja à licença que a registrou (usado pela Edge Function `pc-token`).
--
-- SEGURANÇA: o id da loja é o empresa.uuid do SQLite, que o PC escolhe. Sem esta amarração, quem tivesse uma
-- licença válida qualquer poderia mandar o id de OUTRA loja e se passar por ela. Na primeira vez a função
-- grava o cliente da licença; depois só aceita a mesma licença (mesmo `cliente`).
alter table optialeph.loja
  add column if not exists licenca_cliente text;

comment on column optialeph.loja.licenca_cliente is
  'Campo `cliente` da licença que registrou a loja. Só a Edge Function (service_role) grava; nunca é exposto ao celular.';

-- O celular lê `loja` (policy loja_select_celular) mas não precisa ver o cliente da licença: GRANT por coluna.
revoke select on optialeph.loja from authenticated;
grant select (id, nome, cnpj, plano, sincronizacao_ligada, created_at, updated_at) on optialeph.loja to authenticated;
