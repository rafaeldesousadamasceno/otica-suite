-- Relacionamento (lista "quem chamar hoje" + atalho para o WhatsApp).
--
-- `contato` registra que alguem da otica ja chamou o cliente por um motivo. A
-- (cliente, motivo, referencia) e unica: `referencia` identifica a OCORRENCIA
-- (o ano do aniversario, o id da OS, o id da parcela mais antiga em atraso, o
-- id da receita...), entao o cliente sai da lista daquela ocorrencia e so
-- volta se surgir outra. ON DELETE CASCADE: excluir de vez um cliente sem
-- historico (RN-13) leva junto os contatos dele, em vez de falhar na FK.
CREATE TABLE contato (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id  INTEGER NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  motivo      TEXT NOT NULL CHECK (motivo IN ('ANIVERSARIO', 'RETIRADA', 'COBRANCA', 'RENOVACAO', 'POS_VENDA')),
  referencia  TEXT NOT NULL,
  observacao  TEXT,
  usuario_id  INTEGER REFERENCES usuario(id),
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (cliente_id, motivo, referencia)
);
CREATE INDEX idx_contato_cliente ON contato(cliente_id);

-- Opt-out (LGPD): 0 = o cliente pediu para nao receber contato de relacionamento.
-- Comeca em 1 para todos - aviso de "seus oculos chegaram" e transacional; quem
-- pedir para sair e retirado da lista na tela Relacionamento.
ALTER TABLE cliente ADD COLUMN aceita_contato INTEGER NOT NULL DEFAULT 1;

-- Mensagens padrao, editaveis pelo Administrador. Placeholders: {nome}, {otica},
-- {numero_os}, {valor}, {vencimento} - so os que fazem sentido em cada motivo.
INSERT INTO configuracao (chave, valor, tipo) VALUES
  ('relacionamento_msg_aniversario',
   'Olá, {nome}! Aqui é da {otica}. Feliz aniversário! Desejamos muita saúde e ótimas vistas para você.',
   'texto'),
  ('relacionamento_msg_retirada',
   'Olá, {nome}! Aqui é da {otica}. Seus óculos (OS {numero_os}) já chegaram e estão prontos para retirada. Quando puder, passe aqui na loja!',
   'texto'),
  ('relacionamento_msg_cobranca',
   'Olá, {nome}! Aqui é da {otica}. Identificamos uma pendência de {valor}, com vencimento em {vencimento}. Se já pagou, desconsidere esta mensagem. Qualquer dúvida, é só responder por aqui.',
   'texto'),
  ('relacionamento_msg_renovacao',
   'Olá, {nome}! Aqui é da {otica}. Já faz mais de um ano desde o seu último exame de vista. Que tal agendar uma revisão para manter seus óculos atualizados?',
   'texto'),
  ('relacionamento_msg_pos_venda',
   'Olá, {nome}! Aqui é da {otica}. Tudo bem com os seus óculos novos (OS {numero_os})? Se precisar de algum ajuste, é só falar com a gente.',
   'texto');
