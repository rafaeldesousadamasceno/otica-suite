# Sincronização com a nuvem e app de celular: arquitetura

Status: **só a base do banco está pronta** (migração 010). Nenhum dado sai do computador ainda. Este documento define como o resto será construído, para o app Premium de gestão no celular e para o backup online.

## Objetivo

1. Continuar funcionando **offline** como hoje: o banco local (SQLite) é a fonte de verdade do dia a dia.
2. Quando houver internet, **enviar as alterações para a nuvem** (backup online e base do app de celular).
3. Mais adiante, **receber** alterações da nuvem (vários computadores e lançamentos feitos pelo celular).

Escolha de nuvem: **Supabase** (Postgres gerenciado, autenticação e API prontos, sem servidor próprio para manter).

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

## O que não sincroniza

- `_migrations`, `migracao_registro`, `sync_contador`, `sync_exclusao`.
- Em `usuario`: `senha_hash`, `tentativas_login`, `bloqueado_ate`, `ultimo_acesso`. **A senha nunca sai do computador.**
- Em `configuracao`: as chaves `licenca_local` e `sync_dispositivo_id`.
- Arquivos de licença, sessão e backups.

## Fases

### S1: espelho (computador → nuvem)

- Um worker no processo main acorda quando há internet e a cada poucos minutos.
- Para cada tabela: lê as linhas com `sync_rev` maior que o último enviado e faz **upsert por uuid** na nuvem. Depois envia as exclusões de `sync_exclusao`.
- O computador continua sendo a fonte principal. Se a nuvem estiver fora do ar, nada muda para a ótica: o worker tenta de novo depois.
- Chaves estrangeiras vão como uuid (o worker traduz `cliente_id` em `cliente_uuid` ao enviar).
- Resultado: backup online e dados para o app de celular **somente leitura**.

### S2: dois sentidos (várias origens)

- O worker também **recebe**: pede à nuvem as linhas com revisão maior que a última recebida e aplica localmente, por uuid.
- Conflito de edição no mesmo registro: **vale a última alteração** (`atualizado_em`, desempate pelo `sync_dispositivo_id`).
- Registros que só acrescentam (`somenteAcrescenta` na lista: lançamentos, recebimentos, pagamentos, movimentos de estoque, auditoria) **não têm conflito**: o que existe de um lado e não do outro apenas é copiado.
- Regras de negócio que dependem de ordem (saldo de estoque, comissão liberada ao quitar) continuam sendo calculadas por quem grava; o worker aplica o resultado, não refaz a regra.
- Habilita: lançar venda ou baixar parcela pelo celular, e mais de um computador na loja.

## Segurança

- A chave `service_role` do Supabase **nunca** vai dentro do app.
- O app troca a **chave de licença + fingerprint** por um JWT de curta duração numa Edge Function, que devolve um `loja_id` no token.
- A política de acesso por linha (RLS) do Supabase filtra tudo por `loja_id`: uma ótica nunca enxerga outra.
- Criptografia em trânsito (HTTPS) e em repouso (padrão do Supabase).
- O app de celular entra com o usuário da ótica; o perfil (Administrador ou Vendedor) é respeitado também na nuvem, com as mesmas regras de `src/shared/permissions.ts`.

## LGPD

A receita óptica é **dado de saúde** (dado pessoal sensível). Para sincronizar:

- Projeto Supabase em **região de São Paulo**.
- Termo de ciência e consentimento da ótica sobre o envio dos dados para a nuvem.
- Opção de **desligar** a sincronização por loja.
- Descartar na nuvem os dados da ótica que encerrar o contrato.

## Cuidados de implementação

- **Backup restaurado ou banco copiado para outro computador** repete o `sync_dispositivo_id`. O worker precisa detectar (o fingerprint da licença muda) e gerar um novo identificador antes de enviar.
- **Relógio do computador**: `atualizado_em` usa o relógio local. Para o desempate de conflito vale usar `sync_rev` do dispositivo e a hora do servidor no recebimento.
- **Carga inicial**: todas as linhas existentes estão na revisão 1, então a primeira sincronização envia tudo (a ótica do cliente tem poucas milhares de linhas por tabela).
- **Tabelas novas** no schema: acrescentar em `tabelasSincronizaveis.ts` e gerar uma migração própria (nunca editar a 010).

## App de gestão no celular (Premium), no radar

Não será implementado agora. Depende de S1 para painéis de leitura e de S2 para lançar dados pelo celular.

- **Plano**: o payload da licença já tem o campo `plano`; ele liberará o "premium".
- **Painéis**: as consultas do painel gerencial viram views ou funções no Postgres, com a mesma lógica (regime de caixa, rateio do desconto, custo da época da venda).
- **Primeira versão sugerida** (somente leitura): faturamento do dia e do mês com comparação, contas vencidas, OS atrasadas e prontas, estoque baixo e os avisos do painel (insights).
- **Segunda versão**: aprovar descontos, consultar cliente e receita, avisos por notificação.
- Tecnologia a decidir (app nativo ou web instalável); a escolha não afeta a base de dados.

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

## Próximos passos

1. Criar o projeto Supabase (região de São Paulo) e o esquema espelho das tabelas da lista.
2. Edge Function de troca de licença por JWT.
3. Worker S1 (envio), com tela de status e botão "sincronizar agora" em Configurações.
4. Testes com a internet caindo no meio do envio (retomar sem duplicar).
5. S2, depois que S1 estiver estável em uma ótica.

Para começar o passo 1 é preciso autorizar o conector do Supabase na conta.
