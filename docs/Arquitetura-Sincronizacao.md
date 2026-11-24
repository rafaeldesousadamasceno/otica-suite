# Nuvem e app do Administrador no celular: arquitetura

Status: **a fase N1 (espelho) está implementada**: o PC já envia a cópia da loja e o painel pronto para o Supabase quando a nuvem é ligada na tela "Nuvem e celular" (detalhes na tabela de fases). O app de celular e os pedidos (N2 em diante) ainda não existem. Este documento define como o resto será construído: o espelho da loja na nuvem, o app de celular do Administrador (plano Premium) e o backup online.

## Objetivo

1. Continuar funcionando **offline** como hoje: o banco local (SQLite) é a fonte de verdade do dia a dia.
2. Quando houver internet, **enviar uma cópia da loja para a nuvem** (backup online e base do app de celular).
3. Dar ao Administrador, no celular:
   - **acompanhar** a loja (painéis e listas);
   - **comandos de administração** (configurar, resetar senha, desbloquear ou desativar usuário);
   - **liberar na hora** um pedido do balcão (desconto acima do teto, exclusão de venda);
   - **lançar e editar dados** (vender, baixar parcela, cadastrar cliente).

## Decisão central: só o PC grava

Tudo o que o Administrador faz pelo celular vira um **pedido** numa fila na nuvem. O PC da loja executa o pedido com **os mesmos serviços de hoje** (mesma validação, mesmas regras, mesma auditoria) e devolve o resultado. A nuvem guarda só uma cópia da loja, que o celular lê.

```
 Celular (Admin) ──pedido assinado──▶ Nuvem: comando / pedido_liberacao ──tempo real──▶ PC da loja
      ▲                                                                                 │ executa com os
      │                                                                                 │ serviços de hoje
      └──── lê a cópia + painel pronto ◀── Nuvem: espelho ◀────── worker de envio ──────┘ (SQLite = verdade)
```

Por quê:

- As regras de venda, estoque, comissão, parcelas e caixa existem **num lugar só** (o processo main do PC). Não há segunda cópia para manter igual.
- **Não existe conflito de edição**: só um lado grava.
- A migração 010 já cobre o envio.

O preço: **com o PC desligado, o pedido espera** e o celular mostra "Aguardando a loja ficar online". Durante o expediente o PC está ligado e o pedido é executado em segundos.

Caminhos descartados:

| Caminho | Por que não |
|---|---|
| A nuvem também grava (sincronização nos dois sentidos, "vale a última alteração") | Funcionaria com o PC desligado, mas as regras de venda, estoque e caixa teriam de ser reescritas na nuvem e mantidas iguais às do PC para sempre, com regra de conflito por tabela. Custa umas 3 a 4 vezes mais. |
| A nuvem vira a fonte da verdade e o PC só guarda cópia | Quebra o funcionamento offline, que é a base do sistema. |

A porta continua aberta: se um dia uma operação específica precisar funcionar com o PC desligado, só ela passa a gravar direto na nuvem.

## Banco na nuvem: Supabase

Critérios: SQL relacional próximo do SQLite; login para o celular; tempo real (liberar na hora); isolamento total entre lojas; servidor no Brasil (LGPD, a receita é dado de saúde); nenhum servidor para manter; custo.

| Opção | Veredito |
|---|---|
| **Supabase** (Postgres + login + tempo real + Edge Functions + RLS, região São Paulo) | **Escolhido.** Cobre todos os critérios. O plano gratuito pausa o projeto após 7 dias sem uso (serve só para desenvolvimento); o Pro custa cerca de US$ 25 por mês por organização, com 8 GB inclusos. Uma ótica ocupa dezenas de MB: um projeto atende muitas lojas. |
| Firebase (Firestore) | Não é SQL. Relatórios de caixa, rateio de desconto e custo da época da venda seriam reescritos do zero, e os dados ficariam presos ao formato do Google. |
| Turso (SQLite na nuvem, Turso Sync) | Mesmo dialeto do SQLite, mas exige trocar o driver `node:sqlite`, a sincronização com gravação offline é recente e não traz login, tempo real nem notificação para o celular. A Turso anunciou que está se juntando à Supabase: vale reavaliar no futuro. |
| PowerSync / ElectricSQL (motores de sincronização sobre Postgres) | Não servem para o PC: o SDK para Node ainda é experimental e quer ser dono do schema local, que aqui já tem gatilhos próprios. Podem servir mais tarde no celular, se ele precisar de um banco offline completo. |
| Postgres ou MySQL num servidor próprio + API própria | Disponibilidade, backup e segurança ficariam todos por nossa conta: é exatamente a responsabilidade que o PRD quis evitar. |

