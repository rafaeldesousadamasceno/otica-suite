# Nuvem N1: worker de envio, painel pronto e tela "Nuvem e celular" — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O PC da loja envia uma cópia do banco SQLite e um painel pronto para o Supabase (São Paulo), em segundo plano, com liga/desliga e status na tela, sem nunca atrapalhar o uso offline.

**Architecture:** Um worker no processo main acorda a cada 2 minutos, pede um token à Edge Function `pc-token` (já publicada) e grava direto no PostgREST do Supabase com esse token; a RLS da N0 isola a loja. Cada ciclo envia as linhas com `sync_rev` acima do cursor (upsert por `loja_id,uuid`), as exclusões de `sync_exclusao` e o painel calculado pelo mesmo código do painel de hoje. O cursor e a identidade do PC ficam em arquivos de `userData` (não no banco), assim backup restaurado ou banco copiado são detectados.

**Tech Stack:** Electron 44 main (Node, `fetch` global, `node:sqlite`, `node:crypto`, `safeStorage`), TypeScript, zod, React + react-query, vitest. Nuvem: Supabase PostgREST (schema `optialeph`).

**Spec:** `docs/Arquitetura-Sincronizacao.md` (seções "No PC", "Na nuvem", "Cuidados de implementação", fase N1). Contrato da autenticação: `supabase/functions/pc-token/logica.ts` (`textoDaProva`) e `index.ts`.

## Global Constraints

- Rodar testes sempre assim (cwd com **E maiúsculo**, senão a suíte quebra): `cd "E:/OticaSuite" && npx vitest run <arquivo>`. Antes de cada commit: `npm run typecheck` e `npx vitest run` verdes. **Verifique o código de saída do typecheck** (não use `| tail`, que o mascara).
- A senha (`senha_hash` e demais `colunasLocais`) e as chaves de `CHAVES_CONFIGURACAO_LOCAIS` **nunca** entram em corpo enviado à nuvem.
- Só o PC grava na nuvem; o app nunca usa a chave `service_role`. A chave anon/publishable é pública e pode ficar no app.
- Sem internet, nuvem fora do ar ou licença vencida: o app **continua igual**; o worker só registra o status e tenta de novo depois, com intervalo crescente (2 min até 30 min).
- Nomes de coluna de chave estrangeira na nuvem seguem `colunaUuid` de `src/main/sync/gerarEspelhoSupabase.ts` (`cliente_id` → `cliente_uuid`; `criado_por` → `criado_por_uuid`). O `id` inteiro local não viaja.
- Textos de tela e de CHANGELOG em português, sem emojis; toda rota nova do menu precisa de seção de ajuda (teste `src/shared/ajuda/ajuda.test.ts`).
- Ação gravada na auditoria em `MAIUSCULA_SNAKE`, por `auditoriaRepository.registrar` (não existe `auditoriaService.registrar`).
- Mensagens ao usuário nunca expõem detalhe técnico (stack, SQL, resposta crua da nuvem).

## Decisões que mudam o documento de arquitetura (a Task 10 atualiza o documento)

1. **Sem Edge Function `sync-push`.** O PC grava direto no PostgREST com o token da `pc-token`; a RLS e os GRANTs da N0 já impõem "só a própria loja". Menos uma peça para manter. (Já provado: `scripts/testar-pc-token.mjs`.)
2. **Cursor e estado em arquivo** (`userData/nuvem-estado.json`), não em `configuracao`: gravar no banco geraria nova revisão a cada ciclo. Backup restaurado não restaura o arquivo, então `cursor > sync_contador.valor` denuncia a regressão.
3. **Restaurar backup no mesmo PC** mantém o `dispositivo_id` e refaz o envio completo com **varredura**; só **outro PC** (fingerprint diferente ou chave ausente) ganha identidade nova — e a `pc-token` responde 409 até a aprovação pelo celular (fases seguintes). O worker mostra "aguardando aprovação".
4. **Varredura** = reenviar tudo com `recebido_em` novo e, no fim, apagar na nuvem as linhas da loja com `recebido_em` anterior ao início.
5. **Fora da N1:** apagar dados da nuvem pelo app, `parear`, `notificar`, comandos. Desligar apenas para o envio (os dados já enviados ficam).

## Review Focus

1. **Backup restaurado** (cursor maior que o contador): reenvia tudo com varredura, mantendo `dispositivo_id` (Task 4).
2. **Banco copiado para outro PC** (fingerprint diferente ou sem arquivo de chave): identidade nova, e resposta 409 vira status "aguardando aprovação" sem tentar a cada 2 minutos (Tasks 2 e 6).
3. **Internet cai no meio do lote:** cursor não avança, nada duplica ao retomar (Task 4).
4. **Linha com FK nula ou apontando para pai inexistente:** vai com `null`, não quebra o envio (Task 1).
5. **Segredo no corpo:** nenhum `senha_hash`, `tentativas_login`, `bloqueado_ate`, `ultimo_acesso` nem chave local aparece em qualquer requisição (Task 4).
6. Também cobertos: token vencido no meio do ciclo (401 → renova uma vez, Task 3); licença vencida ou ausente (Task 6); mais de 500 linhas (paginação, Task 1).

---

### Task 1: Consulta de envio (linhas locais → formato da nuvem)

