-- GERADO por scripts/gerar-espelho-supabase.mjs a partir de src/main/sync/tabelasSincronizaveis.ts.
-- NAO EDITE A MAO: rode "node scripts/gerar-espelho-supabase.mjs" e confira com "npm test".
--
-- Espelho da loja na nuvem (docs/Arquitetura-Sincronizacao.md). Depende de 0001_controle.sql
-- (schema optialeph, tabela loja e funcao lojas_do_usuario). Sem chave estrangeira entre tabelas
-- do espelho: os lotes chegam fora de ordem e a integridade e a do SQLite do PC.

-- ---------------------------------------------------------------- empresa
CREATE TABLE optialeph."empresa" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "nome_fantasia" text NOT NULL,
  "razao_social" text,
  "cnpj" text,
  "ie" text,
  "logradouro" text,
  "numero" text,
  "complemento" text,
  "bairro" text,
  "cidade" text,
  "uf" text,
  "cep" text,
  "telefone" text,
  "whatsapp" text,
  "email" text,
  "site" text,
  "logo_path" text,
  "cor_destaque" text NOT NULL,
  "tema" text NOT NULL,
  "criado_em" text NOT NULL,
  "logo_formato" text NOT NULL,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_empresa_sync_rev" ON optialeph."empresa" (loja_id, sync_rev);

ALTER TABLE optialeph."empresa" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "empresa_leitura" ON optialeph."empresa" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "empresa_escrita_pc" ON optialeph."empresa" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."empresa" TO authenticated;
GRANT ALL ON optialeph."empresa" TO service_role;

-- ---------------------------------------------------------------- configuracao
CREATE TABLE optialeph."configuracao" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "chave" text,
  "valor" text NOT NULL,
  "tipo" text NOT NULL,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_configuracao_sync_rev" ON optialeph."configuracao" (loja_id, sync_rev);

ALTER TABLE optialeph."configuracao" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "configuracao_leitura" ON optialeph."configuracao" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "configuracao_escrita_pc" ON optialeph."configuracao" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."configuracao" TO authenticated;
GRANT ALL ON optialeph."configuracao" TO service_role;

-- ---------------------------------------------------------------- usuario
CREATE TABLE optialeph."usuario" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "nome" text NOT NULL,
  "login" text NOT NULL,
  "perfil" text NOT NULL,
  "ativo" bigint NOT NULL,
  "deve_trocar_senha" bigint NOT NULL,
  "criado_em" text NOT NULL,
  "atualizado_em" text,
  sync_rev    bigint NOT NULL DEFAULT 0,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_usuario_sync_rev" ON optialeph."usuario" (loja_id, sync_rev);

ALTER TABLE optialeph."usuario" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "usuario_leitura" ON optialeph."usuario" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "usuario_escrita_pc" ON optialeph."usuario" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."usuario" TO authenticated;
GRANT ALL ON optialeph."usuario" TO service_role;

-- ---------------------------------------------------------------- lista_valor
CREATE TABLE optialeph."lista_valor" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "tipo" text NOT NULL,
  "valor" text NOT NULL,
  "ordem" bigint NOT NULL,
  "ativo" bigint NOT NULL,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  "descricao" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_lista_valor_sync_rev" ON optialeph."lista_valor" (loja_id, sync_rev);

ALTER TABLE optialeph."lista_valor" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "lista_valor_leitura" ON optialeph."lista_valor" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "lista_valor_escrita_pc" ON optialeph."lista_valor" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."lista_valor" TO authenticated;
GRANT ALL ON optialeph."lista_valor" TO service_role;

-- ---------------------------------------------------------------- profissional
CREATE TABLE optialeph."profissional" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "nome" text NOT NULL,
  "registro" text,
  "tipo" text,
  "ativo" bigint NOT NULL,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_profissional_sync_rev" ON optialeph."profissional" (loja_id, sync_rev);

ALTER TABLE optialeph."profissional" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "profissional_leitura" ON optialeph."profissional" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "profissional_escrita_pc" ON optialeph."profissional" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."profissional" TO authenticated;
GRANT ALL ON optialeph."profissional" TO service_role;

-- ---------------------------------------------------------------- laboratorio
CREATE TABLE optialeph."laboratorio" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "nome" text NOT NULL,
  "razao_social" text,
  "cnpj" text,
  "telefone" text,
  "whatsapp" text,
  "email" text,
  "endereco" text,
  "contato_responsavel" text,
  "prazo_medio_dias" bigint,
  "observacoes" text,
  "ativo" bigint NOT NULL,
  "excluido_em" text,
  "excluido_motivo" text,
  "criado_em" text NOT NULL,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_laboratorio_sync_rev" ON optialeph."laboratorio" (loja_id, sync_rev);