Cuidado do Supabase: tabelas no schema `public` deixaram de ser expostas à API por padrão (outubro de 2026). Usar um schema próprio, `optialeph`, com permissões explícitas.

## O que já existe (migração 010)

Gerada por `scripts/gerar-sync-sql.mjs` a partir da lista `src/main/sync/tabelasSincronizaveis.ts` (um teste falha se o `.sql` ficar diferente da saída do gerador ou se uma tabela nova não for classificada).

| Peça | Para que serve |
|---|---|
| `uuid` em cada tabela | Identidade global do registro. As chaves inteiras locais continuam; a nuvem usa o uuid. Linhas antigas receberam um uuid na migração. |
| `sync_rev` em cada tabela | Número da última alteração, **crescente em todas as tabelas** (vem de `sync_contador`). O worker pergunta "o que mudou depois da revisão N". Linhas antigas entram na revisão 1 (carga inicial). |
| `atualizado_em` | Criada onde faltava. Atualizada por gatilho. |
| Gatilhos de insert, update e delete | Mantêm uuid, revisão e data em **qualquer caminho de gravação**, sem mexer em repositório nenhum. |
| `sync_exclusao` | Guarda o uuid de cada registro apagado (a linha some da tabela, então o gatilho registra aqui), inclusive exclusões em cascata. |
| `configuracao.sync_dispositivo_id` | Identidade deste computador na nuvem. |

Tabelas criadas depois da 010 trazem as mesmas peças na própria migração (`desdeMigracao` na lista, SQL de `sqlSyncTabelaNova`).

## O que não sincroniza

- `_migrations`, `migracao_registro`, `migracao_pendencia`, `sync_contador`, `sync_exclusao`.
- Em `usuario`: `senha_hash`, `tentativas_login`, `bloqueado_ate`, `ultimo_acesso`. **A senha nunca sai do computador.**
- Em `configuracao`: as chaves de `CHAVES_CONFIGURACAO_LOCAIS`: `licenca_local`, `sync_dispositivo_id` e, desde a N1, `nuvem_ligada` e `nuvem_consentimento` (as chaves futuras deste documento entram lá também).
- Arquivos de licença, sessão e backups.

## No PC: o que muda no app

### Worker de envio

Implementado na N1 (`src/main/sync/`: `workerNuvem`, `cicloEnvio`, `consultaEnvio`, `clienteNuvem`, `identidadePc`, `estadoNuvem`, `painelPronto`; serviço em `nuvemService`). Roda no processo main.

**Gravação direta no PostgREST, sem Edge Function de envio.** O PC pede um token à `pc-token` (licença + prova de posse da chave do PC) e grava direto nas tabelas do espelho, com `Prefer: resolution=merge-duplicates` (upsert por uuid) e `DELETE` filtrado. Uma função `sync-push` não é necessária porque o RLS e os GRANTs da migração 0001 já restringem o token à própria loja (`loja_id` e `dispositivo_id` do token), e há menos uma peça para publicar e manter. O PC acrescenta `loja_id` e `recebido_em` a cada linha.

Quando roda:

- O primeiro ciclo sai cerca de 30 segundos depois de abrir o app; depois, a cada **2 minutos**. Se um ciclo falha, o intervalo **dobra** (2, 4, 8, 16 e no máximo **30 minutos**) e volta a 2 minutos ao primeiro sucesso. PC novo esperando aprovação tenta a cada 30 minutos. Revogado para de tentar até religar.
- **Sincronizar agora** na tela roda um ciclo na hora e ignora o intervalo; se já há um ciclo em andamento, devolve o mesmo.
- Nada muda para a ótica quando a nuvem falha: o app continua normal e o worker tenta de novo sozinho.

O ciclo:

