# Ótica Suite

Sistema de gestão desktop, white-label, para óticas — construído a partir do
PRD em [`../docs/PRD-Sistema-Otica.md`](../docs/PRD-Sistema-Otica.md), que por
sua vez avalia e evolui o sistema anterior (MD Óculos, Java Swing + MySQL).

## Stack

| Camada | Tecnologia | Por quê |
|---|---|---|
| Shell | Electron 44 | Desktop, offline-first |
| UI | React 19 + TypeScript + Tailwind CSS v4 | Interface moderna, tipada |
| Banco | **`node:sqlite`** (builtin do Node/Electron) | Zero módulo nativo, zero passo de rebuild no instalador |
| Senha | **`hash-wasm`** (Argon2id em WebAssembly) | Idem — sem binário nativo |
| Estado | Zustand + TanStack Query | Sessão local + cache de dados do IPC |
| Empacotamento | electron-builder (NSIS) | Instalador Windows único |

A escolha de `node:sqlite` e `hash-wasm` no lugar de `better-sqlite3`/`argon2`
nativos foi deliberada: elimina o maior risco de instalação de um app
Electron (recompilar módulos nativos para o ABI do Electron) sem abrir mão de
nenhum requisito do PRD — verificado rodando dentro do processo main real do
Electron, não só em Node standalone.

## Como rodar

```bash
npm install
npm run dev          # abre o app com hot-reload
npm run typecheck    # main/preload + renderer, em tsconfigs separados
npm test             # vitest (lógica pura: CPF, matriz de permissões)
npm run build        # gera out/ (main, preload, renderer)
npm run dist:win     # gera o instalador NSIS em release/ (resources/icon.png já incluso - converte para .ico sozinho)
```

Na primeira execução, o app abre o **wizard de configuração** (RF-02): nome da
ótica e o usuário Administrador inicial. Não existe login padrão de fábrica —
é você quem cria o primeiro Administrador na tela de setup.

## Arquitetura

```
src/
├── main/            processo Node — o único lugar com SQL e com decisão de permissão
│   ├── db/          conexão (node:sqlite) + migrations versionadas
│   ├── auth/        hash de senha, sessão em memória, checagem de permissão
│   ├── repositories/  SQL isolado aqui, nada de query solta em serviço/IPC
│   ├── services/    regras de negócio (RN-xx do PRD) + auditoria
│   └── ipc/         um handler por canal; valida com Zod, nunca confia no renderer
├── preload/         contextBridge — só repassa chamadas, zero lógica
├── renderer/         React — sem Node, sem SQL, só window.api
└── shared/          tipos, contrato de IPC (Zod) e a matriz de permissões
```

A regra que importa: **a permissão é decidida no processo `main`**, dentro de
cada `service`, nunca no renderer. Uma checagem só na UI é conveniência, não
segurança — o DevTools contornaria isso. `src/shared/permissions.ts` é dado
(recurso → ações por perfil), não um `if (perfil === 'admin')` espalhado pelo
código — acrescentar um perfil novo (Gerente, Caixa) é editar um arquivo, não
reescrever telas.

## O que já funciona (F0–F4 e F7 completas; F5 quase completo; F6 em andamento)

- **RF-02** Setup inicial (empresa + Administrador)
- **RF-03** Login com Argon2id, bloqueio progressivo, troca de senha
  obrigatória no primeiro acesso, autorização pontual de Admin (backend
  pronto — o gatilho na UI chega com o módulo de Vendas)
- **RF-01** White-label: logo (upload real, PNG/JPG/SVG), cor de destaque,
  tema claro/escuro/automático, dados da ótica
- **RF-04** Clientes: CRUD completo, busca, validação de CPF por dígito
  verificador, aniversariantes, remoção que vira inativação quando há
  histórico (RN-13)
- **RF-05** Receita óptica: grade OD/OE × longe/perto, cálculo automático de
  perto = longe + adição (RN-02), histórico versionado por cliente
