-- Migracao inicial - schema completo do PRD (secao 10).
--
-- Todas as tabelas do modelo de dados sao criadas aqui, mesmo as que ainda
-- nao tem tela (produtos, estoque, vendas, financeiro) - isso evita
-- migracoes de "adicionar tabela" mais tarde e deixa o schema documentado
-- num lugar so. As fases futuras (RF-07 em diante) so precisam de
-- repositorio + servico + IPC + UI; o banco ja esta pronto.
--
-- Convencoes (PRD 10.4):
--  - datas em ISO 8601 (TEXT); campo vazio e NULL, nunca uma sentinela
--  - dinheiro em centavos, como INTEGER
--  - exclusao logica (coluna "ativo") onde ha historico vinculado

-- ===================== Configuracao e acesso =====================

CREATE TABLE empresa (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  nome_fantasia   TEXT NOT NULL,
  razao_social    TEXT,
  cnpj            TEXT,
  ie              TEXT,
  logradouro      TEXT,
  numero          TEXT,
  complemento     TEXT,
  bairro          TEXT,
  cidade          TEXT,
  uf              TEXT,
  cep             TEXT,
  telefone        TEXT,
  whatsapp        TEXT,
  email           TEXT,
  site            TEXT,
  logo_path       TEXT,
  cor_destaque    TEXT NOT NULL DEFAULT '#0D6A70',
  tema            TEXT NOT NULL DEFAULT 'sistema' CHECK (tema IN ('claro', 'escuro', 'sistema')),
  criado_em       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE configuracao (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  tipo  TEXT NOT NULL DEFAULT 'texto'
);

CREATE TABLE usuario (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  nome                TEXT NOT NULL,
  login               TEXT NOT NULL UNIQUE,
  senha_hash          TEXT NOT NULL,
  perfil              TEXT NOT NULL CHECK (perfil IN ('admin', 'vendedor')),
  ativo               INTEGER NOT NULL DEFAULT 1,
  deve_trocar_senha   INTEGER NOT NULL DEFAULT 1,
  tentativas_login    INTEGER NOT NULL DEFAULT 0,
  bloqueado_ate       TEXT,
  ultimo_acesso       TEXT,
  criado_em           TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em       TEXT
);

CREATE TABLE auditoria (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id         INTEGER REFERENCES usuario(id),
  autorizado_por_id  INTEGER REFERENCES usuario(id),
  acao               TEXT NOT NULL,
  entidade           TEXT NOT NULL,
  entidade_id        INTEGER,
  valor_anterior     TEXT,
  valor_novo         TEXT,
  data_hora          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_auditoria_data ON auditoria(data_hora);
CREATE INDEX idx_auditoria_entidade ON auditoria(entidade, entidade_id);

-- Listas de valor configuraveis pela otica (RF-01). NAO inclui UF nem meses:
-- sao padroes universais, ficam como constante no codigo (src/shared).
CREATE TABLE lista_valor (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo    TEXT NOT NULL,
  valor   TEXT NOT NULL,
  ordem   INTEGER NOT NULL DEFAULT 0,
  ativo   INTEGER NOT NULL DEFAULT 1,
  UNIQUE (tipo, valor)
);

-- ===================== Clientes e clinico =====================

CREATE TABLE cliente (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nome           TEXT NOT NULL,
  data_nasc      TEXT,
  cpf            TEXT,
  rg             TEXT,
  celular        TEXT,
  telefone       TEXT,
  email          TEXT,
  logradouro     TEXT,
  numero         TEXT,
  complemento    TEXT,
  bairro         TEXT,
  cidade         TEXT,
  uf             TEXT,
  cep            TEXT,
  profissao      TEXT,
  indicado_por   TEXT,
  observacao     TEXT,
  ativo          INTEGER NOT NULL DEFAULT 1,
  criado_em      TEXT NOT NULL DEFAULT (datetime('now')),
  criado_por     INTEGER REFERENCES usuario(id),
  atualizado_em  TEXT,
  atualizado_por INTEGER REFERENCES usuario(id)
);
CREATE INDEX idx_cliente_nome ON cliente(nome);
CREATE UNIQUE INDEX idx_cliente_cpf ON cliente(cpf) WHERE cpf IS NOT NULL AND cpf != '';

CREATE TABLE profissional (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nome      TEXT NOT NULL,
  registro  TEXT,
  tipo      TEXT,
  ativo     INTEGER NOT NULL DEFAULT 1
);

-- Receita optica: longe e perto, OD e OE, esferico/cilindrico/eixo/DNP.
-- Versionada (RN-14): alterar o grau cria uma nova linha; a antiga fica
-- marcada em substituida_por_id e nunca e sobrescrita.
CREATE TABLE receita_optica (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id          INTEGER NOT NULL REFERENCES cliente(id),
  profissional_id     INTEGER REFERENCES profissional(id),
  data_exame          TEXT NOT NULL,

  longe_od_esf        REAL,
  longe_od_cil        REAL,
  longe_od_eixo       INTEGER,
  longe_od_dnp        REAL,
  longe_oe_esf        REAL,
  longe_oe_cil        REAL,
  longe_oe_eixo       INTEGER,
  longe_oe_dnp        REAL,

  perto_od_esf        REAL,
  perto_od_cil        REAL,
  perto_od_eixo       INTEGER,
  perto_od_dnp        REAL,
  perto_oe_esf        REAL,
  perto_oe_cil        REAL,
  perto_oe_eixo       INTEGER,
  perto_oe_dnp        REAL,

  adicao              REAL,
  altura              REAL,
  tipo_lente          TEXT,
  tratamentos         TEXT,
  armacao             TEXT,
  observacao          TEXT,

  versao              INTEGER NOT NULL DEFAULT 1,
  substituida_por_id  INTEGER REFERENCES receita_optica(id),

  criado_em           TEXT NOT NULL DEFAULT (datetime('now')),
  criado_por          INTEGER REFERENCES usuario(id)
);
CREATE INDEX idx_receita_cliente ON receita_optica(cliente_id);

-- ===================== Produtos e estoque (schema pronto, UI em fase F3/F4) =====================

CREATE TABLE produto (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo                 TEXT UNIQUE,
  codigo_barras          TEXT UNIQUE,
  descricao              TEXT NOT NULL,
  categoria              TEXT NOT NULL CHECK (categoria IN ('armacao', 'lente', 'acessorio', 'servico')),
  marca                  TEXT,
  modelo                 TEXT,
  cor                    TEXT,
  tamanho                TEXT,
  unidade                TEXT NOT NULL DEFAULT 'UN',
  custo_centavos         INTEGER NOT NULL DEFAULT 0,
  margem                 REAL NOT NULL DEFAULT 0,
  preco_venda_centavos   INTEGER NOT NULL DEFAULT 0,
  estoque_minimo         INTEGER NOT NULL DEFAULT 0,
  foto_path              TEXT,
  ativo                  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE produto_lente (
  produto_id  INTEGER PRIMARY KEY REFERENCES produto(id),
  material    TEXT,
  indice      REAL,
  tipo        TEXT,
  grau_min    REAL,
  grau_max    REAL
);

CREATE TABLE fornecedor (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  razao_social       TEXT NOT NULL,
  cnpj               TEXT,
  contato            TEXT,
  telefone           TEXT,
  email              TEXT,
  prazo_entrega_dias INTEGER,
  ativo              INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE compra (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  fornecedor_id         INTEGER REFERENCES fornecedor(id),
  data                  TEXT NOT NULL,
  numero_nf             TEXT,
  valor_total_centavos  INTEGER NOT NULL DEFAULT 0,
  situacao              TEXT NOT NULL DEFAULT 'ABERTA',
  usuario_id            INTEGER REFERENCES usuario(id)
);

CREATE TABLE compra_item (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id               INTEGER NOT NULL REFERENCES compra(id),
  produto_id              INTEGER NOT NULL REFERENCES produto(id),
  quantidade              INTEGER NOT NULL,
  custo_unitario_centavos INTEGER NOT NULL
);

CREATE TABLE estoque_movimento (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id      INTEGER NOT NULL REFERENCES produto(id),
  tipo            TEXT NOT NULL,
  quantidade      INTEGER NOT NULL,
  saldo_apos      INTEGER NOT NULL,
  documento_tipo  TEXT,
  documento_id    INTEGER,
  motivo          TEXT,
  data_hora       TEXT NOT NULL DEFAULT (datetime('now')),
  usuario_id      INTEGER REFERENCES usuario(id)
);
CREATE INDEX idx_estoque_mov_produto ON estoque_movimento(produto_id);

-- ===================== Vendas e ordem de servico (schema pronto, UI em fase F3) =====================

CREATE TABLE venda (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  numero              TEXT NOT NULL UNIQUE,
  cliente_id          INTEGER REFERENCES cliente(id),
  vendedor_id         INTEGER REFERENCES usuario(id),
  receita_optica_id   INTEGER REFERENCES receita_optica(id),
  data                TEXT NOT NULL DEFAULT (datetime('now')),
  subtotal_centavos   INTEGER NOT NULL DEFAULT 0,
  desconto_centavos   INTEGER NOT NULL DEFAULT 0,
  total_centavos      INTEGER NOT NULL DEFAULT 0,
  situacao            TEXT NOT NULL DEFAULT 'CONCLUIDA',
  autorizado_por_id   INTEGER REFERENCES usuario(id),
  criado_em           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_venda_data ON venda(data);
CREATE INDEX idx_venda_vendedor ON venda(vendedor_id);

CREATE TABLE venda_item (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  venda_id                INTEGER NOT NULL REFERENCES venda(id),
  produto_id              INTEGER REFERENCES produto(id),
  descricao               TEXT NOT NULL,
  quantidade              INTEGER NOT NULL DEFAULT 1,
  preco_unitario_centavos INTEGER NOT NULL,
  desconto_centavos       INTEGER NOT NULL DEFAULT 0,
  total_centavos          INTEGER NOT NULL
);

CREATE TABLE venda_pagamento (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  venda_id         INTEGER NOT NULL REFERENCES venda(id),
  forma_pagamento  TEXT NOT NULL,
  valor_centavos   INTEGER NOT NULL,
  parcelas         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE ordem_servico (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  numero              TEXT NOT NULL UNIQUE,
  venda_id            INTEGER REFERENCES venda(id),
  cliente_id          INTEGER NOT NULL REFERENCES cliente(id),
  receita_optica_id   INTEGER REFERENCES receita_optica(id),
  laboratorio         TEXT,
  situacao            TEXT NOT NULL DEFAULT 'EM ABERTO',
  data_abertura       TEXT NOT NULL DEFAULT (datetime('now')),
  data_envio          TEXT,
  data_previsao       TEXT,
  data_chegada        TEXT,
  data_entrega        TEXT,
  observacao          TEXT,
  criado_por          INTEGER REFERENCES usuario(id)
);
CREATE INDEX idx_os_situacao ON ordem_servico(situacao);
CREATE INDEX idx_os_cliente ON ordem_servico(cliente_id);

-- ===================== Financeiro (schema pronto, UI em fase F3/F5) =====================

CREATE TABLE conta_receber (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  venda_id        INTEGER REFERENCES venda(id),
  cliente_id      INTEGER REFERENCES cliente(id),
  parcela         INTEGER NOT NULL DEFAULT 1,
  total_parcelas  INTEGER NOT NULL DEFAULT 1,
  valor_centavos  INTEGER NOT NULL,
  vencimento      TEXT NOT NULL,
  situacao        TEXT NOT NULL DEFAULT 'ABERTA'
);
CREATE INDEX idx_conta_receber_vencimento ON conta_receber(vencimento);

CREATE TABLE recebimento (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  conta_receber_id   INTEGER NOT NULL REFERENCES conta_receber(id),
  valor_centavos     INTEGER NOT NULL,
  data               TEXT NOT NULL DEFAULT (datetime('now')),
  forma_pagamento    TEXT,
  usuario_id         INTEGER REFERENCES usuario(id)
);

CREATE TABLE conta_pagar (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id       INTEGER REFERENCES compra(id),
  fornecedor_id   INTEGER REFERENCES fornecedor(id),
  descricao       TEXT NOT NULL,
  categoria       TEXT,
  valor_centavos  INTEGER NOT NULL,
  vencimento      TEXT NOT NULL,
  situacao        TEXT NOT NULL DEFAULT 'ABERTA',
  recorrente      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_conta_pagar_vencimento ON conta_pagar(vencimento);

CREATE TABLE pagamento (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  conta_pagar_id   INTEGER NOT NULL REFERENCES conta_pagar(id),
  valor_centavos   INTEGER NOT NULL,
  data             TEXT NOT NULL DEFAULT (datetime('now')),
  forma_pagamento  TEXT,
  usuario_id       INTEGER REFERENCES usuario(id)
);

CREATE TABLE lancamento (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo            TEXT NOT NULL CHECK (tipo IN ('RECEITA', 'DESPESA')),
  categoria       TEXT,
  descricao       TEXT NOT NULL,
  valor_centavos  INTEGER NOT NULL,
  data            TEXT NOT NULL,
  origem_tipo     TEXT,
  origem_id       INTEGER,
  usuario_id      INTEGER REFERENCES usuario(id)
);
CREATE INDEX idx_lancamento_data ON lancamento(data);

CREATE TABLE caixa (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  data_abertura           TEXT NOT NULL,
  data_fechamento         TEXT,
  saldo_inicial_centavos  INTEGER NOT NULL DEFAULT 0,
  saldo_final_centavos    INTEGER,
  usuario_abertura_id     INTEGER REFERENCES usuario(id),
  usuario_fechamento_id   INTEGER REFERENCES usuario(id)
);

CREATE TABLE comissao (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  venda_id        INTEGER NOT NULL REFERENCES venda(id),
  vendedor_id     INTEGER NOT NULL REFERENCES usuario(id),
  base_centavos   INTEGER NOT NULL,
  percentual      REAL NOT NULL,
  valor_centavos  INTEGER NOT NULL,
  situacao        TEXT NOT NULL DEFAULT 'PROVISIONADA'
);