1. Lê o contador (`sync_contador`) como **teto N** do ciclo: só entra o que tem `sync_rev <= N`, então linhas gravadas durante o ciclo ficam para o próximo.
2. Para cada tabela, lê as linhas depois do cursor, **paginando por `(sync_rev, uuid)`** (lotes de 500; o desempate pelo uuid evita pular linhas que dividem a mesma revisão), troca `cliente_id` por `cliente_uuid` (e assim por diante), omite `colunasLocais` e as linhas de `filtroLocal`, e envia cada lote por upsert. Reenviar o mesmo lote não duplica nada.
3. Envia as exclusões de `sync_exclusao` (apaga pelo uuid na nuvem).
4. **Só depois de tudo confirmado** grava o novo cursor (= N) e limpa `sync_exclusao` até N. Internet caiu no meio: o cursor não andou, o próximo ciclo reenvia desde o cursor antigo.
5. Por último envia o painel pronto. Se o painel falhar, as linhas já foram e o cursor já andou; só o painel é refeito no ciclo seguinte.

Onde ficam as coisas no PC (pasta de dados do app, `userData`):

| Item | Onde | Observação |
|---|---|---|
| Cursor de envio (último N confirmado) e fingerprint do computador | `nuvem-estado.json` | Arquivo, não o banco: assim um backup restaurado não traz um cursor de outra época. |
| Identidade do PC: chave privada Ed25519 | `nuvem-chave.bin` | Cifrada com o `safeStorage` do Electron (DPAPI no Windows). A chave pública vai para a nuvem; a privada nunca sai do PC. Sem cofre do sistema disponível, a nuvem não liga. |
| `dispositivo_id` | `configuracao.sync_dispositivo_id` | Chave local (não sincroniza). |
| Nuvem ligada, consentimento (versão do termo, usuário, data) | `configuracao.nuvem_ligada` e `nuvem_consentimento` | Chaves locais (em `CHAVES_CONFIGURACAO_LOCAIS`). |

**Backup restaurado x banco copiado para outro computador.** Os dois fazem o `sync_rev` voltar atrás ou repetir o `sync_dispositivo_id`, e o worker distingue pelo fingerprint e pela chave:

- **Mesmo PC depois de restaurar um backup:** fingerprint e chave conferem, então o `dispositivo_id` é mantido. O ciclo vê que `cursor > N`, grava o cursor 0 no estado e faz um **reenvio total com varredura**: reenvia tudo com um `recebido_em` novo e, no fim, apaga na nuvem as linhas da loja com `recebido_em` anterior ao do ciclo, ou seja, o que o backup não tem mais. Gravar o cursor 0 antes garante que o próximo ciclo também varre se o contador voltar a passar do cursor antigo.
- **Outro computador (fingerprint diferente, ou chave ausente):** gera chave nova e **identidade nova** (`dispositivo_id` novo). A `pc-token` responde **409** até o Administrador aprovar o PC novo no celular (a aprovação só existe a partir da N2/N3); a tela mostra "aguardando aprovação".

**Exclusões** só saem de `sync_exclusao` depois do sucesso do ciclo. Na varredura as exclusões nem são enviadas: o que não veio some pela varredura.

**Estados** (mostrados na tela "Nuvem e celular"):

| Estado | Quando |
|---|---|
| `desligada` | `nuvem_ligada` não é "1". |
| `nao_configurada` | Chave pública do Supabase ausente na build. |
| `sem_licenca` | Sem licença liberada para a nuvem, ou a `pc-token` recusou a licença (vencida, inválida, sem o recurso). |
| `aguardando` | Ligada, ainda sem resultado de ciclo. |
| `sincronizando` | Ciclo em andamento. |
| `ok` | Último ciclo concluído ("Em dia"). |
| `sem_internet` | Sem rede, ou a nuvem recusou o envio ou está fora do ar. Tenta de novo com intervalo crescente. |
| `aguardando_aprovacao` | PC novo; a `pc-token` respondeu 409. |
| `revogado` | O Administrador desconectou este PC. O relógio para até religar. |
| `erro` | Falha inesperada (detalhe só no log; a tela mostra mensagem genérica). |

A tela também mostra o último envio e quantas alterações estão pendentes (N menos o cursor).

### Painel pronto