- **RF-06** Ordem de Serviço: numeração sequencial atômica (`AAAA-NNNNN`,
  RN-01), máquina de estados `EM ABERTO → LABORATÓRIO → CHEGOU → ENTREGUE`
  com `CANCELADA` a qualquer momento (RN-04), alerta de atraso, integrada à
  ficha do cliente e a uma tela própria com busca/filtro — que também serve
  de "Protocolo de saída"; só falta a versão impressa em PDF (chega com o
  RF-12, fase F5)
- **RF-07** Produtos: armação/lente/acessório/serviço, campos específicos de
  lente (material, índice, tipo, faixa de grau), sugestão de preço pela
  margem (RN-09), custo e margem **redigidos na origem** — não só escondidos
  na tela — para quem não tem a permissão `produtos.custo_margem` (CA3)
- **RF-10** Vendas: múltiplos itens, pagamento misto, parcelamento com
  resíduo de arredondamento sempre na 1ª parcela (RN-06), desconto por item
  e no total, vínculo opcional com receita óptica e OS, baixa de estoque e
  lançamento financeiro **na mesma transação** (RN-05, resolve o D9),
  comissão provisionada e **liberada automaticamente na quitação** (RN-08 —
  imediata numa venda à vista, ou quando a última parcela é baixada).
  **Cancelamento com estorno** (RN-11): devolve o estoque, lança um
  lançamento de DESPESA compensatório cobrindo o que já tinha entrado
  (à vista e/ou parcelas já pagas) e cancela a comissão — tudo numa única
  transação. **RN-07 e RF-03.4 em produção**: um Vendedor que passa do teto
  de desconto (ou tenta cancelar uma venda) é barrado até um Administrador
  autorizar ali mesmo, sem trocar de sessão
- **RF-11.1** Contas a receber: baixa total ou parcial de parcela com
  lançamento de receita automático (resolve o D9 também aqui — nenhuma baixa
  fica sem financeiro), tela própria com filtro por situação e destaque de
  vencidas; Vendedor só vê e baixa parcelas das próprias vendas
- **RF-08** Estoque: consulta de saldo com filtro por categoria e situação
  (abaixo do mínimo/zerado), ajuste de inventário (contagem física vira
  movimentação rastreável, exclusivo do Admin — RN-10). **CA2 configurável**:
  quando ligado em Configurações, vender sem saldo suficiente passa a exigir
  autorização de Admin pelo mesmo mecanismo do RF-03.4 — na prática, um
  Vendedor sozinho fica de fato impedido, o que cobre os dois modos que o
  PRD descreve ("bloqueado ou exige autorização") com um só interruptor
- **RF-09** Fornecedores (CRUD) e Compras: ordem de compra com itens
  (situação `ABERTA`) separada da **entrada de mercadoria**, que dá saldo
  no estoque, recalcula o custo do produto por média ponderada e gera a
  conta a pagar — tudo **na mesma transação** (CA1/CA2); módulo exclusivo
  do Administrador
- **RF-11.2** Contas a pagar: lançamento manual (aluguel, energia…) ou
  gerado pela entrada de mercadoria, baixa total ou parcial com lançamento
  de despesa automático; despesa **recorrente** gera sozinha a próxima
  ocorrência (um mês à frente) quando quitada — a "repetição automática" do
  PRD sem precisar de agendador separado
- **RF-15** Auditoria (somente leitura) das ações acima
- Dois módulos de acesso (Administrador / Vendedor) com navegação e dados
  filtrados de verdade, não só botões escondidos — inclusive "Vendedor só
  vê as próprias vendas", que é filtro de dado no serviço, não só de tela
- Uma tela de **Configurações → Operacional** nova: os parâmetros que já
  existiam na tabela `configuracao` desde o início (limite de desconto,
  comissão padrão, dias de garantia, prefixo da OS) só podiam ser mudados
  editando o banco direto — agora têm uma tela, junto com o novo
  interruptor do RF-08 CA2
- **RF-11.3** Fluxo de caixa: lançamentos do período com total de receitas,
  despesas e saldo
