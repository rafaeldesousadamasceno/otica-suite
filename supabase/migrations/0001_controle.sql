-- =====================================================================
-- OptiAleph - Nuvem (Supabase/Postgres) - Migração 0001: TABELAS DE CONTROLE
--
-- Cobre a seção "Na nuvem: estrutura > Controle" de
-- docs/Arquitetura-Sincronizacao.md. As tabelas de ESPELHO (cópia da loja)
-- NÃO estão aqui: ficam em 0002_espelho.sql, gerado por scripts/gerar-espelho-supabase.mjs.
--
-- Modelo de acesso (resumo):
--   * Celular do Administrador = usuário do Supabase Auth (role `authenticated`,
--     auth.uid() = conta). Enxerga só as lojas onde é membro. Escreve apenas:
--     INSERT em `comando` e UPDATE da decisão em `pedido_liberacao`.
--   * PC da loja = token de curta duração emitido pela Edge Function `pc-token`,
--     também role `authenticated`, com claims de topo `loja_id` e
--     `dispositivo_id`. Só lê/escreve na PRÓPRIA loja e só o que a arquitetura
--     prevê (comando: update de status/resultado; pedido_liberacao: insert;
--     painel_snapshot: upsert).
--   * `service_role` (só nas Edge Functions, NUNCA dentro de app) faz o resto:
--     criar loja, parear, revogar, registrar push_token, expirar pedidos.
--
-- Antes de usar: incluir o schema `optialeph` em "Exposed schemas" da API do
-- Supabase (Settings > API), senão o PostgREST não o enxerga.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Schema e permissões base
-- ---------------------------------------------------------------------
create schema if not exists optialeph;

-- SEGURANÇA: nada é herdado de `public`/`anon`. Quem não logou (anon) não
-- enxerga nem o schema. Concedemos de volta, de forma explícita, só o mínimo.
revoke all on schema optialeph from public, anon;
grant usage on schema optialeph to authenticated, service_role;

-- SEGURANÇA: tabelas/funções/sequências futuras deste schema também não nascem
-- abertas para anon/public (evita esquecer um REVOKE numa migração futura).
alter default privileges in schema optialeph revoke all on tables    from public, anon;
alter default privileges in schema optialeph revoke all on sequences from public, anon;
alter default privileges in schema optialeph revoke all on functions from public, anon;

-- ---------------------------------------------------------------------
-- 2. Função genérica de updated_at
-- ---------------------------------------------------------------------
-- SEGURANÇA: search_path vazio impede que um objeto homônimo em outro schema
-- sequestre a função. Roda como o invocador (não precisa de privilégio extra).
create or replace function optialeph.definir_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();   -- hora do SERVIDOR, nunca a do PC/celular
  return new;
end;
$$;
revoke all on function optialeph.definir_updated_at() from public, anon;

-- ---------------------------------------------------------------------
-- 3. Tabelas
-- ---------------------------------------------------------------------