A cada ciclo bem-sucedido o PC calcula os indicadores com o `dashboardService` que já existe (`calcularResumo`, o mesmo código da tela) e grava quatro linhas em `painel_snapshot` por upsert: `hoje`, `mes`, `mes_anterior` e `avisos`. O cálculo roda **sem sessão** (como Administrador) e **sem completar recorrências**, porque o worker não pode escrever no banco; por isso `avisos` no celular pode omitir contas de recorrências ainda não materializadas. A regra de cálculo (regime de caixa, rateio do desconto, custo da época) continua num lugar só (nenhuma consulta foi reescrita em SQL do Postgres). Listas simples (contas vencidas, OS atrasadas ou prontas, estoque baixo) o celular consulta direto na cópia.

### Executor de pedidos

- Escuta em tempo real os pedidos (`comando`) pendentes da loja e busca os que chegaram enquanto estava sem internet.
- Para cada pedido, em ordem de chegada:
  1. confere a **assinatura do celular** (só aceita celulares que o próprio PC aprovou, ver Segurança);
  2. valida o conteúdo com **o mesmo schema Zod** que o IPC usa (`src/shared/ipc.ts`, como faz `handleIpc` em `src/main/ipc/handle.ts`);
  3. executa **o mesmo serviço** (ex.: `usuarioService.resetarSenha`), em nome do Administrador que pediu;
  4. grava o resultado na nuvem (concluído, ou erro com a mesma mensagem do `AppError` que a tela mostraria);
  5. registra na auditoria com origem "celular".
- Idempotente: a tabela local `comando_executado` guarda o uuid de cada pedido executado, então o mesmo pedido entregue duas vezes roda uma vez só.

### Sessão remota

Hoje a sessão é uma variável única do processo main (`src/main/auth/session.ts`). Um pedido do celular precisa rodar como o Administrador sem derrubar o vendedor logado no balcão. Solução: um contexto de execução (`AsyncLocalStorage`) com `executarComoRemoto(usuario, fn)`; `requireSessao` e `requirePermissao` olham esse contexto antes da sessão global. Permissões (`src/shared/permissions.ts`) e a trava de licença vencida valem igual para pedidos remotos.

### Liberação na hora

- Na tela de autorização que já existe (`AuthorizeAdminDialog`, aberta pelo erro `AUTORIZACAO_ADMIN_NECESSARIA`), novo botão **"Pedir ao Administrador pelo celular"**.
- O PC cria um `pedido_liberacao` com o motivo, um resumo legível (cliente, valor, desconto) e um hash da ação exata. O celular recebe uma notificação; o Administrador aprova ou nega.
- O PC recebe a decisão em tempo real e reenvia a mesma chamada com a autorização remota. `resolverAutorizador` (`src/main/auth/autorizacaoPontual.ts`) aceita se estiver aprovada, dentro de 5 minutos, com o mesmo hash e sem ter sido usada antes.
- Sem internet, ou sem resposta: continua valendo a senha do Administrador digitada no balcão.

### Chaves do PC

Na ativação da nuvem o PC gera um par de chaves, guardado com `safeStorage` do Electron; a chave pública vai para a nuvem. O celular cifra com ela o que é sensível (por exemplo, a nova senha num reset), então **a nuvem nunca vê senha**: só o PC consegue abrir.

### Migrações e tela

- Migrações novas: `comando_executado`; coluna `origem` na auditoria (balcão ou celular); chaves locais em `configuracao` para o que ainda vier (celulares aprovados etc.), acrescentadas a `CHAVES_CONFIGURACAO_LOCAIS`. O cursor de envio e a chave do PC **não** ficam no banco: ficam em `nuvem-estado.json` e `nuvem-chave.bin` (ver Worker de envio).
- Tela **"Nuvem e celular"** em Configurações. Na N1: ligar ou desligar, termo de consentimento (LGPD), estado, último envio, pendentes e "Sincronizar agora". Ficam para as fases seguintes "conectar celular" (QR code) e a lista de celulares com opção de revogar.
- **Fora da N1: apagar os dados da nuvem pelo app.** Desligar só para o envio; o que já foi enviado fica na nuvem. O descarte (ver LGPD) é feito pela equipe.

## Na nuvem: estrutura (Supabase, schema `optialeph`)

### Espelho

Uma tabela para cada item de `TABELAS_SINCRONIZAVEIS`, com as mesmas colunas mais `loja_id`, chave `uuid`, chaves estrangeiras como `*_uuid`, o `sync_rev` de origem e `recebido_em`. O DDL é **gerado** a partir da mesma lista (estender `scripts/gerar-sync-sql.mjs`), com tipos 1 para 1 (datas continuam texto; conversões ficam em views). Tabela nova no SQLite entra na lista e o espelho acompanha.