ALTER TABLE optialeph."laboratorio" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "laboratorio_leitura" ON optialeph."laboratorio" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "laboratorio_escrita_pc" ON optialeph."laboratorio" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."laboratorio" TO authenticated;
GRANT ALL ON optialeph."laboratorio" TO service_role;

-- ---------------------------------------------------------------- forma_pagamento
CREATE TABLE optialeph."forma_pagamento" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "nome" text NOT NULL,
  "tipo" text NOT NULL,
  "ordem" bigint NOT NULL,
  "ativo" bigint NOT NULL,
  "max_parcelas" bigint,
  "intervalo_dias" bigint NOT NULL,
  "acrescimo_tipo" text,
  "acrescimo_valor" bigint NOT NULL,
  "excluido_em" text,
  "excluido_motivo" text,
  "criado_em" text NOT NULL,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_forma_pagamento_sync_rev" ON optialeph."forma_pagamento" (loja_id, sync_rev);

ALTER TABLE optialeph."forma_pagamento" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "forma_pagamento_leitura" ON optialeph."forma_pagamento" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "forma_pagamento_escrita_pc" ON optialeph."forma_pagamento" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."forma_pagamento" TO authenticated;
GRANT ALL ON optialeph."forma_pagamento" TO service_role;

-- ---------------------------------------------------------------- bandeira
CREATE TABLE optialeph."bandeira" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "nome" text NOT NULL,
  "adquirente" text,
  "aceita_debito" bigint NOT NULL,
  "aceita_credito" bigint NOT NULL,
  "debito_taxa_bp" bigint,
  "debito_prazo_dias" bigint,
  "ativo" bigint NOT NULL,
  "excluido_em" text,
  "excluido_motivo" text,
  "criado_em" text NOT NULL,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_bandeira_sync_rev" ON optialeph."bandeira" (loja_id, sync_rev);

ALTER TABLE optialeph."bandeira" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "bandeira_leitura" ON optialeph."bandeira" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "bandeira_escrita_pc" ON optialeph."bandeira" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."bandeira" TO authenticated;
GRANT ALL ON optialeph."bandeira" TO service_role;

-- ---------------------------------------------------------------- bandeira_faixa
CREATE TABLE optialeph."bandeira_faixa" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "bandeira_uuid" uuid NOT NULL,
  "parcelas" bigint NOT NULL,
  "taxa_bp" bigint NOT NULL,
  "prazo_dias" bigint NOT NULL,
  "desconto_cliente_bp" bigint NOT NULL,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_bandeira_faixa_sync_rev" ON optialeph."bandeira_faixa" (loja_id, sync_rev);
CREATE INDEX "idx_bandeira_faixa_bandeira_uuid" ON optialeph."bandeira_faixa" (loja_id, "bandeira_uuid");

ALTER TABLE optialeph."bandeira_faixa" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "bandeira_faixa_leitura" ON optialeph."bandeira_faixa" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "bandeira_faixa_escrita_pc" ON optialeph."bandeira_faixa" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."bandeira_faixa" TO authenticated;
GRANT ALL ON optialeph."bandeira_faixa" TO service_role;

-- ---------------------------------------------------------------- cliente
CREATE TABLE optialeph."cliente" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "nome" text NOT NULL,
  "data_nasc" text,
  "cpf" text,
  "rg" text,
  "celular" text,
  "telefone" text,
  "email" text,
  "logradouro" text,
  "numero" text,
  "complemento" text,
  "bairro" text,
  "cidade" text,
  "uf" text,
  "cep" text,
  "profissao" text,
  "indicado_por" text,
  "observacao" text,
  "ativo" bigint NOT NULL,
  "criado_em" text NOT NULL,
  "criado_por_uuid" uuid,
  "atualizado_em" text,
  "atualizado_por_uuid" uuid,
  "aceita_contato" bigint NOT NULL,
  sync_rev    bigint NOT NULL DEFAULT 0,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_cliente_sync_rev" ON optialeph."cliente" (loja_id, sync_rev);
CREATE INDEX "idx_cliente_atualizado_por_uuid" ON optialeph."cliente" (loja_id, "atualizado_por_uuid");
CREATE INDEX "idx_cliente_criado_por_uuid" ON optialeph."cliente" (loja_id, "criado_por_uuid");

ALTER TABLE optialeph."cliente" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "cliente_leitura" ON optialeph."cliente" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "cliente_escrita_pc" ON optialeph."cliente" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."cliente" TO authenticated;
GRANT ALL ON optialeph."cliente" TO service_role;