- **RF-11.4** Lucro/Prejuízo, **RN-12**, funcionando de verdade (o D8 do
  sistema anterior — o método existia mas estava todo comentado). Duas
  visões do mesmo período: **regime de caixa** (o que entrou/saiu de fato,
  a partir de `lancamento`) e **regime de competência** (reconhece a
  receita na data da venda e a despesa no vencimento da conta a pagar,
  independente de quando o dinheiro mudou de mão — decisão documentada em
  `financeiroRepository.ts`, já que o schema não guarda uma "data de
  competência" separada). Detalhamento por categoria de despesa e margem
  bruta por produto (usando o **custo atual** do produto, não um custo
  histórico por venda — o schema não guarda esse snapshot)
- **RF-14** Dashboard completo: painel do Admin (vendas hoje/mês com
  comparativo, saldo do mês, contas a receber/pagar vencendo, produtos
  abaixo do mínimo, OS atrasadas, aniversariantes da semana, ranking de
  vendedores) e do Vendedor (vendas próprias, comissão acumulada, OSs sob
  responsabilidade) — cada indicador é clicável e leva à tela correspondente
- Todo o F5 acima (fluxo de caixa, lucro/prejuízo, dashboard) foi
  **implementado com 3 agentes em paralelo**: um cuidou do backend
  financeiro (a parte com julgamento contábil), outro do backend do
  dashboard, outro das telas — coordenados por um contrato de tipos/IPC
  fechado antes de disparar os agentes, para não haver dois processos
  editando o mesmo arquivo compartilhado ao mesmo tempo
- **RF-13.1/13.2/13.3** Backup: manual (um clique) e automático (checagem a
  cada 1h, gera um novo backup se já se passaram ≥4h desde o último — RF-13.1
  simplificado para um `setInterval`, sem cron externo), via `VACUUM INTO` do
  próprio SQLite (snapshot consistente, sem parar a aplicação), com
  verificação de integridade (`PRAGMA integrity_check`) em todo backup
  listado, retenção (30 arquivos, simplificação do "30 diários + 12
  mensais" do PRD) e alerta quando não há backup íntegro nas últimas 48h.
  Restauração exige digitar "RESTAURAR" para confirmar, sempre tira um
  backup de segurança do estado atual antes de sobrescrever, e nunca aceita
  um caminho de arquivo fora da pasta de backups
- **RF-13.4** Licenciamento offline: chave assinada com **Ed25519** (`node:crypto`,
  sem dependência externa), validada 100% offline contra uma chave pública
  embutida no app. Fingerprint da máquina simplificado para o **Machine GUID**
  do Windows (o PRD pedia CPU+placa-mãe+disco; ler esses números de forma
  confiável exige WMI ou um addon nativo — fora de escopo aqui; o GUID
  sobrevive a troca de RAM/GPU/disco secundário e só muda numa reinstalação
  do Windows, que já é o gatilho de reativação previsto no CA4). Estados
  (não ativada / ativa / próxima do vencimento / carência / vencida) com
  cache de 5 min para não reprocessar a cada chamada de IPC. Licença vencida
  (além dos 15 dias de carência) trava toda escrita no sistema pelo mesmo
  `requirePermissao` que já existia — nunca bloqueia backup nem a própria
  tela de licença, e nunca apaga dado nenhum (RN-16). **Decisão deliberada**:
  diferente do "não ativado: só o wizard" do PRD, uma instalação sem
  licença ainda funciona normalmente (não bloqueei o primeiro uso porque não
  há hoje um processo de emissão de chave em produção — só o modo
  *vencida*, que pressupõe uma licença que já existiu, é hard-block).
  Ferramenta de emissão separada em `tools/gerar-licenca.mjs` (roda com
  `node tools/gerar-licenca.mjs --otica "..." --fingerprint XXXX --tipo
  anual --validade AAAA-MM-DD`), usando uma chave privada local
  (`tools/chave-privada.pem`, gerada nesta sessão, **nunca commitada** —
  ver `.gitignore`) que nunca deve sair da sua máquina
- **Instalador Windows gerado e verificado de verdade**: `npm run dist:win`
  rodou nesta sessão e produziu `release/Ótica Suite Setup 0.1.0.exe`
  (~117 MB) com sucesso — confirma que `resources/icon.png` converte para
  `.ico` corretamente e que o empacotamento NSIS funciona ponta a ponta.
  Não testei rodando o instalador em si (o Electron não abre janela GUI
  neste ambiente)
- **F7 — Migração do MD Óculos** (PRD seção 11): ferramenta em
  **Importar Dados** (menu do Admin), que conecta direto no MySQL do
  sistema antigo (`mysql2` — cliente puro em JS, sem binário nativo,
  mantendo a filosofia de zero módulo compilado do projeto) e converte
  `clientes`, `exames` e `receitas_despesas` para o schema novo. Cada exame
  antigo vira receita óptica + venda + item genérico "Item importado" +
  ordem de serviço + lançamento financeiro, numa única transação por
  registro (RN-05). **Idempotente de verdade** (CA1): uma tabela nova,
  `migracao_registro`, guarda o mapeamento origem→destino de cada linha já
  importada, então rodar a importação duas vezes nunca duplica. Nunca
  tudo-ou-nada (CA4): cada registro é processado isoladamente — um que falha
  vira um aviso na lista, os outros continuam sendo importados. O banco de
  origem é só leitura (CA3). Simplificações documentadas no código: a
  numeração de OS/venda migradas usa o prefixo `MDO-<id antigo>` (nunca
  colide com o formato novo `AAAA-NNNNN`); o vendedor de uma venda migrada é
  quem estiver logado fazendo a importação (o sistema antigo não guardava
  autoria); a "data de entrega" de uma OS já `ENTREGUE` reaproveita a data
  de chegada do laboratório, porque o sistema antigo não rastreava essas
  datas separadamente
- **RF-11.3 Caixa**: abertura (saldo inicial) e fechamento (saldo contado
  vs. saldo esperado, com a diferença destacada), sangria e suprimento —
  cada um é um `lancamento` comum (categoria `SANGRIA`/`SUPRIMENTO`), sem
  tabela nova. **Simplificação documentada**: como `lancamento.data` só
  guarda o dia (sem hora) e não existe vínculo direto entre `lancamento` e
  `caixa`, o "saldo esperado" soma todo lançamento do dia civil da
  abertura — se dois caixas abrirem no mesmo dia, o esperado de cada um
  inclui o movimento do dia inteiro. Também não distingue forma de
  pagamento (dinheiro vs. cartão/PIX), então quem fecha o caixa ainda
  precisa saber separar isso na hora de contar o dinheiro físico
- **RF-12 (parcial)** Relatórios em PDF: os dois mais aguardados desde o F2
  — **OS/receita óptica** e **Protocolo de Saída** — agora imprimem de
  verdade, usando o próprio Chromium do Electron (`webContents.printToPDF`
  numa janela oculta) em vez de instalar o Puppeteer inteiro (que baixaria
  um segundo Chromium). Layout novo (não é cópia pixel-a-pixel do Jasper
  antigo, que não está disponível), cobrindo os mesmos campos: cabeçalho da
  ótica, grade OD/OE completa, linha de assinatura do cliente na entrega.
  Os outros ~12 relatórios do PRD (comprovante de venda, carnê de parcelas,
  fluxo de caixa impresso, inadimplência, curva ABC etc.) ainda não existem

## O que ainda não está implementado

- **F6 (restante)**: RF-16 Atualização do app — verificação online de nova
  versão (não há servidor/feed de release hospedado ainda, então isso é
  puramente teórico por ora); a migração automática com backup obrigatório
  antes e o rollback documentado também não foram amarrados ao fluxo de boot
- **F7** concluído (ver abaixo)

## Decisões que valem registrar

- **Local dos dados**: `app.getPath('userData')` em vez do
  `%PROGRAMDATA%\<NomeOtica>` sugerido no PRD — evita exigir administrador e
  não depende do nome da ótica, que só existe depois do wizard. Ver
  `src/main/paths.ts`.
- **Profissional (optometrista)**: cadastro auxiliar, criado automaticamente
  pelo nome digitado na receita (PRD seção 17, decisão Q1) — vira perfil de
  usuário só quando houver demanda.
- **Sessão não é persistida em disco**: fechar o app exige login de novo,
  como um PDV. Evita todo o problema de token com expiração/roubo de arquivo.
