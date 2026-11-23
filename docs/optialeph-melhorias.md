# Tarefa: pacote de melhorias no OptiAleph (Prescrição, OS, Produto, Vendas, Contas a Pagar)

## 1. Contexto
Você vai trabalhar no **OptiAleph**, sistema desktop para óticas e optometristas (Electron + TypeScript). Clientes reais já usam o sistema, então **nenhuma mudança pode perder ou corromper dados**. Está prevista uma sincronização offline→online no futuro, e as decisões de modelagem abaixo já consideram isso.

## 2. Como trabalhar
1. **Antes de codar**, explore o repositório e me devolva um plano curto com:
   - o que você encontrou: camada de dados/ORM, migrations, componentes de formulário, padrão de seção recolhível (sanfona), templates de impressão e tela de Configurações;
   - os arquivos que vai alterar ou criar;
   - as migrations necessárias;
   - suas dúvidas.
   **Aguarde meu OK antes de começar.**
2. Implemente **por fases** (seção 12). Faça um commit por fase e deixe o sistema funcionando ao fim de cada uma.
3. Siga as convenções do projeto (pastas, nomes, biblioteca de UI). Não adicione dependência nova sem justificar.
4. Os itens marcados **[CONFIRMAR]** têm um padrão definido. Use esse padrão, mas liste o item no plano para eu validar.
5. Toda regra de cálculo fica em uma **função pura** (sem UI). A tela e a impressão usam a mesma função, e ela tem testes unitários (seção 11).
6. Não altere nada fora do escopo descrito.

## 3. Referências visuais
Este documento é **autossuficiente**: não há imagens anexadas.
- O layout da tela está descrito em texto e wireframe (seção 5.2).
- As ilustrações de "como medir" da armação devem ser **desenhadas como SVG dentro do projeto** (seção 5.9).
- Tudo precisa funcionar offline, sem carregar nada da internet.

## 4. Requisitos globais

### RG-01: confirmação obrigatória em TODA exclusão
- Crie um mecanismo único de confirmação: um `useConfirm()` baseado em Promise e um `<ConfirmDialog>`. **Não use `window.confirm`.**
- Variante destrutiva:
  - título "Excluir {entidade}?";
  - mensagem que identifica o item (ex.: "Prescrição de Maria Silva — 12/03/2026");
  - aviso "Esta ação não pode ser desfeita.";
  - botão **Cancelar**, com foco padrão e acionado por Esc;
  - botão **Excluir**, em vermelho.
- Procure no código e aplique em **todos** os pontos de exclusão, os que já existem e os novos. No relatório final, liste os pontos encontrados.

### RG-02: exclusão lógica e integridade
- Use **soft delete** (`deletedAt` e `deletedReason` opcional) e filtre em todas as consultas. É pré-requisito para a futura sincronização propagar exclusões.
- Cadastros usados por registros históricos (laboratório, forma de pagamento, bandeira) **não podem ser excluídos se tiverem vínculos**. Nesse caso, ofereça "Inativar". Um cadastro inativo sai dos selects de novos registros, mas continua aparecendo nos registros antigos.
- **Snapshot financeiro:** taxa, acréscimo e valores calculados no momento da venda ou do lançamento ficam gravados no próprio registro. Alterar um cadastro (taxa de bandeira, valor de recorrência) **nunca** recalcula registros passados.

### RG-03: componente `DioptriaInput` (stepper)
- Layout: botão **▼ antes** da caixa e botão **▲ depois** (ver wireframe 5.2). Valor inicial `0.00`.
- Passo padrão de 0,25. As setas ↑/↓ do teclado também alteram o valor.
- A digitação é livre. Ao sair do campo (blur), arredonde para o múltiplo do passo mais próximo e aplique os limites min/max.
- Exibição sempre com sinal e 2 casas (`+1.25`, `-0.50`, `0.00`), usando o separador decimal que o sistema já adota.
- Props: `min`, `max`, `step`, `readOnly`, `signed`.
- Reutilize em Prescrição (Esf, Cil, Adição) e em Produto (Grau mín/máx).

### RG-04: representação numérica
- Dioptrias e prisma: **inteiros em centésimos** (`-1.25` → `-125`).
- Milímetros: inteiros em décimos (`31.5` → `315`), ou o padrão do projeto.
- Dinheiro: **centavos (inteiro)**.
- Percentuais: pontos-base (`8,99%` → `899`).
- Arredondamento half-up no centavo. Ao dividir em parcelas, a diferença de centavos vai para a **última** parcela.