-- ---------------------------------------------------------------- receita_optica
CREATE TABLE optialeph."receita_optica" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "cliente_uuid" uuid NOT NULL,
  "profissional_uuid" uuid,
  "data_exame" text NOT NULL,
  "longe_od_esf" double precision,
  "longe_od_cil" double precision,
  "longe_od_eixo" bigint,
  "longe_od_dnp" double precision,
  "longe_oe_esf" double precision,
  "longe_oe_cil" double precision,
  "longe_oe_eixo" bigint,
  "longe_oe_dnp" double precision,
  "perto_od_esf" double precision,
  "perto_od_cil" double precision,
  "perto_od_eixo" bigint,
  "perto_od_dnp" double precision,
  "perto_oe_esf" double precision,
  "perto_oe_cil" double precision,
  "perto_oe_eixo" bigint,
  "perto_oe_dnp" double precision,
  "adicao" double precision,
  "altura" double precision,
  "tipo_lente" text,
  "tratamentos" text,
  "armacao" text,
  "observacao" text,
  "versao" bigint NOT NULL,
  "substituida_por_uuid" uuid,
  "criado_em" text NOT NULL,
  "criado_por_uuid" uuid,
  "longe_od_dp" double precision,
  "longe_oe_dp" double precision,
  "perto_od_dp" double precision,
  "perto_oe_dp" double precision,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  "longe_od_alt" double precision,
  "longe_oe_alt" double precision,
  "longe_od_prisma" double precision NOT NULL,
  "longe_oe_prisma" double precision NOT NULL,
  "longe_od_base_prisma" text NOT NULL,
  "longe_oe_base_prisma" text NOT NULL,
  "adicao_od" double precision,
  "adicao_oe" double precision,
  "indice_refracao" text,
  "armacao_tipo" text,
  "armacao_modelo" text,
  "armacao_marca" text,
  "armacao_cor" text,
  "ponte" double precision,
  "horizontal" double precision,
  "vertical" double precision,
  "diagonal_maior" double precision,
  "dp_longe" double precision,
  "dp_perto" double precision,
  "formato_anterior" bigint NOT NULL,
  "excluido_em" text,
  "excluido_motivo" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_receita_optica_sync_rev" ON optialeph."receita_optica" (loja_id, sync_rev);
CREATE INDEX "idx_receita_optica_criado_por_uuid" ON optialeph."receita_optica" (loja_id, "criado_por_uuid");
CREATE INDEX "idx_receita_optica_substituida_por_uuid" ON optialeph."receita_optica" (loja_id, "substituida_por_uuid");
CREATE INDEX "idx_receita_optica_profissional_uuid" ON optialeph."receita_optica" (loja_id, "profissional_uuid");
CREATE INDEX "idx_receita_optica_cliente_uuid" ON optialeph."receita_optica" (loja_id, "cliente_uuid");

ALTER TABLE optialeph."receita_optica" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "receita_optica_leitura" ON optialeph."receita_optica" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "receita_optica_escrita_pc" ON optialeph."receita_optica" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."receita_optica" TO authenticated;
GRANT ALL ON optialeph."receita_optica" TO service_role;

-- ---------------------------------------------------------------- contato
CREATE TABLE optialeph."contato" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "cliente_uuid" uuid NOT NULL,
  "motivo" text NOT NULL,
  "referencia" text NOT NULL,
  "observacao" text,
  "usuario_uuid" uuid,
  "criado_em" text NOT NULL,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_contato_sync_rev" ON optialeph."contato" (loja_id, sync_rev);
CREATE INDEX "idx_contato_usuario_uuid" ON optialeph."contato" (loja_id, "usuario_uuid");
CREATE INDEX "idx_contato_cliente_uuid" ON optialeph."contato" (loja_id, "cliente_uuid");

ALTER TABLE optialeph."contato" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "contato_leitura" ON optialeph."contato" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "contato_escrita_pc" ON optialeph."contato" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."contato" TO authenticated;
GRANT ALL ON optialeph."contato" TO service_role;

-- ---------------------------------------------------------------- produto
CREATE TABLE optialeph."produto" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "codigo" text,
  "codigo_barras" text,
  "descricao" text NOT NULL,
  "categoria" text NOT NULL,
  "marca" text,
  "modelo" text,
  "cor" text,
  "tamanho" text,
  "unidade" text NOT NULL,
  "custo_centavos" bigint NOT NULL,
  "margem" double precision NOT NULL,
  "preco_venda_centavos" bigint NOT NULL,
  "estoque_minimo" bigint NOT NULL,
  "foto_path" text,
  "ativo" bigint NOT NULL,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_produto_sync_rev" ON optialeph."produto" (loja_id, sync_rev);