**Files:**
- Create: `src/main/sync/consultaEnvio.ts`
- Modify: `src/main/sync/tabelasSincronizaveis.ts` (acrescentar `'nuvem_ligada'` e `'nuvem_consentimento'` a `CHAVES_CONFIGURACAO_LOCAIS`)
- Test: `src/main/sync/consultaEnvio.test.ts`

**Interfaces:**
- Consumes: `TabelaSync`, `TABELAS_SINCRONIZAVEIS` (tabelasSincronizaveis.ts); `InfoTabela`, `colunaUuid` (gerarEspelhoSupabase.ts); `MIGRATIONS` de `@main/db/migrations` (testes).
- Produces:
  - `export const UUID_MAXIMO = '\uffff'`
  - `export interface PosicaoLote { rev: number; uuid: string }`
  - `export function lerInfoTabela(db: DatabaseSync, tabela: string): InfoTabela` (PRAGMA `table_info` e `foreign_key_list`)
  - `export function montarConsultaEnvio(t: TabelaSync, info: InfoTabela): string` — SQL com parâmetros nomeados `:rev`, `:uuid`, `:ate`, `:limite`; colunas = todas menos `id`, menos `colunasLocais`; cada FK vira `(SELECT r.uuid FROM <ref> r WHERE r.id = t.<col>) AS <colunaUuid(col)>`; exclui linhas do `filtroLocal` (`NOT (filtro)`); `ORDER BY sync_rev, uuid`; condição `(t.sync_rev, t.uuid) > (:rev, :uuid) AND t.sync_rev <= :ate`.
  - `export function lerLote(db: DatabaseSync, sql: string, depois: PosicaoLote, ate: number, limite: number): Record<string, unknown>[]`

- [ ] **Step 1: Write the failing tests** (`consultaEnvio.test.ts`, banco em memória com todas as `MIGRATIONS`, helper `banco()` como em `sync.test.ts`)
  - `'não envia senha, tentativas, bloqueio nem último acesso do usuário'`: inserir usuário; `lerLote` da tabela `usuario`; `Object.keys(linha)` não contém `senha_hash`, `tentativas_login`, `bloqueado_ate`, `ultimo_acesso` nem `id`; contém `uuid`, `login`, `sync_rev`.
  - `'configuracao não envia as chaves locais'`: com `nuvem_ligada`, `licenca_local`, `sync_dispositivo_id` e uma chave comum gravadas, só a comum sai.
  - `'FK vira uuid do pai, e FK nula ou órfã vira null'`: venda com `cliente_id` válido → `cliente_uuid` igual ao `uuid` do cliente; venda sem cliente → `cliente_uuid === null`; coluna `criado_por` (FK a usuario) sai como `criado_por_uuid`.
  - `'pagina por (sync_rev, uuid) sem repetir nem perder linhas com a mesma revisão'`: após a 010, 1200 clientes inseridos antes da migração ficam todos com `sync_rev = 1` (montar com `banco(9)` + inserts + migração 10); ler em lotes de 500 a partir de `{rev: 0, uuid: ''}` avançando com a última linha; união = 1200 uuids distintos.
  - `'não devolve o que já foi enviado'`: com `depois = {rev: N, uuid: UUID_MAXIMO}` e `ate = N`, lote vazio; linha alterada depois (rev N+1) com `ate = N+1` aparece.
  - `'respeita o teto ate'`: linha com rev > `ate` não sai.
  - `'toda tabela sincronizável gera SQL executável'`: para cada item de `TABELAS_SINCRONIZAVEIS`, `lerLote(...)` roda sem lançar.

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/main/sync/consultaEnvio.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implement** as assinaturas acima em `consultaEnvio.ts`; acrescentar as duas chaves em `CHAVES_CONFIGURACAO_LOCAIS` (o `as const` continua; `filtroLocal` de `configuracao` deriva dela).
- [ ] **Step 4: Run** `npx vitest run src/main/sync` → todos PASS (inclui `sync.test.ts` e o teste do espelho, que não mudam).
- [ ] **Step 5: Commit** — `git add src/main/sync && git commit -m "N1: consulta de envio das linhas locais para o formato da nuvem"`

---

### Task 2: Estado em arquivo e identidade do PC

