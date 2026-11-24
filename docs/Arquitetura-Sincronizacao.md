# Nuvem e app do Administrador no celular: arquitetura

Status: **só a base do banco está pronta** (migração 010). Nenhum dado sai do computador ainda. Este documento define como o resto será construído: o espelho da loja na nuvem, o app de celular do Administrador (plano Premium) e o backup online.

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
- Em `configuracao`: as chaves de `CHAVES_CONFIGURACAO_LOCAIS` (hoje `licenca_local` e `sync_dispositivo_id`; as chaves novas deste documento entram lá).
- Arquivos de licença, sessão e backups.

## No PC: o que muda no app

### Worker de envio

- Acorda quando há internet e a cada poucos minutos, no processo main.
- Para cada tabela: lê as linhas com `sync_rev` maior que o último enviado, troca `cliente_id` por `cliente_uuid` (e assim por diante), omite `colunasLocais` e as linhas de `filtroLocal`, e envia em lotes para a Edge Function `sync-push`, que faz **upsert por uuid** (reenviar o mesmo lote não duplica nada). Depois envia as exclusões de `sync_exclusao`.
- O cursor de envio só avança depois que a nuvem confirma o lote. Internet caiu no meio: o próximo ciclo reenvia o lote inteiro.
- Se a nuvem estiver fora do ar, nada muda para a ótica: o worker tenta de novo depois, com intervalo crescente.

### Painel pronto

A cada ciclo o PC calcula os indicadores com o `dashboardService` que já existe (hoje, mês, mês anterior, os avisos do painel) e envia o resultado pronto para `painel_snapshot`. A regra de cálculo (regime de caixa, rateio do desconto, custo da época) continua num lugar só. Listas simples (contas vencidas, OS atrasadas ou prontas, estoque baixo) o celular consulta direto na cópia.

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

- Migrações novas: `comando_executado`; coluna `origem` na auditoria (balcão ou celular); chaves locais em `configuracao` (cursor de envio, chaves do PC, celulares aprovados), todas acrescentadas a `CHAVES_CONFIGURACAO_LOCAIS`.
- Tela **"Nuvem e celular"** em Configurações: ligar ou desligar, termo de consentimento (LGPD), último envio, "sincronizar agora", "conectar celular" (QR code), lista de celulares conectados com opção de revogar.

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
| `pc-token` | Recebe a licença (assinada pela Central) e uma assinatura feita com a chave do PC; devolve um token de curta duração. |
| `parear` | Troca o código do QR code por um vínculo conta ↔ loja ↔ usuário local. |
| `sync-push` | Recebe os lotes do worker e faz upsert por uuid. |
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

- **Backup restaurado ou banco copiado para outro computador** repete o `sync_dispositivo_id` e faz o `sync_rev` voltar atrás. O worker precisa detectar (o fingerprint da licença muda ou a revisão regride), gerar uma nova identidade e fazer um **reenvio total com varredura**: a nuvem apaga da cópia o que não veio.
- **Carga inicial**: todas as linhas existentes estão na revisão 1, então a primeira sincronização envia tudo (a ótica do cliente tem poucas milhares de linhas por tabela).
- **Relógio do computador**: como só o PC grava, a hora local não decide conflito nenhum. Para a validade dos pedidos vale a hora do servidor.
- **Dois PCs na mesma loja**: fora do escopo (multi-terminal é v2 no PRD). Cada loja tem um único PC executor.
- **Tabelas novas** no schema: acrescentar em `tabelasSincronizaveis.ts` com `desdeMigracao` e gerar as peças na própria migração (nunca editar a 010).

## Fases

Cada fase vira um plano de implementação próprio.

| Fase | Entrega | Depende de |
|---|---|---|
| **N0 Fundação** | Projeto Supabase (São Paulo), schema `optialeph`, tabelas de controle, RLS, `pc-token`, DDL do espelho gerado | Autorizar o conector do Supabase na conta |
| **N1 Espelho** | Worker de envio, painel pronto, tela "Nuvem e celular", termo de consentimento. Testes com a internet caindo no meio do lote (retomar sem duplicar). | N0 |
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