ALTER TABLE optialeph."produto" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "produto_leitura" ON optialeph."produto" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "produto_escrita_pc" ON optialeph."produto" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."produto" TO authenticated;
GRANT ALL ON optialeph."produto" TO service_role;

-- ---------------------------------------------------------------- produto_lente
CREATE TABLE optialeph."produto_lente" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "produto_uuid" uuid,
  "material" text,
  "indice" double precision,
  "tipo" text,
  "grau_min" double precision,
  "grau_max" double precision,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_produto_lente_sync_rev" ON optialeph."produto_lente" (loja_id, sync_rev);
CREATE INDEX "idx_produto_lente_produto_uuid" ON optialeph."produto_lente" (loja_id, "produto_uuid");

ALTER TABLE optialeph."produto_lente" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "produto_lente_leitura" ON optialeph."produto_lente" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "produto_lente_escrita_pc" ON optialeph."produto_lente" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."produto_lente" TO authenticated;
GRANT ALL ON optialeph."produto_lente" TO service_role;

-- ---------------------------------------------------------------- fornecedor
CREATE TABLE optialeph."fornecedor" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "razao_social" text NOT NULL,
  "cnpj" text,
  "contato" text,
  "telefone" text,
  "email" text,
  "prazo_entrega_dias" bigint,
  "ativo" bigint NOT NULL,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_fornecedor_sync_rev" ON optialeph."fornecedor" (loja_id, sync_rev);

ALTER TABLE optialeph."fornecedor" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "fornecedor_leitura" ON optialeph."fornecedor" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "fornecedor_escrita_pc" ON optialeph."fornecedor" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."fornecedor" TO authenticated;
GRANT ALL ON optialeph."fornecedor" TO service_role;

-- ---------------------------------------------------------------- compra
CREATE TABLE optialeph."compra" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "fornecedor_uuid" uuid,
  "data" text NOT NULL,
  "numero_nf" text,
  "valor_total_centavos" bigint NOT NULL,
  "situacao" text NOT NULL,
  "usuario_uuid" uuid,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_compra_sync_rev" ON optialeph."compra" (loja_id, sync_rev);
CREATE INDEX "idx_compra_usuario_uuid" ON optialeph."compra" (loja_id, "usuario_uuid");
CREATE INDEX "idx_compra_fornecedor_uuid" ON optialeph."compra" (loja_id, "fornecedor_uuid");

ALTER TABLE optialeph."compra" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "compra_leitura" ON optialeph."compra" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "compra_escrita_pc" ON optialeph."compra" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."compra" TO authenticated;
GRANT ALL ON optialeph."compra" TO service_role;

-- ---------------------------------------------------------------- compra_item
CREATE TABLE optialeph."compra_item" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "compra_uuid" uuid NOT NULL,
  "produto_uuid" uuid NOT NULL,
  "quantidade" bigint NOT NULL,
  "custo_unitario_centavos" bigint NOT NULL,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_compra_item_sync_rev" ON optialeph."compra_item" (loja_id, sync_rev);
CREATE INDEX "idx_compra_item_produto_uuid" ON optialeph."compra_item" (loja_id, "produto_uuid");
CREATE INDEX "idx_compra_item_compra_uuid" ON optialeph."compra_item" (loja_id, "compra_uuid");

ALTER TABLE optialeph."compra_item" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "compra_item_leitura" ON optialeph."compra_item" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "compra_item_escrita_pc" ON optialeph."compra_item" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."compra_item" TO authenticated;
GRANT ALL ON optialeph."compra_item" TO service_role;

-- ---------------------------------------------------------------- estoque_movimento
CREATE TABLE optialeph."estoque_movimento" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "produto_uuid" uuid NOT NULL,
  "tipo" text NOT NULL,
  "quantidade" bigint NOT NULL,
  "saldo_apos" bigint NOT NULL,
  "documento_tipo" text,
  "documento_id" bigint,
  "motivo" text,
  "data_hora" text NOT NULL,
  "usuario_uuid" uuid,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_estoque_movimento_sync_rev" ON optialeph."estoque_movimento" (loja_id, sync_rev);
CREATE INDEX "idx_estoque_movimento_usuario_uuid" ON optialeph."estoque_movimento" (loja_id, "usuario_uuid");
CREATE INDEX "idx_estoque_movimento_produto_uuid" ON optialeph."estoque_movimento" (loja_id, "produto_uuid");