### RG-05: componente `TelefoneInput`
- Máscara de celular `(85) 9 9999-9999`. Aceite também fixo `(85) 3333-3333`.
- Armazene só os dígitos e valide 10 ou 11 dígitos.
- Reutilize no entregador da OS e no Laboratório.

## 5. Prescrição (antigo módulo "Receita")

### 5.1 Renomeação
- Troque **"Receita" por "Prescrição"** em todo texto visível: menu, títulos, abas, botões, mensagens, confirmações, impressão e PDFs. Exemplos: "Nova prescrição", "Excluir prescrição", "Imprimir prescrição".
- **Não renomeie identificadores internos** (tabelas, entidades, rotas, arquivos). Assim não é preciso uma migração arriscada. Documente no código o mapeamento: `receita` (interno) = "Prescrição" (UI).
- Centralize o rótulo em uma constante ou arquivo de strings, se o projeto ainda não tiver.

### 5.2 Layout
São dois blocos lado a lado, **Direito à esquerda da tela e Esquerdo à direita**, no lugar dos blocos Longe/Perto.
- Cada bloco tem um cabeçalho com um ícone (óculos com uma mão cobrindo o outro olho, marcado OD ou OE) e o nome do olho.
- Dentro do bloco ficam as subseções **Longe** e **Perto**.
- Campos somente leitura aparecem com fundo cinza (estilo desabilitado).

```
┌─ [ícone OD] Direito ─────────────────────────┐  ┌─ [ícone OE] Esquerdo ────────────────────────┐
│ Longe                                         │  │ Longe                                         │
│ Esf.              Cil.              Eixo      │  │ Esf.              Cil.              Eixo      │
│ [▼][  0.00  ][▲]  [▼][  0.00  ][▲]  [      ]  │  │ [▼][  0.00  ][▲]  [▼][  0.00  ][▲]  [      ]  │
│                                               │  │                                               │
│ DNP*      Alt.      Prisma     Bs Prisma      │  │ DNP*      Alt.      Prisma     Bs Prisma      │
│ [     ]   [     ]   [ 0.00 ]   [ Nenhum ▾]    │  │ [     ]   [     ]   [ 0.00 ]   [ Nenhum ▾]    │
│                                               │  │                                               │
│ Perto                                         │  │ Perto                                         │
│ Adição            Esf.   Cil    Eixo   DNP    │  │ Adição            Esf.   Cil    Eixo   DNP    │
│ [▼][  0.00  ][▲]  [░░░]  [░░░]  [░░░]  [   ]  │  │ [▼][  0.00  ][▲]  [░░░]  [░░░]  [░░░]  [   ]  │
└───────────────────────────────────────────────┘  └───────────────────────────────────────────────┘
                       DP Longe: 63,5 mm · DP Perto: 60,5 mm   (só se habilitado — seção 6)
```

### 5.3 Campos de cada olho
- **Longe** (editável):
  - Esf.: `DioptriaInput`, de -30,00 a +30,00
  - Cil.: `DioptriaInput`, de -10,00 a +10,00
  - Eixo: inteiro de 0 a 180°
  - DNP*: em mm, manual, **obrigatório**
  - Alt.: altura de montagem, em mm
  - Prisma: numérico com 2 casas, valor inicial `0.00`, de 0 a 10 Δ
  - Bs Prisma (base do prisma): select com **Nenhum** (padrão), **Nasal**, **Superior**, **Temporal**, **Inferior**
- **Perto**:
  - Adição: `DioptriaInput` de 0,00 a +4,00, só positivo. Um campo por olho, com valores independentes. **Altera apenas o esférico de perto.**
  - Esf. = Esf. longe + Adição do mesmo olho (**somente leitura**)
  - Cil = Cil. longe (somente leitura)
  - Eixo = Eixo longe (somente leitura)
  - DNP: em mm, manual. **É o único campo editável de perto, além da Adição.**

**Validações:**
- Eixo é obrigatório se Cil ≠ 0. Se Cil = 0, o Eixo fica desabilitado e vazio.
- Se Prisma > 0, a Bs Prisma precisa ser diferente de "Nenhum". Se Prisma = 0, a Bs Prisma fica em "Nenhum" e desabilitada.
- DNP de 20 a 45 mm, passo 0,5. Alt. de 10 a 40 mm, passo 0,5.

Os campos de perto derivados **não são persistidos**. Eles vêm de `calcularPerto(longe, adicao)`, usada pela tela e pela impressão.