**Files:**
- Create: `src/main/sync/estadoNuvem.ts`, `src/main/sync/identidadePc.ts`
- Test: `src/main/sync/estadoNuvem.test.ts`, `src/main/sync/identidadePc.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces:
  - `export interface EstadoNuvem { fingerprint: string; cursor: number }`
  - `export function lerEstado(arquivo: string): EstadoNuvem | null` (arquivo ausente ou JSON inválido → `null`, nunca lança)
  - `export function gravarEstado(arquivo: string, e: EstadoNuvem): void` (escreve em `<arquivo>.tmp` e renomeia)
  - `export interface Cofre { disponivel(): boolean; cifrar(texto: string): Buffer; decifrar(dados: Buffer): string }`
  - `export interface IdentidadePc { dispositivoId: string; chavePublica: string; assinar(dados: Uint8Array): string; nova: boolean }` (`chavePublica` = SPKI DER em base64; `assinar` = Ed25519, retorno base64url)
  - `export interface DepsIdentidade { pasta: string; cofre: Cofre; fingerprint: string; lerDispositivoId(): string; gravarDispositivoId(id: string): void }`
  - `export function carregarIdentidadePc(d: DepsIdentidade): IdentidadePc` — arquivos `nuvem-chave.bin` (chave privada PKCS8 base64 cifrada pelo cofre) e `nuvem-estado.json` em `d.pasta`. Regras: (a) sem chave e sem estado = primeira vez: gera o par, **mantém** o `dispositivoId` do banco, `nova=false`; (b) chave e estado presentes com o mesmo fingerprint: reutiliza, `nova=false`; (c) chave ausente com estado presente, ou fingerprint diferente: gera par novo, **novo** uuid gravado com `gravarDispositivoId`, estado reescrito `{fingerprint atual, cursor: 0}`, `nova=true`; (d) chave presente sem estado (estado perdido): reutiliza a chave, grava estado `{fingerprint, cursor: 0}`, `nova=false`. Cofre indisponível lança `Error('Criptografia do sistema indisponível neste computador.')`.

- [ ] **Step 1: Write the failing tests**
  - estado: `'lê null quando não existe ou está corrompido'`; `'grava e lê de volta'`; `'não deixa .tmp para trás'`.
  - identidade, com `Cofre` falso (base64 reversível) e pasta temporária (`mkdtempSync`):
    - `'primeira vez: gera chave, mantém o id do banco'` (`gravarDispositivoId` não chamado; `nova=false`).
    - `'segunda carga reutiliza a mesma chave pública'`.
    - `'assinatura confere com a chave pública'` (`verify` do node:crypto sobre `textoDaProva` de `supabase/functions/pc-token/logica`).
    - `'fingerprint diferente gera id novo e zera o cursor'` (`nova=true`, `lerEstado().cursor === 0`).
    - `'chave apagada com estado presente gera id novo'`.
    - `'estado perdido reaproveita a chave e não troca o id'`.
    - `'a chave privada nunca fica em texto puro no disco'` (conteúdo de `nuvem-chave.bin` não contém o base64 da privada).
    - `'cofre indisponível lança'`.
- [ ] **Step 2: Run to verify fail** — `npx vitest run src/main/sync/estadoNuvem.test.ts src/main/sync/identidadePc.test.ts` → FAIL.
- [ ] **Step 3: Implement** os dois módulos (`generateKeyPairSync('ed25519')`, `randomUUID`, `sign(null, ...)`, `bytesParaBase64url` de `supabase/functions/pc-token/logica`).
- [ ] **Step 4: Run** os mesmos testes → PASS.
- [ ] **Step 5: Commit** — `git commit -m "N1: estado do envio em arquivo e identidade criptografada do PC"`

---

### Task 3: Cliente da nuvem (token + PostgREST)

**Files:**
- Create: `src/main/sync/clienteNuvem.ts`, `src/main/sync/nuvemConfig.ts`
- Test: `src/main/sync/clienteNuvem.test.ts`

**Interfaces:**
- Consumes: `IdentidadePc` (Task 2); `textoDaProva` de `supabase/functions/pc-token/logica`.
- Produces:
  - `nuvemConfig.ts`: `export const NUVEM_URL = 'https://rywwncecmtmroixtypkm.supabase.co'`; `export function chaveAnon(): string` = `process.env.OPTIALEPH_SUPABASE_ANON ?? CHAVE_ANON_PUBLICADA` (constante string, **vazia até o Rafael fornecê-la**; comentário explica que é a chave publishable do painel, pública, nunca a `service_role`); `export function nuvemConfigurada(): boolean` (`chaveAnon() !== ''`).
  - `export class NuvemErro extends Error { constructor(public codigo: string, public status: number, mensagem: string) }` — `codigo` vem do corpo `erro.codigo` da `pc-token` (ex.: `PC_NOVO_PRECISA_APROVACAO`, `LICENCA_VENCIDA`, `DISPOSITIVO_REVOGADO`) ou `'REDE'` (falha de fetch/timeout, status 0) ou `'NUVEM_HTTP'`.
  - `export interface ClienteNuvem { upsert(tabela: string, linhas: Record<string, unknown>[], recebidoEm: string): Promise<void>; apagar(tabela: string, uuids: string[]): Promise<void>; varrer(tabelas: string[], antesDe: string): Promise<void>; gravarPainel(periodo: string, indicadores: unknown): Promise<void> }`
  - `export interface ConfigCliente { url: string; chaveAnon: string; loja: { id: string; nome: string; cnpj: string | null }; identidade: IdentidadePc; obterLicenca(): string; fetch?: typeof fetch; agora?: () => number }`
  - `export function criarClienteNuvem(c: ConfigCliente): ClienteNuvem`

  Comportamento: token via `POST {url}/functions/v1/pc-token` com `{licenca, loja, dispositivo_id, chave_publica, timestamp (ISO agora), assinatura}`; cache em memória até 5 min antes de `expira_em`. PostgREST: `upsert` = `POST /rest/v1/<tabela>?on_conflict=loja_id,uuid` com `Prefer: resolution=merge-duplicates,return=minimal`, cada linha ganha `loja_id` e `recebido_em`; `apagar` = `DELETE ...?loja_id=eq.<id>&uuid=in.(a,b,...)` em blocos de 100; `varrer` = por tabela `DELETE ...?loja_id=eq.<id>&recebido_em=lt.<antesDe>`; `gravarPainel` = `POST /rest/v1/painel_snapshot?on_conflict=loja_id,periodo` com `{loja_id, periodo, indicadores, gerado_em}`. Headers: `apikey`, `Authorization: Bearer <token>`, `Content-Profile` e `Accept-Profile: optialeph`. Timeout 30 s (`AbortSignal.timeout`). **Resposta 401: descarta o token, pede outro e repete a chamada uma única vez.**

- [ ] **Step 1: Write the failing tests** com `fetch` falso que grava as chamadas (url, método, headers, corpo):
  - `'pede o token com a prova que a pc-token verifica'`: chama `verificarProvaDoPc` real (de `logica.ts`) sobre o corpo capturado → `null`.
  - `'reaproveita o token até 5 minutos antes de vencer'` (duas chamadas, um só POST à função; relógio avançado renova).
  - `'upsert envia loja_id e recebido_em em cada linha e usa on_conflict'`.
  - `'apagar quebra em blocos de 100 uuids'` (250 → 3 DELETEs).
  - `'varrer apaga só o que veio antes do início'` (querystring `recebido_em=lt.<iso>` em cada tabela).
  - `'401 renova o token e repete uma vez; segundo 401 vira NuvemErro'`.
  - `'erro da pc-token vira NuvemErro com o código do corpo'` (409 → `codigo: 'PC_NOVO_PRECISA_APROVACAO'`... usar o literal exato que `supabase/functions/pc-token/index.ts` devolve).
  - `'falha de rede vira NuvemErro REDE'` (fetch lança).
  - `'nenhuma requisição leva a chave de licença fora da chamada da pc-token'` (a licença só aparece no corpo do POST à função).
- [ ] **Step 2: Run to verify fail** — `npx vitest run src/main/sync/clienteNuvem.test.ts` → FAIL.
- [ ] **Step 3: Implement** conforme o comportamento descrito; mensagens de `NuvemErro` curtas em português, sem corpo cru da resposta.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "N1: cliente da nuvem (token da pc-token e PostgREST) com renovação e timeout"`