ALTER TABLE optialeph."estoque_movimento" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "estoque_movimento_leitura" ON optialeph."estoque_movimento" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "estoque_movimento_escrita_pc" ON optialeph."estoque_movimento" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."estoque_movimento" TO authenticated;
GRANT ALL ON optialeph."estoque_movimento" TO service_role;

-- ---------------------------------------------------------------- venda
CREATE TABLE optialeph."venda" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "numero" text NOT NULL,
  "cliente_uuid" uuid,
  "vendedor_uuid" uuid,
  "receita_optica_uuid" uuid,
  "data" text NOT NULL,
  "subtotal_centavos" bigint NOT NULL,
  "desconto_centavos" bigint NOT NULL,
  "total_centavos" bigint NOT NULL,
  "situacao" text NOT NULL,
  "autorizado_por_uuid" uuid,
  "criado_em" text NOT NULL,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  "desconto_adicional_tipo" text NOT NULL,
  "desconto_adicional_valor" bigint NOT NULL,
  "desconto_adicional_centavos" bigint NOT NULL,
  "excluido_em" text,
  "excluido_motivo" text,
  "excluido_por_uuid" uuid,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_venda_sync_rev" ON optialeph."venda" (loja_id, sync_rev);
CREATE INDEX "idx_venda_excluido_por_uuid" ON optialeph."venda" (loja_id, "excluido_por_uuid");
CREATE INDEX "idx_venda_autorizado_por_uuid" ON optialeph."venda" (loja_id, "autorizado_por_uuid");
CREATE INDEX "idx_venda_receita_optica_uuid" ON optialeph."venda" (loja_id, "receita_optica_uuid");
CREATE INDEX "idx_venda_vendedor_uuid" ON optialeph."venda" (loja_id, "vendedor_uuid");
CREATE INDEX "idx_venda_cliente_uuid" ON optialeph."venda" (loja_id, "cliente_uuid");

ALTER TABLE optialeph."venda" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "venda_leitura" ON optialeph."venda" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "venda_escrita_pc" ON optialeph."venda" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."venda" TO authenticated;
GRANT ALL ON optialeph."venda" TO service_role;

-- ---------------------------------------------------------------- venda_item
CREATE TABLE optialeph."venda_item" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "venda_uuid" uuid NOT NULL,
  "produto_uuid" uuid,
  "descricao" text NOT NULL,
  "quantidade" bigint NOT NULL,
  "preco_unitario_centavos" bigint NOT NULL,
  "desconto_centavos" bigint NOT NULL,
  "total_centavos" bigint NOT NULL,
  "custo_unitario_centavos" bigint,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_venda_item_sync_rev" ON optialeph."venda_item" (loja_id, sync_rev);
CREATE INDEX "idx_venda_item_produto_uuid" ON optialeph."venda_item" (loja_id, "produto_uuid");
CREATE INDEX "idx_venda_item_venda_uuid" ON optialeph."venda_item" (loja_id, "venda_uuid");

ALTER TABLE optialeph."venda_item" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "venda_item_leitura" ON optialeph."venda_item" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "venda_item_escrita_pc" ON optialeph."venda_item" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."venda_item" TO authenticated;
GRANT ALL ON optialeph."venda_item" TO service_role;

-- ---------------------------------------------------------------- venda_pagamento
CREATE TABLE optialeph."venda_pagamento" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "venda_uuid" uuid NOT NULL,
  "forma_pagamento" text NOT NULL,
  "valor_centavos" bigint NOT NULL,
  "parcelas" bigint NOT NULL,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  "forma_pagamento_uuid" uuid,
  "forma_tipo" text,
  "comportamento" text,
  "bandeira_uuid" uuid,
  "bandeira_nome" text,
  "taxa_bp" bigint,
  "desconto_cliente_bp" bigint NOT NULL,
  "desconto_cliente_centavos" bigint NOT NULL,
  "bruto_centavos" bigint,
  "liquido_centavos" bigint,
  "data_prevista" text,
  "intervalo_dias" bigint,
  "acrescimo_tipo" text,
  "acrescimo_valor" bigint NOT NULL,
  "acrescimo_centavos" bigint NOT NULL,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_venda_pagamento_sync_rev" ON optialeph."venda_pagamento" (loja_id, sync_rev);
CREATE INDEX "idx_venda_pagamento_bandeira_uuid" ON optialeph."venda_pagamento" (loja_id, "bandeira_uuid");
CREATE INDEX "idx_venda_pagamento_forma_pagamento_uuid" ON optialeph."venda_pagamento" (loja_id, "forma_pagamento_uuid");
CREATE INDEX "idx_venda_pagamento_venda_uuid" ON optialeph."venda_pagamento" (loja_id, "venda_uuid");