### Controle

| Tabela | Conteúdo |
|---|---|
| `loja` | id (= `empresa.uuid` do SQLite), nome, CNPJ, plano, sincronização ligada |
| `loja_membro` | conta do celular, loja, papel, uuid do usuário local correspondente. Um Administrador pode ter várias lojas. |
| `dispositivo` | id (= `sync_dispositivo_id`), loja, tipo (PC ou celular), chave pública, se é o PC executor, último contato, revogado em |
| `comando` | id, loja, tipo, conteúdo (partes sensíveis cifradas), assinatura, quem pediu, criado em, expira em, situação (pendente, executando, concluído, erro, expirado, cancelado), resultado |
| `pedido_liberacao` | id, loja, motivo, resumo, hash da ação, quem pediu no balcão, situação (pendente, aprovado, negado, expirado), quem decidiu, expira em |
| `painel_snapshot` | loja, período, indicadores prontos, gerado em |
| `push_token` | conta, token de notificação, plataforma |

Validade dos pedidos por tipo: liberação 5 minutos; reset de senha e desbloqueio 24 horas; lançamentos (venda, baixa, cliente) 7 dias.

### Regras de acesso (RLS)

- O celular enxerga só as lojas em que é membro e **só lê** o espelho. Grava apenas `comando` e a decisão de `pedido_liberacao`.
- O PC usa um token com `loja_id` e `dispositivo_id` e só grava na própria loja.
- A chave `service_role` do Supabase **nunca** vai dentro de nenhum app.

### Edge Functions

| Função | O que faz |
|---|---|
| `pc-token` | Recebe a licença (assinada pela Central) e uma assinatura feita com a chave do PC; devolve um token de curta duração (1 hora). Publicada. |
| `parear` | Troca o código do QR code por um vínculo conta ↔ loja ↔ usuário local. |
| ~~`sync-push`~~ | **Não existe.** O PC grava direto no PostgREST com o token da `pc-token` (ver Worker de envio). |
| `notificar` | Envia notificação ao celular quando nasce um pedido de liberação ou um pedido muda de situação. |

## Segurança e identidade

- **O celular tem login próprio** (conta no Supabase: e-mail e senha, biometria para abrir o app). A senha do sistema da loja continua sem sair do PC.
- **Pareamento pelo PC:** Administrador logado no PC → Configurações → "Conectar celular" → QR code com código de uso único (10 minutos) → o app lê → `parear` liga a conta à loja e ao usuário local.
- **Pedidos assinados:** no pareamento o celular gera seu par de chaves (Ed25519) e o PC mostra 6 dígitos da chave para o Administrador conferir no celular. Daí em diante o PC só executa pedidos assinados por celulares que ele mesmo aprovou. Nem quem tomasse conta da nuvem conseguiria forjar um reset de senha ou uma venda.
- **Identidade da loja = `empresa.uuid`**, que sobrevive à troca de computador por backup. O primeiro PC se liga sozinho; um PC novo assumindo a loja precisa de aprovação do Administrador no celular. A Central de Licenças não precisa mudar.
- **Plano:** o payload da licença tem o campo opcional `plano`, mas hoje ele guarda só a periodicidade (mensal, anual) e nada no app o usa para liberar recurso. Para o Premium, a Central de Licenças precisa passar a emitir um valor que o app reconheça (ou um campo novo, como `recursos`), e o app só liga a nuvem quando a licença o trouxer.
- Criptografia em trânsito (HTTPS) e em repouso (padrão do Supabase).

## LGPD

A receita óptica é **dado de saúde** (dado pessoal sensível). Para sincronizar:

- Projeto Supabase em **região de São Paulo**.
- Termo de ciência e consentimento da ótica sobre o envio dos dados para a nuvem.
- Opção de **desligar** a sincronização por loja.
- Descartar na nuvem os dados da ótica que encerrar o contrato.

## App do celular