### 5.4 DP (Distância Pupilar)
- DP Longe = DNP longe OD + DNP longe OE.
- DP Perto = DNP perto OD + DNP perto OE.
- Somente leitura e não persistido. Fica abaixo dos dois blocos.
- Só aparece se a configuração da seção 6 estiver ativa. Se estiver desativada, o DP **some da tela e da impressão**.

### 5.5 Tipo de lente (seleção única)
Visão Simples, Bifocal, Multifocal, Ocupacional.

### 5.6 Índice de refração (seleção única)
1.49, 1.56, 1.59, 1.60, 1.61, 1.67, 1.74. Implemente como lista fixa (enum/seed) fácil de estender.

### 5.7 Tratamentos (checkboxes, múltipla escolha)
Antirrisco, Antirreflexo, Antirreflexo Blue, Fotossensível, Coloração, Coloração Degradê.
- Se Coloração ou Coloração Degradê estiver marcada, mostre a dica "Informe a cor em Observações" e destaque o campo Observações. O aviso não bloqueia o salvamento.
- Persista como lista de códigos do enum (tabela de junção ou array, conforme o projeto).

### 5.8 Armação
- **Tipo:** select com o placeholder "-Selecione uma armação-" e as opções, nesta ordem:
  ACETATO, ACETATO COM NYLON, ESPECIAL SPORT, FIO DE AÇO, FURADA, METAL, METAL COM NYLON, NATAÇÃO, ÓCULOS DE SEGURANÇA, SOLAR ACETATO, SOLAR METAL, SOLAR NYLON.
  Implemente como enum/seed fácil de estender.
- **Modelo, Marca, Cor:** texto livre.

### 5.9 Medidas da armação (opcional, em mm)

**Container**
- Seção recolhível (sanfona) com o título **"Medidas da armação (opcional)"**, **fechada por padrão**.
- **Reutilize o componente ou padrão de seção recolhível que o sistema já usa** para campos não obrigatórios. Só crie um novo se não existir nenhum, e informe no plano qual padrão encontrou.
- Ao abrir uma prescrição que já tem medidas, mostre um resumo no cabeçalho da seção (ex.: "Ponte 18 · H 52 · V 40 · DM 55").

**Campos** (todos opcionais, numéricos, 1 casa decimal, na mesma linha): Ponte, Horizontal, Vertical, Diagonal Maior.

**Painel de orientação** (dentro da sanfona, acima dos campos)
- Sem campo em foco, o painel mostra a ilustração base da armação, sem linhas.
- Ao focar ou clicar em um campo, o painel mostra a orientação daquele campo:
  - à esquerda, a **definição** em negrito e o quadro **"Erros comuns que devem ser evitados"** com 3 itens numerados, cada um terminando em "(imagem N)" em vermelho;
  - à direita, a ilustração **correta** (linha verde);
  - abaixo, as **3 ilustrações erradas** (linha vermelha), lado a lado, na ordem dos itens.

| Campo | Definição (correto) | Erros comuns (imagens 1, 2, 3) |
|---|---|---|
| Ponte | Menor distância entre as lentes, na parte nasal. | 1. Medir pela parte de fora da armação. 2. Medir fora da menor distância entre as lentes. 3. Medir pela parte de fora da armação e fora da menor distância. |
| Horizontal | Distância entre a borda nasal e a temporal da lente, em linha horizontal, sem incluir a armação. | 1. Medir fora da maior distância horizontal. 2. Medir de forma inclinada. 3. Incluir a armação na medida. |
| Vertical | Distância entre a borda superior e a inferior da lente, em linha vertical, sem incluir a armação. | 1. Medir fora da maior distância vertical. 2. Medir de forma inclinada. 3. Incluir a armação na medida. |
| Diagonal Maior | Maior distância entre dois pontos opostos da lente, em linha diagonal, sem incluir a armação. | 1. Incluir as bordas da armação na medida. 2. Incluir uma das bordas na medida. 3. Não medir na maior diagonal. |

**Ilustrações em SVG (criar no projeto)**
- **Componente:** um único `<ArmacaoIlustracao medida="ponte|horizontal|vertical|diagonal" variante="correto|erro1|erro2|erro3" />`. Ele desenha a armação base e sobrepõe a linha da variante. Sem as props, desenha só a base.
- **Armação base:** vista frontal de uma armação retangular de aro grosso, com:
  - cantos arredondados;
  - lentes levemente trapezoidais, mais estreitas embaixo do lado nasal;
  - ponte central e hastes curtas nas laterais;
  - aro cinza-escuro e lentes vazias (fundo branco).