ALTER TABLE optialeph."venda_pagamento" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "venda_pagamento_leitura" ON optialeph."venda_pagamento" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "venda_pagamento_escrita_pc" ON optialeph."venda_pagamento" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."venda_pagamento" TO authenticated;
GRANT ALL ON optialeph."venda_pagamento" TO service_role;

-- ---------------------------------------------------------------- ordem_servico
CREATE TABLE optialeph."ordem_servico" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "numero" text NOT NULL,
  "venda_uuid" uuid,
  "cliente_uuid" uuid NOT NULL,
  "receita_optica_uuid" uuid,
  "laboratorio" text,
  "situacao" text NOT NULL,
  "data_abertura" text NOT NULL,
  "data_envio" text,
  "data_previsao" text,
  "data_chegada" text,
  "data_entrega" text,
  "observacao" text,
  "criado_por_uuid" uuid,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  "laboratorio_uuid" uuid,
  "entregador_nome" text,
  "entregador_contato" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_ordem_servico_sync_rev" ON optialeph."ordem_servico" (loja_id, sync_rev);
CREATE INDEX "idx_ordem_servico_laboratorio_uuid" ON optialeph."ordem_servico" (loja_id, "laboratorio_uuid");
CREATE INDEX "idx_ordem_servico_criado_por_uuid" ON optialeph."ordem_servico" (loja_id, "criado_por_uuid");
CREATE INDEX "idx_ordem_servico_receita_optica_uuid" ON optialeph."ordem_servico" (loja_id, "receita_optica_uuid");
CREATE INDEX "idx_ordem_servico_cliente_uuid" ON optialeph."ordem_servico" (loja_id, "cliente_uuid");
CREATE INDEX "idx_ordem_servico_venda_uuid" ON optialeph."ordem_servico" (loja_id, "venda_uuid");

ALTER TABLE optialeph."ordem_servico" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "ordem_servico_leitura" ON optialeph."ordem_servico" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "ordem_servico_escrita_pc" ON optialeph."ordem_servico" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."ordem_servico" TO authenticated;
GRANT ALL ON optialeph."ordem_servico" TO service_role;

-- ---------------------------------------------------------------- comissao
CREATE TABLE optialeph."comissao" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "venda_uuid" uuid NOT NULL,
  "vendedor_uuid" uuid NOT NULL,
  "base_centavos" bigint NOT NULL,
  "percentual" double precision NOT NULL,
  "valor_centavos" bigint NOT NULL,
  "situacao" text NOT NULL,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_comissao_sync_rev" ON optialeph."comissao" (loja_id, sync_rev);
CREATE INDEX "idx_comissao_vendedor_uuid" ON optialeph."comissao" (loja_id, "vendedor_uuid");
CREATE INDEX "idx_comissao_venda_uuid" ON optialeph."comissao" (loja_id, "venda_uuid");

ALTER TABLE optialeph."comissao" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "comissao_leitura" ON optialeph."comissao" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "comissao_escrita_pc" ON optialeph."comissao" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."comissao" TO authenticated;
GRANT ALL ON optialeph."comissao" TO service_role;

-- ---------------------------------------------------------------- conta_receber
CREATE TABLE optialeph."conta_receber" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "venda_uuid" uuid,
  "cliente_uuid" uuid,
  "parcela" bigint NOT NULL,
  "total_parcelas" bigint NOT NULL,
  "valor_centavos" bigint NOT NULL,
  "vencimento" text NOT NULL,
  "situacao" text NOT NULL,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  "tipo" text NOT NULL,
  "venda_pagamento_uuid" uuid,
  "bandeira_nome" text,
  "operadora_parcelas" bigint,
  "taxa_bp" bigint,
  "bruto_centavos" bigint,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_conta_receber_sync_rev" ON optialeph."conta_receber" (loja_id, sync_rev);
CREATE INDEX "idx_conta_receber_venda_pagamento_uuid" ON optialeph."conta_receber" (loja_id, "venda_pagamento_uuid");
CREATE INDEX "idx_conta_receber_cliente_uuid" ON optialeph."conta_receber" (loja_id, "cliente_uuid");
CREATE INDEX "idx_conta_receber_venda_uuid" ON optialeph."conta_receber" (loja_id, "venda_uuid");

ALTER TABLE optialeph."conta_receber" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "conta_receber_leitura" ON optialeph."conta_receber" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "conta_receber_escrita_pc" ON optialeph."conta_receber" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."conta_receber" TO authenticated;
GRANT ALL ON optialeph."conta_receber" TO service_role;