- **Expo (React Native + TypeScript):** notificação confiável (essencial para liberar na hora), biometria, armazenamento seguro das chaves, e reaproveita `src/shared` (dinheiro, períodos, avisos do painel, máscaras, cálculo de venda e os schemas Zod). O mesmo conteúdo é validado no celular, antes de enviar, e no PC, antes de executar.
- **Offline no celular:** mostra a última cópia recebida com "atualizado há X minutos"; pedidos feitos sem internet ficam numa fila no aparelho e sobem quando a conexão voltar.
- Cada pedido mostra o andamento: Enviado → Aguardando a loja → Feito, ou Erro com a mesma mensagem que o PC daria.
- Telas por fase: painéis e listas; usuários (resetar senha, desbloquear, ativar ou desativar) e configurações; pedidos de liberação; vender, baixar parcela e cadastrar cliente.

## Cuidados de implementação

- **Backup restaurado ou banco copiado para outro computador** repete o `sync_dispositivo_id` e faz o `sync_rev` voltar atrás. Tratado na N1: ver "Backup restaurado x banco copiado para outro computador" no Worker de envio (mesmo PC mantém a identidade e faz reenvio total com varredura; outro PC ganha identidade nova e espera aprovação).
- **Carga inicial**: todas as linhas existentes estão na revisão 1, então a primeira sincronização envia tudo (a ótica do cliente tem poucas milhares de linhas por tabela).
- **Relógio do computador**: como só o PC grava, a hora local não decide conflito nenhum. Para a validade dos pedidos vale a hora do servidor.
- **Dois PCs na mesma loja**: fora do escopo (multi-terminal é v2 no PRD). Cada loja tem um único PC executor.
- **Tabelas novas** no schema: acrescentar em `tabelasSincronizaveis.ts` com `desdeMigracao` e gerar as peças na própria migração (nunca editar a 010).

## Limites conhecidos da N1

- Uma linha editada durante uma varredura volta no ciclo seguinte (cerca de 2 minutos): o teto N do ciclo a deixa de fora.
- `ultimoEnvioEm` vive só na memória: depois de fechar e abrir o app a tela não mostra a data do último envio até o primeiro ciclo.
- Com a licença vencida o usuário não consegue desligar a nuvem pela tela (o worker não envia nada nesse estado de qualquer forma).
- Apagar os dados da nuvem pelo app não existe na N1.
- `avisos` no celular pode omitir contas de recorrências ainda não materializadas (o painel é calculado sem completar recorrências).

## Publicar e operar (supabase/)

- Função: `npx supabase functions deploy pc-token --no-verify-jwt` (o PC não tem login do Supabase).
- Segredos da função: `npx supabase secrets set PC_JWT_SECRET=<JWT secret legado do projeto>` e `npx supabase secrets set EXIGIR_RECURSO_NUVEM=false` (passa a `true` quando a Central emitir o recurso `nuvem`). A chave de serviço já existe dentro da função e nunca sai dela. Nunca registre chaves, senhas ou licenças em arquivos do repositório.
- Migrações: **`npx supabase db push` precisa de `--remote` e `--project-ref <ref do projeto>`**; sem isso a CLI aplica no banco local (Docker) e não no projeto da nuvem.
- Teste ao vivo do envio: `src/main/sync/envioNuvem.real.test.ts` só roda com as variáveis de ambiente definidas.

## Fases

Cada fase vira um plano de implementação próprio.