- **Linhas:** verde (`#2E7D32`) para o correto e vermelha (`#C62828`) para o errado, com espessura de ~3 px. As medidas de lente ficam sempre na lente do lado direito da imagem. A Ponte fica no centro.

| Medida | Correto (verde) | Erro 1 (vermelho) | Erro 2 (vermelho) | Erro 3 (vermelho) |
|---|---|---|---|---|
| Ponte | Horizontal, entre as bordas internas dos dois aros (bordas das lentes), onde as lentes estão mais próximas (parte superior da ponte) | Mesma altura, mas entre as bordas externas dos aros (só o vão da ponte, sem a espessura do aro) | Entre as bordas internas, porém mais abaixo, onde a distância é maior | Mais abaixo **e** entre as bordas externas |
| Horizontal | Horizontal, da borda interna nasal à borda interna temporal, na altura de maior largura da lente | Horizontal, porém mais abaixo, onde a lente é mais estreita | Inclinada (sobe do nasal para o temporal) | Na altura certa, mas avançando sobre o aro dos dois lados |
| Vertical | Vertical, da borda interna superior à borda interna inferior, no ponto de maior altura da lente | Vertical, porém perto da borda nasal, onde a lente é mais baixa | Inclinada | Na posição certa, mas avançando sobre o aro em cima e embaixo |
| Diagonal Maior | Do canto superior nasal ao canto inferior temporal, de borda interna a borda interna | Mesma diagonal, mas avançando sobre o aro nas duas pontas | Mesma diagonal, mas avançando sobre o aro em uma das pontas | Diagonal oposta (inferior nasal → superior temporal), mais curta |

**Validação de faixa ("grade")**

| Campo | Faixa permitida (mm) |
|---|---|
| Ponte | 10 a 35 |
| Horizontal | 30 a 80 |
| Vertical | 15 a 65 |
| Diagonal Maior | 30 a 85 |

- Guarde as faixas em constantes. A da Ponte veio do sistema de referência; as outras são sugestões e podem ser ajustadas.
- Valor fora da faixa: borda vermelha no campo e o aviso **"⚠ Valor fora da grade — {Campo}: a grade permitida é de {min} a {max}"**.
- Não é possível salvar enquanto houver valor fora da faixa. Campo vazio é permitido.

### 5.10 Excluir prescrição
- Botão **Excluir prescrição**, com RG-01.
- Se houver OS ou venda vinculada, bloqueie e mostre os vínculos. **[CONFIRMAR]**

### 5.11 Migração das prescrições existentes
- Converta os registros atuais sem perda.
- Calcule Adição = Esf. perto − Esf. longe quando o cilindro e o eixo de perto forem iguais aos de longe.
- Se os valores legados de perto não seguirem essa regra:
  - preserve os originais em campos legados;
  - não recalcule;
  - mostre o aviso "Prescrição registrada no formato anterior".
- Registros com base de prisma vazia passam a ter "Nenhum".

### 5.12 Impressão
- Atualize o template para o agrupamento Direito/Esquerdo.
- Inclua os campos novos que estiverem preenchidos e omita os vazios. As medidas da armação só aparecem se houver alguma preenchida.
- O DP segue a configuração da seção 6.

## 6. Configurações
- Nova opção **"Exibir DP (Distância Pupilar)"**, **desativada por padrão** e persistida na configuração local da instalação.
- Afeta a tela da prescrição, a impressão da prescrição e a impressão da OS.

## 7. Ordem de Serviço

### 7.1 Cadastro de Laboratórios (CRUD novo)
- Campos: Nome*, Razão social, CNPJ (máscara + validação), Telefone, WhatsApp, E-mail, Endereço, Contato responsável, Prazo médio de entrega (dias), Observações, Ativo.
- Listagem com busca. Exclusão segue RG-01 e RG-02.

### 7.2 Na OS
- Select de Laboratório, mostrando só os ativos.
- Se hoje o laboratório da OS for texto livre, a migração cria laboratórios a partir dos valores distintos e faz o vínculo.
- **Entregador (sem cadastro próprio):** Nome (texto) e Contato (`TelefoneInput`). Ficam gravados na própria OS e aparecem na impressão.

## 8. Produto: Lente
- Grau mínimo e Grau máximo com `DioptriaInput` (passo 0,25).
- Validação: mínimo ≤ máximo.
- Vale só para produtos do tipo lente.