-- ---------------------------------------------------------------- recebimento
CREATE TABLE optialeph."recebimento" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "conta_receber_uuid" uuid NOT NULL,
  "valor_centavos" bigint NOT NULL,
  "data" text NOT NULL,
  "forma_pagamento" text,
  "usuario_uuid" uuid,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_recebimento_sync_rev" ON optialeph."recebimento" (loja_id, sync_rev);
CREATE INDEX "idx_recebimento_usuario_uuid" ON optialeph."recebimento" (loja_id, "usuario_uuid");
CREATE INDEX "idx_recebimento_conta_receber_uuid" ON optialeph."recebimento" (loja_id, "conta_receber_uuid");

ALTER TABLE optialeph."recebimento" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "recebimento_leitura" ON optialeph."recebimento" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "recebimento_escrita_pc" ON optialeph."recebimento" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."recebimento" TO authenticated;
GRANT ALL ON optialeph."recebimento" TO service_role;

-- ---------------------------------------------------------------- conta_pagar
CREATE TABLE optialeph."conta_pagar" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "compra_uuid" uuid,
  "fornecedor_uuid" uuid,
  "descricao" text NOT NULL,
  "categoria" text,
  "valor_centavos" bigint NOT NULL,
  "vencimento" text NOT NULL,
  "situacao" text NOT NULL,
  "recorrente" bigint NOT NULL,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  "recorrencia_uuid" uuid,
  "competencia" text,
  "excluido_em" text,
  "excluido_motivo" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_conta_pagar_sync_rev" ON optialeph."conta_pagar" (loja_id, sync_rev);
CREATE INDEX "idx_conta_pagar_recorrencia_uuid" ON optialeph."conta_pagar" (loja_id, "recorrencia_uuid");
CREATE INDEX "idx_conta_pagar_fornecedor_uuid" ON optialeph."conta_pagar" (loja_id, "fornecedor_uuid");
CREATE INDEX "idx_conta_pagar_compra_uuid" ON optialeph."conta_pagar" (loja_id, "compra_uuid");

ALTER TABLE optialeph."conta_pagar" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "conta_pagar_leitura" ON optialeph."conta_pagar" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "conta_pagar_escrita_pc" ON optialeph."conta_pagar" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."conta_pagar" TO authenticated;
GRANT ALL ON optialeph."conta_pagar" TO service_role;

-- ---------------------------------------------------------------- recorrencia
CREATE TABLE optialeph."recorrencia" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "descricao" text NOT NULL,
  "categoria" text,
  "fornecedor_uuid" uuid,
  "frequencia" text NOT NULL,
  "dia_vencimento" bigint NOT NULL,
  "data_inicio" text NOT NULL,
  "data_fim" text,
  "status" text NOT NULL,
  "criado_em" text NOT NULL,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_recorrencia_sync_rev" ON optialeph."recorrencia" (loja_id, sync_rev);
CREATE INDEX "idx_recorrencia_fornecedor_uuid" ON optialeph."recorrencia" (loja_id, "fornecedor_uuid");

ALTER TABLE optialeph."recorrencia" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "recorrencia_leitura" ON optialeph."recorrencia" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "recorrencia_escrita_pc" ON optialeph."recorrencia" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."recorrencia" TO authenticated;
GRANT ALL ON optialeph."recorrencia" TO service_role;

-- ---------------------------------------------------------------- recorrencia_valor
CREATE TABLE optialeph."recorrencia_valor" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "recorrencia_uuid" uuid NOT NULL,
  "valor_centavos" bigint NOT NULL,
  "vigente_desde" text NOT NULL,
  "criado_em" text NOT NULL,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_recorrencia_valor_sync_rev" ON optialeph."recorrencia_valor" (loja_id, sync_rev);
CREATE INDEX "idx_recorrencia_valor_recorrencia_uuid" ON optialeph."recorrencia_valor" (loja_id, "recorrencia_uuid");

ALTER TABLE optialeph."recorrencia_valor" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "recorrencia_valor_leitura" ON optialeph."recorrencia_valor" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "recorrencia_valor_escrita_pc" ON optialeph."recorrencia_valor" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."recorrencia_valor" TO authenticated;
GRANT ALL ON optialeph."recorrencia_valor" TO service_role;

-- ---------------------------------------------------------------- pagamento
CREATE TABLE optialeph."pagamento" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "conta_pagar_uuid" uuid NOT NULL,
  "valor_centavos" bigint NOT NULL,
  "data" text NOT NULL,
  "forma_pagamento" text,
  "usuario_uuid" uuid,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_pagamento_sync_rev" ON optialeph."pagamento" (loja_id, sync_rev);