-- 3.1 loja: id = empresa.uuid do SQLite (sobrevive à troca de computador)
create table optialeph.loja (
  id                    uuid primary key,
  nome                  text not null check (char_length(nome) between 1 and 200),
  cnpj                  text check (cnpj is null or char_length(cnpj) between 11 and 18),
  plano                 text not null default 'premium' check (plano in ('premium')),
  sincronizacao_ligada  boolean not null default true,   -- LGPD: opção de desligar por loja
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- 3.2 loja_membro: conta do celular <-> loja (um Administrador pode ter várias lojas)
create table optialeph.loja_membro (
  id                  uuid primary key default gen_random_uuid(),
  loja_id             uuid not null references optialeph.loja(id) on delete cascade,
  conta_id            uuid not null references auth.users(id) on delete cascade,
  papel               text not null default 'administrador' check (papel in ('administrador')),
  usuario_local_uuid  uuid,                     -- uuid do usuário local (SQLite) correspondente
  revogado_em         timestamptz,              -- revogar o acesso sem apagar o histórico
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (loja_id, conta_id)
);
create index loja_membro_conta_idx on optialeph.loja_membro (conta_id) where revogado_em is null;

-- 3.3 dispositivo: PCs e celulares ligados à loja
create table optialeph.dispositivo (
  id                uuid primary key,           -- = configuracao.sync_dispositivo_id (PC) ou gerado no pareamento (celular)
  loja_id           uuid not null references optialeph.loja(id) on delete cascade,
  tipo              text not null check (tipo in ('pc', 'celular')),
  conta_id          uuid references auth.users(id) on delete cascade,  -- dono, quando tipo = 'celular'
  nome              text check (nome is null or char_length(nome) <= 120),
  chave_publica     text not null,              -- PC: cifrar segredos; celular: verificar assinatura (Ed25519)
  executor          boolean not null default false,  -- é o PC que executa os pedidos
  ultimo_contato_em timestamptz,
  revogado_em       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- celular sempre tem dono; PC nunca é "executor" se for celular
  check ((tipo = 'celular' and conta_id is not null and executor = false)
      or (tipo = 'pc')),
  -- (loja_id, id) único permite FK composta e checagens "o dispositivo é desta loja"
  unique (loja_id, id)
);
create index dispositivo_loja_idx on optialeph.dispositivo (loja_id);
create index dispositivo_conta_idx on optialeph.dispositivo (conta_id) where conta_id is not null;
-- Cada loja tem um único PC executor ativo (dois PCs na mesma loja é v2).
create unique index dispositivo_um_executor_por_loja
  on optialeph.dispositivo (loja_id) where executor and revogado_em is null;

-- 3.4 comando: fila de pedidos do celular para o PC
create table optialeph.comando (
  id            uuid primary key default gen_random_uuid(),
  loja_id       uuid not null references optialeph.loja(id) on delete cascade,
  tipo          text not null check (char_length(tipo) between 1 and 80),
  conteudo      jsonb not null,                 -- partes sensíveis já vêm cifradas com a chave pública do PC
  assinatura    text not null,                  -- assinatura Ed25519 do celular; o PC confere antes de executar
  dispositivo_id uuid not null,                 -- celular que assinou
  emitido_por   uuid not null references auth.users(id),
  criado_em     timestamptz not null default now(),
  expira_em     timestamptz not null,
  status        text not null default 'pendente'
                check (status in ('pendente','executando','concluido','erro','expirado','cancelado')),
  resultado     jsonb,                          -- sucesso, ou erro com a mensagem do AppError
  concluido_em  timestamptz,
  updated_at    timestamptz not null default now(),
  foreign key (loja_id, dispositivo_id) references optialeph.dispositivo (loja_id, id),
  check (expira_em > criado_em)
);
-- Índice pedido na arquitetura: o executor busca "pendentes da loja em ordem de chegada".
create index comando_loja_status_criado_idx on optialeph.comando (loja_id, status, criado_em);
create index comando_emitido_por_idx on optialeph.comando (emitido_por);
create index comando_dispositivo_idx on optialeph.comando (loja_id, dispositivo_id);

-- 3.5 pedido_liberacao: "liberar na hora" (desconto acima do teto, exclusão de venda)
create table optialeph.pedido_liberacao (
  id                uuid primary key default gen_random_uuid(),
  loja_id           uuid not null references optialeph.loja(id) on delete cascade,
  dispositivo_id    uuid not null,              -- PC que originou o pedido
  motivo            text not null check (char_length(motivo) between 1 and 300),
  resumo            text not null check (char_length(resumo) between 1 and 1000),  -- texto legível: cliente, valor, desconto
  hash_acao         text not null check (char_length(hash_acao) between 16 and 128),  -- hash da ação exata
  solicitante       text check (solicitante is null or char_length(solicitante) <= 200),  -- quem pediu no balcão
  status            text not null default 'pendente'
                    check (status in ('pendente','aprovado','negado','expirado')),
  decidido_por      uuid references auth.users(id),
  decidido_em       timestamptz,
  criado_em         timestamptz not null default now(),
  -- Validade de 5 min definida pelo SERVIDOR (default); o PC nem envia essa coluna.
  expira_em         timestamptz not null default (now() + interval '5 minutes'),
  updated_at        timestamptz not null default now(),
  foreign key (loja_id, dispositivo_id) references optialeph.dispositivo (loja_id, id),
  -- consistência: decisão preenchida se e somente se saiu de 'pendente' para aprovado/negado
  check ((status in ('aprovado','negado')) = (decidido_por is not null and decidido_em is not null)
         or status in ('pendente','expirado'))
);
create index pedido_liberacao_loja_status_criado_idx
  on optialeph.pedido_liberacao (loja_id, status, criado_em);

-- 3.6 painel_snapshot: indicadores já calculados pelo PC (dashboardService)
create table optialeph.painel_snapshot (
  loja_id      uuid not null references optialeph.loja(id) on delete cascade,
  periodo      text not null check (periodo in ('hoje','mes','mes_anterior','avisos')),
  indicadores  jsonb not null,
  gerado_em    timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (loja_id, periodo)
);

-- 3.7 push_token: notificação do celular
create table optialeph.push_token (
  id          uuid primary key default gen_random_uuid(),
  conta_id    uuid not null references auth.users(id) on delete cascade,
  token       text not null check (char_length(token) between 1 and 512),
  plataforma  text not null check (plataforma in ('ios','android')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (conta_id, token)
);

-- updated_at automático em todas
create trigger loja_updated_at             before update on optialeph.loja             for each row execute function optialeph.definir_updated_at();
create trigger loja_membro_updated_at      before update on optialeph.loja_membro      for each row execute function optialeph.definir_updated_at();
create trigger dispositivo_updated_at      before update on optialeph.dispositivo      for each row execute function optialeph.definir_updated_at();
create trigger comando_updated_at          before update on optialeph.comando          for each row execute function optialeph.definir_updated_at();
create trigger pedido_liberacao_updated_at before update on optialeph.pedido_liberacao for each row execute function optialeph.definir_updated_at();
create trigger painel_snapshot_updated_at  before update on optialeph.painel_snapshot  for each row execute function optialeph.definir_updated_at();
create trigger push_token_updated_at       before update on optialeph.push_token       for each row execute function optialeph.definir_updated_at();

-- Decisão do pedido de liberação: hora SEMPRE do servidor (o celular não escolhe
-- decidido_em), e uma decisão tomada não pode ser alterada depois.
create or replace function optialeph.carimbar_decisao_liberacao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'pendente' then
    raise exception 'pedido de liberação já decidido ou expirado' using errcode = '42501';
  end if;
  if new.status in ('aprovado','negado') then
    new.decidido_em := now();
  end if;
  return new;
end;
$$;
revoke all on function optialeph.carimbar_decisao_liberacao() from public, anon;
create trigger pedido_liberacao_decisao
  before update on optialeph.pedido_liberacao
  for each row execute function optialeph.carimbar_decisao_liberacao();

-- ---------------------------------------------------------------------
-- 4. Funções auxiliares para RLS
-- ---------------------------------------------------------------------

-- Lojas em que a conta logada é membro ativo.
-- SEGURANÇA: SECURITY DEFINER para ler loja_membro sem disparar a RLS da própria
-- loja_membro (evita recursão de policy). search_path fixo e vazio + nomes
-- qualificados impedem sequestro de função/tabela. Só devolve dados do próprio
-- auth.uid(): não aceita parâmetro de usuário, então não vaza nada de terceiros.
create or replace function optialeph.lojas_do_usuario()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.loja_id
    from optialeph.loja_membro m
   where m.conta_id = auth.uid()
     and m.revogado_em is null;
$$;

-- O token atual é de um PC válido DESTA loja?
-- SEGURANÇA: lê claims do TOPO do JWT (assinado pelo servidor). NUNCA usar
-- user_metadata, que o próprio usuário consegue editar. Além de conferir o claim,
-- consulta a tabela `dispositivo`: se o PC for revogado (revogado_em) ou perder o
-- papel de executor, o acesso cai na hora, mesmo com o token ainda não expirado.
create or replace function optialeph.pc_autorizado(p_loja uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_loja is not null
     and coalesce(nullif(auth.jwt() ->> 'loja_id', ''), '') = p_loja::text
     and exists (
       select 1
         from optialeph.dispositivo d
        where d.id = nullif(auth.jwt() ->> 'dispositivo_id', '')::uuid
          and d.loja_id = p_loja
          and d.tipo = 'pc'
          and d.executor
          and d.revogado_em is null
     );
$$;

-- Id do dispositivo (PC) no token; usado para impedir que um PC se passe por outro.
create or replace function optialeph.pc_dispositivo_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'dispositivo_id', '')::uuid;
$$;

-- O celular `p_dispositivo` pertence à conta logada, é desta loja e não foi revogado?
-- SEGURANÇA: impede emitir comando "em nome" do aparelho de outra conta.
create or replace function optialeph.celular_ativo(p_dispositivo uuid, p_loja uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from optialeph.dispositivo d
     where d.id = p_dispositivo
       and d.loja_id = p_loja
       and d.tipo = 'celular'
       and d.conta_id = auth.uid()
       and d.revogado_em is null
  );
$$;

-- SEGURANÇA: funções nascem com EXECUTE para PUBLIC no Postgres. Fechamos e
-- abrimos só para os papéis que precisam.
revoke all on function optialeph.lojas_do_usuario()                 from public, anon;
revoke all on function optialeph.pc_autorizado(uuid)                from public, anon;
revoke all on function optialeph.pc_dispositivo_id()                from public, anon;
revoke all on function optialeph.celular_ativo(uuid, uuid)          from public, anon;
grant execute on function optialeph.lojas_do_usuario()              to authenticated, service_role;
grant execute on function optialeph.pc_autorizado(uuid)             to authenticated, service_role;
grant execute on function optialeph.pc_dispositivo_id()             to authenticated, service_role;
grant execute on function optialeph.celular_ativo(uuid, uuid)       to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. Privilégios de tabela (GRANT explícito, o mínimo necessário)
--    A RLS decide QUAIS LINHAS; o GRANT por coluna decide QUAIS COLUNAS.
--    As duas camadas valem juntas (defesa em profundidade).
-- ---------------------------------------------------------------------
revoke all on all tables in schema optialeph from public, anon;

-- service_role (Edge Functions): acesso total. Ele ignora a RLS por desenho do
-- Supabase; por isso a chave dele nunca vai dentro de app.
grant all on all tables in schema optialeph to service_role;

-- authenticated: leitura onde a RLS permitir...
grant select on optialeph.loja, optialeph.loja_membro, optialeph.dispositivo,
                optialeph.comando, optialeph.pedido_liberacao,
                optialeph.painel_snapshot, optialeph.push_token
  to authenticated;

-- ...e escritas pontuais, SEMPRE limitadas por coluna.
-- Celular: cria comando. Colunas controladas pelo servidor (criado_em, resultado,
-- concluido_em, updated_at) ficam de fora: o cliente não consegue preenchê-las.
grant insert (id, loja_id, tipo, conteudo, assinatura, dispositivo_id, emitido_por, status, expira_em)
  on optialeph.comando to authenticated;
-- PC: só andamento e resultado do comando.
grant update (status, resultado, concluido_em) on optialeph.comando to authenticated;

-- PC: abre pedido de liberação (expira_em e decisão NÃO são aceitos do cliente).
grant insert (id, loja_id, dispositivo_id, motivo, resumo, hash_acao, solicitante)
  on optialeph.pedido_liberacao to authenticated;
-- Celular: somente a decisão.
grant update (status, decidido_por) on optialeph.pedido_liberacao to authenticated;

-- PC: upsert do painel (INSERT + UPDATE das colunas de conteúdo).
grant insert (loja_id, periodo, indicadores, gerado_em) on optialeph.painel_snapshot to authenticated;
grant update (indicadores, gerado_em)                   on optialeph.painel_snapshot to authenticated;

-- PC: batimento de presença ("último contato") no próprio dispositivo.
grant update (ultimo_contato_em) on optialeph.dispositivo to authenticated;

-- ---------------------------------------------------------------------
-- 6. RLS: ligada em TODAS as tabelas
--    SEGURANÇA: sem policy = negado. Não usamos FORCE porque as funções
--    SECURITY DEFINER (dono do schema) precisam ler loja_membro/dispositivo.
-- ---------------------------------------------------------------------
alter table optialeph.loja             enable row level security;
alter table optialeph.loja_membro      enable row level security;
alter table optialeph.dispositivo      enable row level security;
alter table optialeph.comando          enable row level security;
alter table optialeph.pedido_liberacao enable row level security;
alter table optialeph.painel_snapshot  enable row level security;
alter table optialeph.push_token       enable row level security;

-- ---- loja ----------------------------------------------------------
-- Celular lê as lojas onde é membro; PC lê a própria. Ninguém escreve por aqui
-- (criar/alterar loja é feito pelas Edge Functions com service_role).
create policy loja_select_celular on optialeph.loja
  for select to authenticated
  using (id in (select optialeph.lojas_do_usuario()));
create policy loja_select_pc on optialeph.loja
  for select to authenticated
  using (optialeph.pc_autorizado(id));

-- ---- loja_membro ---------------------------------------------------
-- Cada conta vê só as próprias associações (não lista outros membros).
-- Vínculos são criados/revogados só pela função `parear` (service_role).
create policy loja_membro_select_proprio on optialeph.loja_membro
  for select to authenticated
  using (conta_id = (select auth.uid()));

-- ---- dispositivo ---------------------------------------------------
-- Celular vê os dispositivos das suas lojas (para mostrar "PC online", celulares
-- conectados). PC vê os da própria loja (conferir a chave pública dos celulares
-- aprovados). Criar/revogar dispositivo: só service_role.
create policy dispositivo_select_celular on optialeph.dispositivo
  for select to authenticated
  using (loja_id in (select optialeph.lojas_do_usuario()));
create policy dispositivo_select_pc on optialeph.dispositivo
  for select to authenticated
  using (optialeph.pc_autorizado(loja_id));
-- PC atualiza só o PRÓPRIO registro (e, por GRANT, só ultimo_contato_em).
create policy dispositivo_update_pc_proprio on optialeph.dispositivo
  for update to authenticated
  using (optialeph.pc_autorizado(loja_id) and id = optialeph.pc_dispositivo_id())
  with check (optialeph.pc_autorizado(loja_id) and id = optialeph.pc_dispositivo_id());

-- ---- comando -------------------------------------------------------
-- Celular lê os comandos das suas lojas (acompanha "Enviado > Aguardando > Feito").
create policy comando_select_celular on optialeph.comando
  for select to authenticated
  using (loja_id in (select optialeph.lojas_do_usuario()));
-- PC lê os comandos da própria loja (fila de pendentes).
create policy comando_select_pc on optialeph.comando
  for select to authenticated
  using (optialeph.pc_autorizado(loja_id));
-- Celular cria comando: só em loja onde é membro, em nome de si mesmo
-- (emitido_por = auth.uid(), não forjável), com um celular SEU e ativo, sempre
-- 'pendente' (não pode nascer "concluído"), e validade futura de no máximo 7 dias
-- (maior prazo da arquitetura). Conferida contra now() do servidor.
create policy comando_insert_celular on optialeph.comando
  for insert to authenticated
  with check (
    loja_id in (select optialeph.lojas_do_usuario())
    and emitido_por = (select auth.uid())
    and status = 'pendente'
    and optialeph.celular_ativo(dispositivo_id, loja_id)
    and expira_em > now()
    and expira_em <= now() + interval '7 days'
  );
-- PC atualiza andamento/resultado só na própria loja. Transições: parte de
-- pendente/executando e vai para executando/concluido/erro/expirado. Estados
-- finais são imutáveis (o celular não consegue "reabrir", e o PC não reescreve
-- um resultado). 'cancelado' fica com service_role. Colunas limitadas por GRANT.
create policy comando_update_pc on optialeph.comando
  for update to authenticated
  using (optialeph.pc_autorizado(loja_id) and status in ('pendente','executando'))
  with check (optialeph.pc_autorizado(loja_id)
              and status in ('executando','concluido','erro','expirado'));

-- ---- pedido_liberacao ----------------------------------------------
-- Celular lê os pedidos das suas lojas; PC lê os da própria loja (recebe a decisão).
create policy pedido_liberacao_select_celular on optialeph.pedido_liberacao
  for select to authenticated
  using (loja_id in (select optialeph.lojas_do_usuario()));
create policy pedido_liberacao_select_pc on optialeph.pedido_liberacao
  for select to authenticated
  using (optialeph.pc_autorizado(loja_id));
-- PC abre pedido: só na própria loja, apontando para o próprio dispositivo,
-- sempre 'pendente' e sem decisão pré-preenchida (colunas de decisão nem estão
-- no GRANT de insert; expira_em vem do default do servidor).
create policy pedido_liberacao_insert_pc on optialeph.pedido_liberacao
  for insert to authenticated
  with check (
    optialeph.pc_autorizado(loja_id)
    and dispositivo_id = optialeph.pc_dispositivo_id()
    and status = 'pendente'
    and decidido_por is null
  );
-- Celular decide: só pedido PENDENTE e ainda dentro do prazo, de loja onde é
-- membro; o resultado só pode ser aprovado/negado e decidido_por tem de ser o
-- próprio auth.uid() (sem decidir "em nome" de outro Administrador). decidido_em
-- é carimbado pelo gatilho com a hora do servidor. Colunas limitadas por GRANT:
-- não dá para alterar motivo, resumo, hash_acao nem expira_em.
create policy pedido_liberacao_decidir_celular on optialeph.pedido_liberacao
  for update to authenticated
  using (
    loja_id in (select optialeph.lojas_do_usuario())
    and status = 'pendente'
    and expira_em > now()
  )
  with check (
    loja_id in (select optialeph.lojas_do_usuario())
    and status in ('aprovado','negado')
    and decidido_por = (select auth.uid())
  );

-- ---- painel_snapshot -----------------------------------------------
-- Celular só LÊ o painel das suas lojas.
create policy painel_snapshot_select_celular on optialeph.painel_snapshot
  for select to authenticated
  using (loja_id in (select optialeph.lojas_do_usuario()));
-- PC faz upsert na própria loja. O upsert (INSERT ... ON CONFLICT DO UPDATE)
-- exige policies de SELECT, INSERT e UPDATE; as três exigem pc_autorizado.
create policy painel_snapshot_select_pc on optialeph.painel_snapshot
  for select to authenticated
  using (optialeph.pc_autorizado(loja_id));
create policy painel_snapshot_insert_pc on optialeph.painel_snapshot
  for insert to authenticated
  with check (optialeph.pc_autorizado(loja_id));
create policy painel_snapshot_update_pc on optialeph.painel_snapshot
  for update to authenticated
  using (optialeph.pc_autorizado(loja_id))
  with check (optialeph.pc_autorizado(loja_id));

-- ---- push_token ----------------------------------------------------
-- Cada conta só enxerga os PRÓPRIOS tokens. Não há policy de escrita: o registro
-- do token é feito por Edge Function (service_role), que também é quem lê todos
-- os tokens para enviar a notificação. O PC nunca acessa esta tabela.
create policy push_token_select_proprio on optialeph.push_token
  for select to authenticated
  using (conta_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 7. Tempo real (o PC escuta comandos; o celular escuta decisões/andamento)
--    O Realtime respeita a RLS acima: cada cliente só recebe as linhas que
--    poderia ler com SELECT.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table optialeph.comando, optialeph.pedido_liberacao;
  end if;
exception when duplicate_object then
  null;  -- já estavam publicadas (reexecução da migração)
end;
$$;