---

### Task 4: Ciclo de envio (linhas, exclusões, varredura, cursor)

**Files:**
- Create: `src/main/sync/cicloEnvio.ts`
- Test: `src/main/sync/cicloEnvio.test.ts`

**Interfaces:**
- Consumes: `TABELAS_SINCRONIZAVEIS`; `lerInfoTabela`, `montarConsultaEnvio`, `lerLote`, `UUID_MAXIMO` (Task 1); `ClienteNuvem` (Task 3); `EstadoNuvem` (Task 2).
- Produces:
  - `export interface DepsCiclo { db: DatabaseSync; cliente: ClienteNuvem; lerEstado(): EstadoNuvem; gravarEstado(e: EstadoNuvem): void; fingerprint: string; agora(): Date; tamanhoLote?: number /* padrão 500 */ }`
  - `export interface ResultadoCiclo { enviados: number; excluidos: number; varredura: boolean; cursor: number }`
  - `export async function executarCiclo(d: DepsCiclo): Promise<ResultadoCiclo>`

  Algoritmo: `N = SELECT valor FROM sync_contador`; `estado = lerEstado()`; **varredura** se `estado.cursor === 0 || estado.cursor > N` (e então parte de cursor 0, com `inicio = agora().toISOString()`, usado como `recebidoEm` de todos os lotes; sem varredura, `recebidoEm` também é `agora()`); para cada tabela da lista (na ordem de `TABELAS_SINCRONIZAVEIS`) lê lotes de `tamanhoLote` e chama `cliente.upsert`; depois envia exclusões (`sync_exclusao` com `sync_rev > cursor AND sync_rev <= N`, agrupadas por tabela, só de tabelas da lista) com `cliente.apagar` (na varredura, as exclusões são dispensadas: a varredura já apaga); na varredura, `cliente.varrer(todasAsTabelas, inicio)` **depois** de tudo enviado; só então `gravarEstado({fingerprint, cursor: N})` e `DELETE FROM sync_exclusao WHERE sync_rev <= N`. Qualquer exceção sobe sem gravar estado nem apagar exclusões.

- [ ] **Step 1: Write the failing tests** (banco em memória com todas as `MIGRATIONS`; `ClienteNuvem` falso que registra `upsert/apagar/varrer`):
  - `'primeiro ciclo envia tudo, faz varredura e grava o cursor'` (cursor 0 → `varredura: true`; estado final `cursor === N`).
  - `'ciclo sem mudanças não envia nada e não varre'`.
  - `'envia só o que mudou depois do cursor'` (atualizar um cliente → uma linha em `cliente`).
  - `'exclusão vira apagar e limpa sync_exclusao'` (apagar cliente → `apagar('cliente', [uuid])`; tabela `sync_exclusao` esvazia).
  - `'internet cai no meio: cursor e exclusões ficam, e retomar não duplica'` (cliente falso lança na 2ª chamada de `upsert`; estado inalterado; segundo ciclo com cliente bom completa; conjunto de `(tabela, uuid)` recebidos no total não tem repetição além do reenvio do lote que falhou, e o resultado final cobre todas as linhas).
  - `'backup restaurado (cursor maior que o contador): reenvia tudo com varredura'`.
  - `'mais de 500 linhas viram vários lotes'` (1200 clientes → 3 chamadas de `upsert` para `cliente`).
  - `'nenhum corpo enviado contém segredo'`: serializa tudo que o cliente falso recebeu e confere que não há `senha_hash`, `tentativas_login`, `bloqueado_ate`, `ultimo_acesso`, `licenca_local`, `sync_dispositivo_id`, `nuvem_ligada`, `nuvem_consentimento` (inserir usuário com senha e as chaves locais antes).
  - `'a varredura só roda depois de enviar tudo'` (ordem das chamadas: todos os `upsert` antes de `varrer`).