CREATE INDEX "idx_pagamento_usuario_uuid" ON optialeph."pagamento" (loja_id, "usuario_uuid");
CREATE INDEX "idx_pagamento_conta_pagar_uuid" ON optialeph."pagamento" (loja_id, "conta_pagar_uuid");

ALTER TABLE optialeph."pagamento" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "pagamento_leitura" ON optialeph."pagamento" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "pagamento_escrita_pc" ON optialeph."pagamento" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."pagamento" TO authenticated;
GRANT ALL ON optialeph."pagamento" TO service_role;

-- ---------------------------------------------------------------- lancamento
CREATE TABLE optialeph."lancamento" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "tipo" text NOT NULL,
  "categoria" text,
  "descricao" text NOT NULL,
  "valor_centavos" bigint NOT NULL,
  "data" text NOT NULL,
  "origem_tipo" text,
  "origem_id" bigint,
  "usuario_uuid" uuid,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_lancamento_sync_rev" ON optialeph."lancamento" (loja_id, sync_rev);
CREATE INDEX "idx_lancamento_usuario_uuid" ON optialeph."lancamento" (loja_id, "usuario_uuid");

ALTER TABLE optialeph."lancamento" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "lancamento_leitura" ON optialeph."lancamento" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "lancamento_escrita_pc" ON optialeph."lancamento" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."lancamento" TO authenticated;
GRANT ALL ON optialeph."lancamento" TO service_role;

-- ---------------------------------------------------------------- caixa
CREATE TABLE optialeph."caixa" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "data_abertura" text NOT NULL,
  "data_fechamento" text,
  "saldo_inicial_centavos" bigint NOT NULL,
  "saldo_final_centavos" bigint,
  "usuario_abertura_uuid" uuid,
  "usuario_fechamento_uuid" uuid,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_caixa_sync_rev" ON optialeph."caixa" (loja_id, sync_rev);
CREATE INDEX "idx_caixa_usuario_fechamento_uuid" ON optialeph."caixa" (loja_id, "usuario_fechamento_uuid");
CREATE INDEX "idx_caixa_usuario_abertura_uuid" ON optialeph."caixa" (loja_id, "usuario_abertura_uuid");

ALTER TABLE optialeph."caixa" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "caixa_leitura" ON optialeph."caixa" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "caixa_escrita_pc" ON optialeph."caixa" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."caixa" TO authenticated;
GRANT ALL ON optialeph."caixa" TO service_role;

-- ---------------------------------------------------------------- auditoria
CREATE TABLE optialeph."auditoria" (
  loja_id     uuid   NOT NULL REFERENCES optialeph.loja(id) ON DELETE CASCADE,
  uuid        uuid   NOT NULL,
  "usuario_uuid" uuid,
  "autorizado_por_uuid" uuid,
  "acao" text NOT NULL,
  "entidade" text NOT NULL,
  "entidade_id" bigint,
  "valor_anterior" text,
  "valor_novo" text,
  "data_hora" text NOT NULL,
  sync_rev    bigint NOT NULL DEFAULT 0,
  "atualizado_em" text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (loja_id, uuid)
);
CREATE INDEX "idx_auditoria_sync_rev" ON optialeph."auditoria" (loja_id, sync_rev);
CREATE INDEX "idx_auditoria_autorizado_por_uuid" ON optialeph."auditoria" (loja_id, "autorizado_por_uuid");
CREATE INDEX "idx_auditoria_usuario_uuid" ON optialeph."auditoria" (loja_id, "usuario_uuid");

ALTER TABLE optialeph."auditoria" ENABLE ROW LEVEL SECURITY;
-- Celular e PC leem so as lojas de que sao membros.
CREATE POLICY "auditoria_leitura" ON optialeph."auditoria" FOR SELECT TO authenticated
  USING (loja_id IN (SELECT optialeph.lojas_do_usuario()));
-- Gravar so o PC executor da propria loja; o celular nunca grava no espelho. pc_autorizado confere o token e
-- consulta a tabela dispositivo: revogar o PC corta a escrita na hora, mesmo com o token ainda valido.
CREATE POLICY "auditoria_escrita_pc" ON optialeph."auditoria" FOR ALL TO authenticated
  USING (optialeph.pc_autorizado(loja_id))
  WITH CHECK (optialeph.pc_autorizado(loja_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON optialeph."auditoria" TO authenticated;
GRANT ALL ON optialeph."auditoria" TO service_role;