## 9. Vendas

### 9.1 Desconto
- Alternância % / R$ ao lado do campo.
- Em %: de 0 a 100. Em R$: no máximo o subtotal.
- Persista o tipo, o valor informado e o desconto em centavos.

### 9.2 Cadastro de Formas de Pagamento
- **Campos:** Nome*, Tipo* (Dinheiro, PIX, Transferência, Cartão de Débito, Cartão de Crédito, Promissória, Boleto, Cheque, Outro), Ativo, Ordem de exibição.
- **Comportamento financeiro** (definido pelo tipo):
  - `IMEDIATO` (Dinheiro, PIX, Transferência): entra como recebido na data da venda.
  - `OPERADORA` (Débito, Crédito): gera **um único** recebível da operadora, pelo valor líquido (9.4). A venda exige a escolha da bandeira.
  - `PARCELADO_CLIENTE` (Promissória; Boleto e Cheque **[CONFIRMAR]**): gera N parcelas do cliente em Contas a Receber.
- **Configuração de `PARCELADO_CLIENTE`:** máximo de parcelas, intervalo entre parcelas (padrão 30 dias), acréscimo (tipo % ou R$, e valor).
- As regras valem **por pagamento**. Se a venda já aceita mais de uma forma de pagamento, cada linha segue a regra da sua forma.

### 9.3 Regra da Promissória
- Valor financiado = total após o desconto (menos a entrada, se o sistema tiver entrada).
- Acréscimo em %: valor financiado × (1 + %). Acréscimo em R$: valor financiado + valor fixo.
- O acréscimo é aplicado **uma vez sobre o total**, não por parcela. **[CONFIRMAR]**
- Parcelas = valor com acréscimo ÷ N, seguindo RG-04.
- O acréscimo aparece de forma explícita no resumo da venda, antes da confirmação.

### 9.4 Regra do Cartão (crédito e débito)
- **Não gera promissórias nem parcelas do cliente em Contas a Receber.** Quem parcela é a operadora.
- Gera **1** recebível:
  - líquido = bruto × (1 − taxa da bandeira para a quantidade de parcelas escolhida);
  - vencimento = data da venda + prazo de recebimento da faixa.
- Snapshot gravado: bandeira, parcelas, taxa aplicada, bruto, líquido e data prevista.

### 9.5 Cadastro de Bandeiras
- **Bandeira:** Nome* (Visa, Mastercard, Elo, Hipercard, Amex…), Adquirente/maquininha (opcional, porque a taxa costuma variar por maquininha), Aceita débito, Aceita crédito, Ativo.
- **Débito:** taxa (%) e prazo de recebimento (dias).
- **Crédito:** tabela de faixas de 1x até Nx. Cada linha tem:
  - taxa da operadora (%);
  - prazo de recebimento (dias);
  - desconto ao cliente (%), padrão 0 e sem efeito quando zerado. **[CONFIRMAR]** se existe desconto comercial por quantidade de parcelas.
- Na venda, o select de parcelas mostra só as faixas cadastradas e exibe a taxa e o líquido estimado.

### 9.6 Exclusão de venda
- Botão Excluir na lista e no detalhe, com RG-01 e um campo opcional "Motivo".
- Tudo em **uma transação**:
  - soft delete da venda;
  - estorno do estoque;
  - remoção dos recebíveis e parcelas **em aberto** vinculados.
- Se houver parcela já paga ou recebível já baixado, bloqueie e liste esses itens. **[CONFIRMAR]**
- Se houver OS vinculada, bloqueie e indique a OS. **[CONFIRMAR]**

### 9.7 Nova venda pela tela de Vendas
- Botão **"Nova venda"** no cabeçalho da tela de Vendas, ao lado da busca.
- O botão abre o **fluxo de venda que já existe**: reutilize, não duplique.
- Ao concluir ou cancelar, volte para a lista com a busca preservada e a lista atualizada.

## 10. Contas a Pagar: redesenho da recorrência

### 10.1 Problema atual
- A recorrência gera débito indefinidamente.
- Não é possível alterar o valor nem encerrar a recorrência.
- Um reajuste precisa valer só daqui para frente.