| Fase | Entrega | Depende de |
|---|---|---|
| **N0 Fundação** | Projeto Supabase (São Paulo), schema `optialeph`, tabelas de controle, RLS, `pc-token`, DDL do espelho gerado. **Escrito e validado localmente** em `supabase/migrations/` (`0001_controle.sql` à mão, `0002_espelho.sql` gerado por `scripts/gerar-espelho-supabase.mjs`; um teste falha se o espelho ficar desatualizado). Aplicado no projeto `rywwncecmtmroixtypkm` (`db push` das migrações 0001 a 0003; a 0004 está escrita e ainda precisa ser aplicada) e `pc-token` publicada (`supabase/functions/pc-token`; recusas conferidas na função publicada). Caminho feliz provado com licença real (`scripts/testar-pc-token.mjs`, 2026-11-24): o token é aceito, o PC grava e lê na própria loja e é recusado em outra. `parear` e `notificar` ficam para as fases seguintes. Pendente: confirmar a região São Paulo antes de entrarem dados reais. | Projeto novo na região **São Paulo** (o primeiro foi criado em Ohio, EUA, e não serve para dados reais) e conector do Supabase autorizado |
| **N1 Espelho** | Worker de envio, painel pronto, tela "Nuvem e celular", termo de consentimento. **Implementada**, gravando direto no PostgREST com o token da `pc-token` (sem `sync-push`). Testada com falsos: `consultaEnvio`, `estadoNuvem`, `identidadePc`, `clienteNuvem`, `cicloEnvio`, `painelPronto`, `workerNuvem` e `nuvemService` (`*.test.ts`), incluindo internet caindo no meio do lote (retomar sem duplicar). **Provada ao vivo contra o projeto real em 2026-11-24 para as linhas**: primeiro ciclo envia tudo, o segundo não envia nada, e uma edição e uma exclusão chegam à nuvem. O teste ao vivo achou uma falha de permissão em `painel_snapshot`, corrigida pela migração `0004_painel_upsert.sql`: o upsert do PostgREST atribui todas as colunas, então era preciso UPDATE também em `loja_id` e `periodo` (o RLS `WITH CHECK` continua impedindo mover uma linha para outra loja). **Falta reexecutar o teste ao vivo depois de aplicar a 0004 no projeto** para provar a gravação do painel. Limites conhecidos na seção própria. | N0 |
| **N2 Celular v1** (só leitura) | App Expo, login, pareamento por QR code, painéis e listas | N1 |
| **N3 Fila de pedidos** | Sessão remota, executor, assinatura; pedidos de usuários (reset de senha cifrado, desbloquear, ativar ou desativar) e de configurações | N2 |
| **N4 Liberação na hora** | Pedidos de liberação no balcão + notificação | N3 |
| **N5 Lançamentos pelo celular** | Venda, baixa de parcela e cadastro de cliente, como pedidos | N3 |
| **Futuro, só se precisar** | Gravação direta na nuvem para uma operação que não possa esperar o PC | — |

## Backup na nuvem (Google Drive do cliente), no radar

Não será implementado agora. Hoje os backups ficam na mesma máquina, em `backups/` dentro da pasta de dados. Eles protegem contra erro, arquivo corrompido e atualização com problema, mas **não** contra HD queimado, roubo ou formatação, porque o backup some junto com os dados.

Este item é **independente** da sincronização com o Supabase: o arquivo vai para o Drive **do próprio cliente**, sem passar pela nossa infraestrutura.

**Fase 0 (simples, vale já):** deixar escolher a pasta de destino do backup. Se o cliente apontar para a pasta do "Google Drive para computador", o arquivo sobe sozinho. Sem OAuth, funciona offline e não depende de conta nossa.

**Fase 1 (integração direta com a API do Drive):**
- Login do Google (OAuth) com o escopo `drive.file`: o app só enxerga os arquivos que ele mesmo criou, nunca o resto do Drive. Confirmar no Google Cloud se esse escopo dispensa a verificação demorada da tela de consentimento.
- O token fica guardado com `safeStorage` do Electron, nunca em texto puro; o cliente pode desconectar a qualquer hora.
- Depois de cada backup **íntegro**, enfileirar o envio. Sem internet, tenta de novo depois, sem travar o sistema.
- Enviar um backup por dia ao Drive (não todos os de 4 em 4 horas) e manter uns 30 dias lá, para não encher o espaço do cliente.
- A tela Backup mostra "último envio ao Drive" e alerta se passar de 48 horas sem enviar, como já faz com o backup local.
- Restaurar pelo Drive dentro do app: resolve a **troca de computador** (instala, conecta o Google, baixa o último backup).

**LGPD e segurança:** o backup contém a receita óptica (dado de saúde). Criptografar o arquivo antes de enviar (AES-GCM com `node:crypto`, senha definida pela ótica). Cuidado: sem a senha o backup não abre, então a tela deve avisar isso e pedir para guardá-la.

**Valor comercial:** responde à pergunta "e se meu computador quebrar?" e pode entrar como argumento de venda ou como item de um plano superior.

## Escolhas a conferir

Feitas na definição desta arquitetura, sem pergunta explícita:

- Expo em vez de app web instalável (por causa da notificação e da biometria).
- Um Administrador pode ter várias lojas desde o início (custa pouco agora, caro depois).
- Painel calculado pelo PC e enviado pronto, em vez de reescrever as consultas no Postgres.
- Pedidos assinados pelo celular e conferidos pelo PC (defesa contra nuvem comprometida).
- O reset remoto vale também para a senha do próprio Administrador (exige biometria no celular).
- Receitas entram na cópia da nuvem, com o termo de consentimento.