- [ ] **Step 2: Run to verify fail** — `npx vitest run src/main/sync/cicloEnvio.test.ts` → FAIL.
- [ ] **Step 3: Implement** `executarCiclo` conforme o algoritmo.
- [ ] **Step 4: Run** `npx vitest run src/main/sync` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "N1: ciclo de envio com cursor, exclusões e varredura"`

---

### Task 5: Painel pronto (refatorar o dashboard e montar os snapshots)

**Files:**
- Modify: `src/main/services/dashboardService.ts` (extrair o cálculo), `src/main/services/dashboardService.test.ts` (só se um teste existente exigir ajuste de import)
- Create: `src/main/sync/painelPronto.ts`
- Test: `src/main/sync/painelPronto.test.ts`

**Interfaces:**
- Consumes: `DashboardResumo`, `DashboardQuery` (`@shared/types`, `@shared/ipc`); `resolverPreset`, `PRESETS_PERIODO` (`@shared/periodos`, confira os nomes dos presets de hoje, mês atual e mês anterior em `src/shared/periodos.ts:11`); `hojeLocal` (`@shared/data`).
- Produces:
  - em `dashboardService.ts`: `export interface ContextoDashboard { perfil: Perfil; usuarioId: number; completarRecorrencias: boolean }` e `export function calcularResumo(query: DashboardQuery, ctx: ContextoDashboard): DashboardResumo` — é o corpo atual de `obter` sem `requireSessao`; `dashboardService.obter(query)` passa a ser `calcularResumo(query, { perfil: sessao.usuario.perfil, usuarioId: sessao.usuario.id, completarRecorrencias: true })`. **Comportamento da tela inalterado.**
  - `export type PeriodoPainel = 'hoje' | 'mes' | 'mes_anterior' | 'avisos'`
  - `export function montarPaineis(hoje: string): Record<PeriodoPainel, unknown>` — chama `calcularResumo` com `{ perfil: 'admin', usuarioId: 0, completarRecorrencias: false }` para hoje, mês atual e mês anterior (com `comparar: true`); `avisos` = `{ insights, posicao }` do resumo do mês atual.

- [ ] **Step 1: Write the failing tests**
  - `painelPronto.test.ts` (mesmo molde de `dashboardService.test.ts`: `vi.mock('@main/db/connection')`, banco em memória, vendas de teste): `'hoje, mes e mes_anterior trazem faturamento coerente com o período'` (venda de hoje conta só em `hoje` e `mes`; venda do mês passado só em `mes_anterior`); `'avisos traz insights e posicao'`; `'não escreve no banco (não completa recorrências)'` (contagem de `conta_pagar` igual antes e depois, com uma recorrência ativa que geraria contas); `'funciona sem sessão'` (nenhum mock de `requireSessao`).
  - `dashboardService.test.ts` existente continua passando sem alterações de asserção (prova de que a tela não mudou).
- [ ] **Step 2: Run to verify fail** — `npx vitest run src/main/sync/painelPronto.test.ts` → FAIL.
- [ ] **Step 3: Implement** a extração e `montarPaineis`.
- [ ] **Step 4: Run** `npx vitest run src/main/services/dashboardService.test.ts src/main/sync/painelPronto.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "N1: painel pronto calculado pelo mesmo código do painel, sem sessão"`

---

### Task 6: Worker, licença e ligação no app

**Files:**
- Modify: `src/main/license/service.ts` (exportar `obterChaveParaNuvem`), `src/main/index.ts` (iniciar o worker depois de `iniciarAgendadorBackup()`, linha da inicialização em `app.whenReady`), `src/main/services/backupService.ts` (nada a mudar se o worker consultar `getDb()` a cada ciclo — conferir)
- Create: `src/main/sync/workerNuvem.ts`
- Test: `src/main/sync/workerNuvem.test.ts`, `src/main/license/chaveNuvem.test.ts`

**Interfaces:**
- Consumes: `executarCiclo` (Task 4), `criarClienteNuvem`, `NuvemErro`, `nuvemConfigurada`, `chaveAnon`, `NUVEM_URL` (Task 3), `carregarIdentidadePc`, `lerEstado`, `gravarEstado` (Task 2), `montarPaineis` (Task 5), `configuracaoRepository.obter/definir`, `obterFingerprint`, `paths`.
- Produces:
  - em `license/service.ts`: `export function obterChaveParaNuvem(): string | null` — texto da chave instalada **somente** se `lerChaveInstalada()` a validou (assinatura, fingerprint desta máquina) e a licença não está vencida; em modo desenvolvimento (`cobrancaDesligada()`) devolve `null`.
  - em `shared/types.ts`: `export type NuvemEstado = 'desligada' | 'nao_configurada' | 'sem_licenca' | 'aguardando' | 'sincronizando' | 'ok' | 'sem_internet' | 'aguardando_aprovacao' | 'revogado' | 'erro'` e `export interface NuvemStatus { estado: NuvemEstado; ligada: boolean; ultimoEnvioEm: string | null; ultimoErro: string | null; pendentes: number; consentimentoEm: string | null }`
  - `export function iniciarWorkerNuvem(): void` (idempotente; `setInterval` de 2 min com `unref`; primeiro ciclo ~30 s após abrir)
  - `export function pararWorkerNuvem(): void`
  - `export function sincronizarAgora(): Promise<void>` (executa já, ignora o intervalo, não reentra se já sincronizando)
  - `export function obterStatusNuvem(): NuvemStatus`
  - `export function ligarNuvem(consentimento: { versao: number; usuarioId: number }): void` / `export function desligarNuvem(): void` (gravam `nuvem_ligada` e `nuvem_consentimento` por `configuracaoRepository.definir`; ligar dispara `sincronizarAgora`)
  - testável: `export function criarWorker(d: DepsWorker): { ... mesmas funções }` com `DepsWorker` injetando `getDb`, `criarCliente`, `identidade`, `obterLicenca`, `agora`, `timers`; o módulo exporta as funções acima ligadas às dependências reais.

  Regras de estado: sem `nuvem_ligada = '1'` → `desligada`; `!nuvemConfigurada()` → `nao_configurada`; `obterChaveParaNuvem()` nulo → `sem_licenca`; ciclo em andamento → `sincronizando`; sucesso → `ok` (`ultimoEnvioEm`, intervalo volta a 2 min); `NuvemErro` com `REDE`/`NUVEM_HTTP` → `sem_internet`, intervalo dobra até 30 min; `PC_NOVO_PRECISA_APROVACAO` → `aguardando_aprovacao`, tenta só a cada 30 min; `DISPOSITIVO_REVOGADO` → `revogado`, para de tentar até religar; `LICENCA_*` → `sem_licenca`; qualquer outra exceção → `erro` (mensagem genérica em português; detalhe só em `console.error`). Cada ciclo abre `getDb()` de novo (a conexão é trocada ao restaurar backup) e calcula/atualiza o painel depois do envio (`cliente.gravarPainel` para cada período de `montarPaineis`); falha do painel não desfaz o envio das linhas. `pendentes = max(0, sync_contador.valor − cursor)`.

- [ ] **Step 1: Write the failing tests** (`workerNuvem.test.ts` com relógio e timers falsos, `ClienteNuvem` falso, banco em memória):
  - `'desligada: nunca chama a nuvem'`; `'não configurada: não chama a nuvem e diz isso'`; `'sem licença: não chama a nuvem'`.
  - `'ligar dispara o primeiro envio e o status vira ok'`.
  - `'sem internet: status sem_internet e intervalo dobra até 30 minutos'` (2, 4, 8, 16, 30, 30).
  - `'sucesso depois de falha volta o intervalo para 2 minutos'`.
  - `'PC novo precisa de aprovação: status aguardando_aprovacao e só tenta de novo em 30 minutos'`.
  - `'dispositivo revogado: para de tentar'`.
  - `'não roda dois ciclos ao mesmo tempo'` (duas chamadas seguidas de `sincronizarAgora` → um ciclo).
  - `'usa a conexão atual do banco a cada ciclo'` (trocar o banco entre dois ciclos; o segundo lê o novo).
  - `'falha ao gravar o painel não desfaz o envio das linhas'`.
  - `chaveNuvem.test.ts`: `'só devolve a chave quando assinatura e fingerprint conferem'`; `'licença vencida não libera'`; `'modo desenvolvimento devolve null'` (reutilizar as fixtures de `estado.test.ts`/`chave.test.ts` e mocks de `paths`).
- [ ] **Step 2: Run to verify fail** — `npx vitest run src/main/sync/workerNuvem.test.ts src/main/license/chaveNuvem.test.ts` → FAIL.
- [ ] **Step 3: Implement** `obterChaveParaNuvem`, `criarWorker` e as funções do módulo; em `index.ts` chamar `iniciarWorkerNuvem()` logo depois de `iniciarAgendadorBackup()`.
- [ ] **Step 4: Run** `npx vitest run src/main` → PASS; `npm run typecheck:node` com código de saída 0.
- [ ] **Step 5: Commit** — `git commit -m "N1: worker de envio com estados, intervalo crescente e chave da licença"`

---

### Task 7: Serviço, permissão, auditoria, consentimento e IPC

**Files:**
- Modify: `src/shared/permissions.ts` (recurso `'nuvem'`: admin `TUDO`, vendedor sem acesso; entrar em `RECURSOS_POR_MODULO` do admin como `backup`), `src/shared/permissions.test.ts`, `src/shared/ipcChannels.ts` (grupo `nuvem`), `src/shared/ipc.ts` (schema), `src/shared/types.ts`, `src/main/ipc/registerIpc.ts`, `src/preload/index.ts`, `src/renderer/src/env.d.ts`
- Create: `src/main/services/nuvemService.ts`, `src/main/ipc/nuvemIpc.ts`, `src/shared/termoNuvem.ts`
- Test: `src/main/services/nuvemService.test.ts`, `src/shared/termoNuvem.test.ts`

**Interfaces:**
- Consumes: `ligarNuvem`, `desligarNuvem`, `sincronizarAgora`, `obterStatusNuvem` (Task 6); `requirePermissao`; `auditoriaRepository.registrar`.
- Produces:
  - `shared/termoNuvem.ts`: `export const TERMO_NUVEM_VERSAO = 1`; `export const TERMO_NUVEM_TEXTO: string[]` (parágrafos; cobre: o que sobe — cadastros, receitas, vendas, financeiro, **nunca a senha**; servidor em São Paulo; dado de saúde; pode desligar a qualquer hora; dados já enviados ficam na nuvem até a ótica pedir a exclusão).
  - `shared/types.ts`: `NuvemEstado` e `NuvemStatus` já existem (definidos na Task 6); aqui só são usados.
  - `shared/ipc.ts`: `export const nuvemLigarSchema = z.object({ versaoTermo: z.literal(TERMO_NUVEM_VERSAO) })` e `NuvemLigarInput`.
  - Canais em `IPC.nuvem`: `status: 'nuvem:status'`, `ligar: 'nuvem:ligar'`, `desligar: 'nuvem:desligar'`, `sincronizarAgora: 'nuvem:sincronizar-agora'`.
  - `nuvemService`: `obterStatus(): NuvemStatus` (`requirePermissao('nuvem','ver')`); `ligar(input: NuvemLigarInput): void` e `desligar(): void` (`'nuvem','editar'`; auditoria `NUVEM_LIGADA` e `NUVEM_DESLIGADA`, `entidade: 'nuvem'`, `valorNovo: { versaoTermo }`); `sincronizarAgora(): Promise<void>` (`'nuvem','editar'`; exige nuvem ligada, senão `Errors.validacao('Ligue a nuvem antes de sincronizar.')`).

- [ ] **Step 1: Write the failing tests**
  - `permissions.test.ts`: `'vendedor não vê nem edita a nuvem'`; `'admin vê e edita'`.
  - `nuvemService.test.ts` (mocks de `requirePermissao` e do worker): `'ligar grava auditoria NUVEM_LIGADA com a versão do termo'`; `'desligar grava NUVEM_DESLIGADA'`; `'sincronizarAgora com a nuvem desligada falha com mensagem clara'`; `'vendedor é barrado'` (mock lança `semPermissao`); `'versão de termo diferente da atual é recusada pelo schema'` (`nuvemLigarSchema.safeParse({versaoTermo: 99}).success === false`).
  - `termoNuvem.test.ts`: `'o termo cita São Paulo, senha, dado de saúde e desligar'` (cada palavra aparece em algum parágrafo).
- [ ] **Step 2: Run to verify fail** — `npx vitest run src/main/services/nuvemService.test.ts src/shared` → FAIL.
- [ ] **Step 3: Implement** seguindo o padrão `backupIpc.ts`/`backupService.ts`: `handleIpc(IPC.nuvem.status, null, ...)`, `handleIpc(IPC.nuvem.ligar, nuvemLigarSchema, ...)`; registrar em `registerAllIpc()`; preload usa `@shared/ipcChannels` (nunca `@shared/ipc`); declarar o bloco `nuvem` em `env.d.ts`.
- [ ] **Step 4: Run** `npx vitest run` e `npm run typecheck` (verificar código de saída 0) → PASS.
- [ ] **Step 5: Commit** — `git commit -m "N1: serviço, permissão, termo de consentimento e canais IPC da nuvem"`

---

### Task 8: Tela "Nuvem e celular", menu, ajuda e notas de versão

**Files:**
- Create: `src/renderer/src/routes/admin/NuvemPage.tsx`
- Modify: `src/renderer/src/App.tsx` (rota `/nuvem` no bloco só de admin, ao lado de `/backup`), `src/renderer/src/components/layout/navConfig.ts` (item "Nuvem e celular", ícone `Cloud` do lucide, só admin, logo após Backup), `src/shared/ajuda/conteudo.ts` (seção `id: 'nuvem'`, `rotas: ['/nuvem']`, `soAdmin: true`), `CHANGELOG.md` (entrada em "Próxima versão")
- Test: `src/shared/ajuda/ajuda.test.ts` (já cobre rota nova sem ajuda; deve passar após a seção)

**Interfaces:**
- Consumes: `window.api.nuvem.*` e `NuvemStatus` (Task 7); `TERMO_NUVEM_TEXTO`, `TERMO_NUVEM_VERSAO`; componentes `Card/CardHeader/CardTitle/CardBody`, `Button` (`loading`, `variant`), `Badge` (`tone`: `neutral|ok|warn|danger|accent`), `Dialog`, `toast` de `state/toastStore`, `unwrap`/`ApiCallError` de `lib/ipc`; molde `BackupPage.tsx`.
- Produces: rota `/nuvem`.

  Conteúdo da página: Card **Estado** com `Badge` por estado (`ok` → ok; `sincronizando|aguardando` → accent; `sem_internet|aguardando_aprovacao|sem_licenca|nao_configurada` → warn; `revogado|erro` → danger; `desligada` → neutral) e frase em português para cada um (ex.: `sem_internet`: "Sem internet. O sistema continua funcionando e tenta de novo sozinho."; `aguardando_aprovacao`: "Este computador precisa ser aprovado pelo Administrador no celular."), último envio, alterações pendentes e último erro. Botões: **Ligar** (abre `Dialog` com `TERMO_NUVEM_TEXTO` e caixa "Li e concordo"; só habilita depois de marcar) / **Desligar** (confirmação simples) / **Sincronizar agora** (só ligada). `useQuery(['nuvemStatus'])` com `refetchInterval: 15000`. Aviso fixo: o celular ainda não está disponível nesta versão.

- [ ] **Step 1: Write the failing test** — `npx vitest run src/shared/ajuda/ajuda.test.ts` falha depois de acrescentar o item no `navConfig.ts` (rota sem seção de ajuda). Acrescente o item antes de escrever a ajuda para ver o teste falhar.
- [ ] **Step 2: Run to verify fail** — mesmo comando → FAIL ("/nuvem sem seção de ajuda").
- [ ] **Step 3: Implement** a página, a rota, o item de menu, a seção de ajuda (blocos `paragrafo`, `passos` para ligar, `atencao` sobre dado de saúde e sobre "não é backup do computador") e a entrada do CHANGELOG no formato `- Nuvem: ...` (prosa para o usuário final, linhas de ~85 colunas, sem emojis).
- [ ] **Step 4: Run** `npx vitest run` e `npm run typecheck` (código de saída 0) → PASS. **Conferir visualmente** (memória do projeto: shell tem `ELECTRON_RUN_AS_NODE=1`; use `env -u ELECTRON_RUN_AS_NODE`, janela oculta e `capturePage`) que a página abre e que ligar exige marcar o termo.
- [ ] **Step 5: Commit** — `git commit -m "N1: tela Nuvem e celular, ajuda e notas de versão"`

---

### Task 9: Teste de integração contra o projeto real

**Files:**
- Create: `src/main/sync/envioNuvem.real.test.ts`

**Interfaces:**
- Consumes: `executarCiclo` (Task 4), `criarClienteNuvem`, `NUVEM_URL` (Task 3), `carregarIdentidadePc` (Task 2), `verificarChave` (`src/main/license/chave.ts`, só para validar a licença antes).
- Produces: teste vitest que **só roda** quando `OPTIALEPH_SUPABASE_ANON` e `LICENCA` estão definidas (`describe.skipIf(!process.env.OPTIALEPH_SUPABASE_ANON || !process.env.LICENCA)`); a suíte normal o pula. Usa um banco em memória com todas as `MIGRATIONS`, uma loja de teste própria (`empresa.uuid` aleatório, nome "LOJA DE TESTE (apagar)") e uma identidade temporária (pasta `mkdtempSync`). Lê a nuvem pela API REST com a mesma chave anon e o token do cliente.

- [ ] **Step 1: Write the test** com estes passos (cada um um `it` sequencial, `--no-file-parallelism` não é necessário): (1) `'primeiro ciclo envia tudo'`: inserir 3 clientes e 1 usuário com senha; `executarCiclo`; contar na nuvem `cliente` = 3 e `usuario` = 1, e a linha de `usuario` na nuvem não tem coluna `senha_hash`; (2) `'segundo ciclo não reenvia'`: resultado `enviados === 0`; (3) `'alteração e exclusão chegam'`: renomear um cliente e apagar outro; ciclo; nuvem tem 2 clientes e o nome novo; (4) `'painel é gravado'`: `gravarPainel('hoje', {x:1})` e leitura de `painel_snapshot`; (5) limpeza: no `afterAll`, apagar a linha de `loja` de teste (a cascata remove o resto) usando só o token do PC se a RLS permitir, senão imprimir o id da loja para apagar no painel.
- [ ] **Step 2: Run** sem variáveis: `npx vitest run src/main/sync/envioNuvem.real.test.ts` → teste pulado (0 falhas). Com variáveis (PowerShell: `$env:OPTIALEPH_SUPABASE_ANON=...; $env:LICENCA=...`): todos PASS. A licença e a chave **nunca** entram em arquivo versionado nem em saída.
- [ ] **Step 3: Commit** — `git commit -m "N1: teste de integração do envio contra a nuvem (só roda com variáveis)"`

---

### Task 10: Atualizar o documento de arquitetura

**Files:**
- Modify: `docs/Arquitetura-Sincronizacao.md`

- [ ] **Step 1:** Trocar a Edge Function `sync-push` por "gravação direta no PostgREST com o token da `pc-token`" (seções "No PC → Worker de envio", tabela "Edge Functions", fase N1); registrar o cursor em `nuvem-estado.json`, a identidade em `nuvem-chave.bin`, as duas chaves locais novas (`nuvem_ligada`, `nuvem_consentimento`), a regra de backup restaurado × banco copiado e a varredura por `recebido_em`; marcar "Fora da N1: apagar dados da nuvem pelo app". Atualizar a linha da fase N1 com o status.
- [ ] **Step 2:** `npx vitest run` verde (nenhum teste lê o documento).
- [ ] **Step 3: Commit** — `git commit -m "N1: documento de arquitetura atualizado com as decisões da implementação"`

---

## Verificação final (depois da Task 10)

1. `cd "E:/OticaSuite" && npx vitest run` e `npm run typecheck` com código de saída 0.
2. Task 9 (teste de integração) verde com as variáveis definidas, ou registrada como pendente.
3. Conferência manual no app em desenvolvimento com `OTICASUITE_FORCAR_LICENCA=1` e `OPTIALEPH_SUPABASE_ANON` definido: ligar na tela, ver "Enviando" e depois "Em dia"; desligar a internet e ver "Sem internet" com o app funcionando normalmente; conferir no painel do Supabase (Table Editor, schema `optialeph`) que `usuario` não tem `senha_hash` e que `painel_snapshot` tem as quatro linhas.