### 10.2 Modelo: Série × Lançamentos
- `Recorrencia`: descrição, categoria, fornecedor (opcional), frequência (MENSAL por padrão; ANUAL), dia de vencimento, data de início, data de fim (pode ser nula), status (ATIVA | ENCERRADA).
- `RecorrenciaValor`: histórico de vigência (valor, vigenteDesde). Cada ocorrência usa o valor vigente na sua competência.
- `ContaPagar` (lançamento): recorrenciaId (pode ser nulo), competência (AAAA-MM), vencimento, **valor próprio (snapshot)**, status (ABERTA | PAGA).
- **Geração das ocorrências:**
  - lançamentos materializados com horizonte de 12 meses (constante);
  - um job completa o horizonte ao abrir o módulo;
  - o job é idempotente, com chave única (recorrenciaId, competência).
  - A chave **considera também os registros excluídos**, para o job não recriar uma ocorrência removida com "Excluir somente esta".

### 10.3 Ações
- **Reajustar valor** (novo valor + "a partir de"):
  - cria uma nova vigência;
  - atualiza só os lançamentos ABERTOS com competência maior ou igual à data;
  - lançamentos pagos e anteriores ficam intactos.
- **Encerrar recorrência** (data de fim, com RG-01):
  - status muda para ENCERRADA;
  - lançamentos ABERTOS posteriores são removidos com soft delete;
  - nada novo é gerado.
- **Editar um lançamento recorrente:** perguntar "Somente este" ou "Este e os próximos" (este último equivale a um reajuste a partir daquela competência). **Nunca "todos"**: o passado não muda.
- Encerrar e criar uma série nova (mesma categoria, outra descrição) continua sendo possível.

### 10.4 Excluir conta a pagar
- Conta avulsa: RG-01.
- Conta recorrente: opções "Excluir somente esta" ou "Excluir esta e as próximas (encerra a recorrência)".
- Conta PAGA: bloquear e orientar a estornar o pagamento primeiro. **[CONFIRMAR]**

### 10.5 Migração
- Cada série atual vira uma `Recorrencia` com uma vigência inicial no valor atual (a partir da data de início original).
- Os lançamentos já gerados mantêm os valores que têm.
- Os lançamentos pagos não são alterados.

## 11. Testes unitários obrigatórios
- **Esf. perto:**
  - longe -2,00 com add +2,00 → 0,00
  - longe +1,25 com add +1,75 → +3,00
  - longe -0,75 com add 0,00 → -0,75
- **Normalização do stepper:** -1,30 → -1,25; 1,10 → 1,00; 1,20 → 1,25; valor acima do máximo → máximo.
- **DP:** 31,5 + 32,0 = 63,5.
- **Prisma:** Prisma 1,00 com base "Nenhum" → inválido. Prisma 0 → base "Nenhum".
- **Grade da Ponte:** 9 → fora da grade; 18 → ok; vazio → ok.
- **Desconto:** subtotal R$ 500,00 com desconto de R$ 50,00 → R$ 450,00. Desconto de R$ 600,00 → erro. Desconto de 10% sobre R$ 1.000,00 → R$ 900,00.
- **Cartão:** R$ 900,00 no crédito em 6x com taxa de 8,99% → **1** recebível líquido de R$ 819,09 e **0** parcelas do cliente.
- **Promissória:**
  - R$ 900,00 com acréscimo de 5% em 3x → 3 × R$ 315,00
  - R$ 1.000,00 em 3x sem acréscimo → R$ 333,33 + R$ 333,33 + R$ 333,34
- **Recorrência** (aluguel de R$ 1.500,00 desde janeiro):
  - reajuste para R$ 1.650,00 a partir de julho → janeiro a junho continuam R$ 1.500,00; lançamentos abertos de julho em diante passam a R$ 1.650,00;
  - encerramento em setembro → lançamentos abertos de outubro em diante são removidos;
  - "Excluir somente esta" em agosto → o job não recria agosto.
- **Exclusão de venda** com promissória paga → bloqueada.

## 12. Fases
1. **Infra:** ConfirmDialog aplicado em todo o sistema, soft delete, `DioptriaInput`, `TelefoneInput`, utilitários de dinheiro e dioptria, testes.
2. **Prescrição:** renomeação, modelo, migração, tela, medidas da armação (sanfona + painel + SVGs), configuração do DP, impressão.
3. **Laboratórios e OS** (entregador).
4. **Produto lente** (grau mín/máx).
5. **Vendas:** desconto, formas de pagamento, bandeiras, regras, exclusão, nova venda.
6. **Contas a Pagar:** recorrência, migração, exclusão.

## 13. Entrega de cada fase
- Resumo do que mudou.
- Migrations criadas.
- Roteiro de teste manual.
- Pontos **[CONFIRMAR]** assumidos e pendências.
