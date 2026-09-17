# PRD — Sistema de Gestão para Óticas

**Produto:** plataforma desktop white-label de gestão para óticas
**Base:** evolução do sistema MD Óculos (Java Swing + MySQL), reescrito como produto vendável
**Versão do documento:** 1.0
**Data:** 06/09/2026
**Autor:** Rafael Damasceno

---

## 1. Visão do produto

### 1.1 O problema

O MD Óculos resolve bem a operação de **uma** ótica, mas não é um produto: a logo está compilada
dentro do JAR, a senha do banco está escrita no código-fonte, o nome da loja aparece fixo nas telas e
nos relatórios, e não há qualquer controle de quem acessa o quê. Vender esse sistema para uma segunda
ótica exigiria recompilar a aplicação.

### 1.2 O produto

Um sistema desktop para Windows, instalável em qualquer ótica, que na primeira execução pergunta os
dados da loja (nome, CNPJ, logo, cor) e passa a se comportar como o sistema **daquela** ótica.
Funciona sem internet, guarda os dados localmente e é liberado por chave de licença.

### 1.3 Proposta de valor

| Para quem | Valor |
|---|---|
| Dono da ótica | Sabe quanto vendeu, quanto lucrou e o que tem em estoque, sem planilha |
| Vendedor | Registra cliente, receita óptica, OS e venda em uma tela só, rápido |
| Cliente final | Recebe a receita e o protocolo impressos com a marca da ótica |
| Você (fornecedor) | Um binário, N óticas, sem recompilar; licença protege a venda |

### 1.4 Diferenciais frente ao sistema atual

1. **White-label real** — logo, cores e dados da ótica configuráveis pelo próprio usuário
2. **Dois módulos com login** — Administrador e Vendedor, com acessos distintos
3. **Estoque e vendas** — o atual não tem produtos nem controle de saldo
4. **Financeiro que funciona** — lucro/prejuízo hoje está comentado no código e não calcula
5. **Interface moderna** — navegação lateral, tema claro/escuro, em vez do MDI cinza do Swing
6. **Instalação em minutos** — sem instalar MySQL, sem configurar serviço

---

## 2. Avaliação do sistema atual (as-is)

### 2.1 Arquitetura

```
MD_Oculos.main()
   └── TelaPrincipal (JFrame + JDesktopPane)
          ├── TelaCadCliente        (JInternalFrame)
          ├── TelaCadExame          (JInternalFrame)  ← 1.673 linhas
          ├── TelaCadReceitas       (JInternalFrame)
          ├── TelaCadDespesa        (JInternalFrame)
          ├── TelaPesquisa*         (7 telas)
          └── TelaBackup            (JInternalFrame)

dao.ModuloConexao  → única classe de acesso a dados (abre Connection e devolve)
```

**Ponto crítico:** não existe camada de domínio nem DAO por entidade. **O SQL está escrito dentro das
telas**, misturado com código de interface — 30+ queries espalhadas em 13 arquivos. Qualquer mudança
de banco obriga a caçar `String sql = ...` tela por tela.

### 2.2 Stack

| Camada | Tecnologia |
|---|---|
| Linguagem/UI | Java + Swing (NetBeans Form Editor, layout gerado) |
| Build | Ant (`build.xml`, `nbproject/`) |
| Banco | MySQL 8 local, database `mdoculos` |
| Relatórios | JasperReports 5.6 (iReport), `.jrxml` + `.jasper` |
| Tabela↔ResultSet | `rs2xml` (`net.proteanit.sql.DbUtils`) |

### 2.3 Modelo de dados atual

```
clientes (id_cliente PK, nome, data_nasc, cpf, celular, logradouro,
          numero, complemento, bairro, cidade, uf)

exames   (id_exame PK, id_cliente FK,
          -- receita óptica: 16 colunas de grau
          plonge_od_esf, plonge_oe_esf, plonge_od_cil, plonge_oe_cil,
          plonge_od_eixo, plonge_oe_eixo, plonge_od_dnp, plonge_oe_dnp,
          pperto_od_esf, pperto_oe_esf, pperto_od_cil, pperto_oe_cil,
          pperto_od_eixo, pperto_oe_eixo, pperto_od_dnp, pperto_oe_dnp,
          adicao,
          -- produto: texto livre
          lentes, tratamentos, armacao, observacao,
          -- venda
          data_exame, valor_exame, valor_oculos, data_venda, forma_pgto,
          -- ordem de serviço
          laboratorio, med_opto, data_saida, data_chegada, situacao)

receitas_despesas (id PK, descricao, valor, data, tipo)   -- tipo = 'RECEITA' | 'DESPESA'
```

**Observação de modelagem:** a tabela `exames` acumula **quatro** conceitos diferentes — a receita
óptica (dado clínico), o produto vendido (texto livre), a venda (valores e pagamento) e a ordem de
serviço (laboratório e datas). Isso impede vender dois pares para o mesmo exame, parcelar, ou ter
histórico de receitas do cliente ao longo dos anos.

### 2.4 Funcionalidades existentes (o que preservar)

| Menu | Funcionalidade | Preservar? |
|---|---|---|
| Cadastrar | Cliente | Sim → RF-04 |
| Cadastrar | Exame (receita óptica + OS + venda) | Sim, **desmembrado** → RF-05, RF-06, RF-10 |
| Cadastrar | Receita (financeira) | Sim → RF-11 |
| Cadastrar | Despesa | Sim → RF-11 |
| Pesquisar | Cliente | Sim → RF-04 |
| Pesquisar | Exame | Sim → RF-05 |
| Pesquisar | Protocolo de saída | Sim → RF-06 |
| Pesquisar | Aniversariantes | Sim → RF-04 |
| Pesquisar | Receitas / Despesas | Sim → RF-11 |
| Relatórios | Receitas, Despesas, Lucro/Prejuízo | Sim → RF-12 |
| Opções | Backup | Sim, **automatizado** → RF-13 |

### 2.5 Domínios de valor codificados na interface

Estão fixos no código e precisam virar **listas configuráveis por ótica**:

| Domínio | Valores atuais | Origem |
|---|---|---|
| Situação da OS | `EM ABERTO`, `LABORATÓRIO`, `ENTREGUE` | `TelaCadExame.java:1139` |
| Forma de pagamento | `À VISTA`, `PIX`, `CARTÃO`, `PROMISSÓRIA` | `TelaCadExame.java:1132` |
| UF | 27 estados, `CE` como padrão | `TelaCadCliente.java:530` |
| Meses (aniversariantes) | 12 meses em PT-BR | `TelaPesquisaAniversario.java:125` |

### 2.6 Dívidas técnicas identificadas

Cada item abaixo vira requisito explícito no novo produto.

| # | Problema | Impacto | Onde |
|---|---|---|---|
| **D1** | Usuário e senha do MySQL hardcoded no código | Qualquer um com o JAR tem a senha do banco | `dao/ModuloConexao.java:20-23` |
| **D2** | Senha repetida em texto puro na linha de comando do `mysqldump`, com caminho absoluto do executável | Backup quebra se o MySQL estiver em outro caminho; senha visível no gerenciador de processos | `TelaBackup.java:125,133` |
| **D3** | `ArquivoConfiguracao` foi implementado mas **nunca é chamado**; o `configDB.txt` contém lixo (`sdsdfsdf`) | A configuração externa existe no papel, não na prática | `configuracao/ArquivoConfiguracao.java`, `configDB.txt` |
| **D4** | Logo embutida como recurso do JAR (`/imagens/logoMDOculos.png`) | Impossível vender para outra ótica sem recompilar | `TelaPrincipal.java:66`, `TelaBackup.java:70` |
| **D5** | `id_exame` **não é** AUTO_INCREMENT — o nº da OS é digitado à mão | Dois usuários podem digitar o mesmo número; erro só aparece no INSERT | `MDOCULOSDB.sql:90`, `TelaCadExame.java:200` |
| **D6** | Datas usam a sentinela `1111-11-11` e são convertidas por `substring` de posição fixa | `StringIndexOutOfBounds` com entrada parcial; a sentinela vaza para relatórios | `TelaCadExame.java:126-146` e repetido em 6 telas |
| **D7** | `camposObrigatorios()` usa `&&` em vez de `\|\|` | Só bloqueia se **todos** os campos estiverem vazios — salva registro com nome preenchido e celular vazio | `TelaCadCliente.java:36`, `TelaCadExame.java:85` |
| **D8** | Lucro/Prejuízo **não calcula** — o método está inteiramente comentado | O relatório principal de gestão não funciona | `TelaPesquisaLucroPrejuizo.java:136-150` |
| **D9** | A venda não gera lançamento financeiro — o bloco está comentado | Receita precisa ser lançada à mão, duplicando trabalho e gerando divergência | `TelaCadExame.java:211-226` |
| **D10** | Valores decimais e graus gravados via `setString` em colunas `decimal` | Conversão implícita silenciosa; vírgula decimal vira erro | `TelaCadExame.java:169-194` |
| **D11** | `TelaPrincipal.main()` configura o Look-and-Feel Nimbus mas não abre a janela; o `main` real (`MD_Oculos`) abre a janela **sem** configurar o L&F | O sistema roda com a aparência padrão do Java, não a pretendida | `TelaPrincipal.java:331`, `md_oculos/MD_Oculos.java:19` |
| **D12** | Sem login, sem perfis, sem auditoria, sem estoque, sem parcelamento | Qualquer pessoa na loja vê e altera o faturamento | — |
| **D13** | Receita óptica é **dado pessoal sensível de saúde** (LGPD, art. 5º, II) sem controle de acesso, sem criptografia e sem log | Exposição jurídica para você e para a ótica cliente | — |

### 2.7 O que o sistema atual acerta

Vale registrar, porque deve ser preservado:

- **O domínio óptico está correto** — a separação longe/perto × OD/OE × esf/cil/eixo/DNP é a forma
  como o setor realmente trabalha
- **O protocolo de saída** é uma funcionalidade de valor real: acompanha o par no laboratório
- **Aniversariantes** é ferramenta de relacionamento simples e efetiva
- **A impressão da OS via Jasper** entrega um documento profissional ao cliente
- **Atalhos de teclado** em todos os menus (`Alt+C`, `Ctrl+E`, etc.) — operação de balcão é rápida

---

## 3. Objetivos e métricas de sucesso

| Objetivo | Métrica | Meta |
|---|---|---|
| Instalação sem técnico | Tempo do instalador ao primeiro login | < 5 minutos |
| Onboarding | Tempo até emitir a primeira OS numa ótica nova | < 15 minutos |
| Operação de balcão | Tempo para registrar cliente + receita + venda | < 3 minutos |
| Confiabilidade dos dados | Perda de dados por falha/queda de energia | zero |
| Backup | Óticas com backup íntegro dos últimos 7 dias | 100% |
| Desempenho | Abertura de qualquer tela com 20.000 clientes | < 500 ms |
| Suporte | Chamados de instalação por ótica no 1º mês | < 2 |

---

## 4. Personas

### 4.1 Proprietário / Gerente — "Márcia"
Dona de uma ótica com 2 funcionários. Não é técnica. Quer saber, ao final do mês, quanto entrou,
quanto saiu e quanto sobrou — hoje faz isso no caderno. Não quer que os funcionários vejam o custo
dos produtos nem o lucro da loja.
**Usa o módulo Administrador.**

### 4.2 Vendedor / Atendente — "Diego"
Atende no balcão. Precisa achar o cliente rápido, registrar a receita que o optometrista passou,
fechar a venda e imprimir. Não deve conseguir apagar venda nem dar desconto além do permitido.
**Usa o módulo Vendedor.**

### 4.3 Optometrista — "Dr. Paulo"
Atende no consultório da ótica ou é externo. Seu nome vai na receita impressa. Registra o exame; não
mexe em dinheiro.
*Na v1 é um cadastro auxiliar (profissional), não um usuário do sistema. Ver seção 17.*

### 4.4 Técnico de implantação — "você"
Instala, ativa a licença, importa os dados da ótica se ela vinha de outro sistema, treina o cliente.
Precisa que a instalação seja previsível e que o backup seja automático — porque o chamado de
"perdi tudo" chega para você.

---

## 5. Escopo

### 5.1 Dentro do MVP

- Configuração e white-label (logo, dados da ótica, cores, listas)
- Autenticação com módulos Administrador e Vendedor
- Clientes, receita óptica, ordem de serviço, protocolo de saída, aniversariantes
- Produtos, estoque, fornecedores e compras
- Vendas com itens, desconto, comissão e parcelamento
- Financeiro: contas a receber/pagar, fluxo de caixa, lucro/prejuízo
- Relatórios e impressão em PDF
- Backup automático e restauração
- Licenciamento offline
- Dashboard e auditoria
- Migração dos dados do MD Óculos

### 5.2 Fora da v1

| Item | Por quê |
|---|---|
| NF-e / NFC-e / SAT | Exige certificado digital, homologação por estado e manutenção contínua de layout fiscal — é um produto à parte |
| Sincronização em nuvem | Aumenta muito o escopo e cria responsabilidade de uptime |
| Aplicativo móvel | Sem demanda comprovada no balcão |
| Integração automática com laboratórios | Cada laboratório tem seu próprio protocolo; sem padrão de mercado |
| Envio de WhatsApp automatizado | API oficial tem custo por mensagem e aprovação de template |
| Convênios e faturamento de plano de saúde | Regras variam por operadora |
| Multi-loja / filiais | Depende do multi-terminal, previsto para a v2 |

---

## 6. Requisitos funcionais

Notação: **RF-xx** requisito · **CA** critério de aceite · **[D#]** dívida do sistema atual que resolve.

---

### RF-01 — Configuração e white-label  `[D3, D4]`

Toda a identidade da ótica é dado, não código.

**Configurável:**
- Identidade: nome fantasia, razão social, CNPJ, inscrição estadual
- Contato: endereço completo, telefone, celular/WhatsApp, e-mail, site
- Visual: **logo** (PNG/JPG/SVG, upload pelo usuário), cor de destaque, tema claro/escuro/automático
- Documentos: cabeçalho e rodapé dos impressos, texto de garantia, política de troca
- Operação: limite de desconto do vendedor, percentual padrão de comissão, dias de garantia
- Listas editáveis: situações da OS, formas de pagamento, tratamentos de lente, tipos de lente,
  laboratórios, profissionais (optometristas), categorias de despesa

**CA:**
1. Trocar a logo reflete em até 2 s na barra lateral, na tela de login e nos impressos, sem reiniciar
2. A cor de destaque é aplicada à interface e ao cabeçalho dos PDFs
3. Nenhuma string com o nome de uma ótica específica existe no código-fonte
4. As listas iniciam com os valores do sistema atual (seção 2.5) e podem ser editadas
5. Excluir um item de lista em uso é bloqueado; o item pode ser **inativado**

---

### RF-02 — Primeira execução e ativação de licença  `[D2]`

**Wizard de setup**, em passos:
1. Idioma e boas-vindas
2. Dados da ótica (RF-01) — nome e CNPJ obrigatórios
3. Upload da logo e escolha da cor
4. Criação do **usuário Administrador inicial** (senha forte obrigatória)
5. Local do banco de dados e da pasta de backup
6. Ativação da licença (RF-13.4)
7. Importação opcional de dados do sistema anterior (seção 10)

**CA:**
1. Concluído o wizard, o sistema abre operacional, sem edição manual de arquivo
2. Interromper o wizard no meio reinicia do começo, sem estado corrompido
3. Nenhuma senha é gravada em texto puro em arquivo, log ou linha de comando

---

### RF-03 — Autenticação e módulos de acesso  `[D12, D13]`

> Requisito de maior peso de segurança do produto. Detalhamento completo na **seção 7**.

**RF-03.1 Login**
- Usuário e senha; o módulo é escolhido pelo perfil da conta
- Senha com hash **Argon2id**; nunca texto puro, nunca MD5/SHA-1
- Bloqueio temporário progressivo após 5 tentativas erradas
- Troca de senha obrigatória no primeiro acesso e em senha resetada pelo Admin
- Expiração de sessão por inatividade (padrão 30 min, configurável)
- Bloqueio de tela sem perder o trabalho em aberto

**RF-03.2 Gestão de usuários** (só Administrador)
- Criar, editar, inativar, resetar senha
- Vincular usuário a um perfil (Administrador ou Vendedor)
- Usuário **nunca é excluído**, apenas inativado — senão a auditoria e as vendas perdem o autor

**RF-03.3 Autorização**
- Verificada **no processo principal do Electron**, não no renderer
- Permissões gravadas por recurso/ação
- O Vendedor não vê no menu o que não pode acessar

**RF-03.4 Autorização pontual do Administrador**
Ação sensível iniciada pelo Vendedor (cancelar venda, desconto acima do limite, ajuste de estoque)
abre diálogo pedindo credencial de Administrador, autoriza **apenas aquela ação** e registra ambos os
usuários na auditoria — sem trocar a sessão.

**CA:**
1. Nenhuma tela é acessível sem sessão válida
2. Chamada IPC direta a um recurso proibido é recusada mesmo com o renderer adulterado
3. Vendedor não consegue, por nenhum caminho, ver custo, margem, despesa ou lucro
4. Toda ação autorizada por Admin registra quem executou e quem autorizou

---

### RF-04 — Clientes

- CRUD completo com busca incremental por nome, CPF, celular ou código
- Campos: nome, data de nascimento, CPF, RG, celular, telefone, e-mail, endereço completo,
  profissão, indicado por, observações
- **Validação real de CPF** (dígito verificador), máscara de celular e CEP
- Preenchimento de endereço por CEP (offline: tabela local opcional; sem internet, entrada manual)
- **Ficha do cliente**: histórico de receitas ópticas, OSs, compras e parcelas em aberto
- **Aniversariantes** por mês, com telefone para contato e exportação da lista
- Impedir CPF duplicado; alertar em nome duplicado (não bloquear — homônimos existem)

**CA:**
1. Buscar entre 20.000 clientes retorna em < 300 ms
2. CPF inválido é rejeitado com mensagem clara
3. Cliente com venda vinculada não pode ser excluído, apenas inativado
4. A ficha mostra a evolução do grau ao longo do tempo

---

### RF-05 — Receita óptica (exame)  `[D6, D7, D10]`

Preserva integralmente o modelo do sistema atual, corrigindo os defeitos.

**Estrutura da receita:**

| | OD (olho direito) | OE (olho esquerdo) |
|---|---|---|
| **Longe** | Esférico, Cilíndrico, Eixo, DNP | Esférico, Cilíndrico, Eixo, DNP |
| **Perto** | Esférico, Cilíndrico, Eixo, DNP | Esférico, Cilíndrico, Eixo, DNP |
| **Adição** | valor único | |

Complementos: altura, tipo de lente, tratamentos (múltipla escolha), armação, profissional
responsável, data do exame, observações.

**Regras:**
- **Cálculo automático**: `esférico perto = esférico longe + adição` (preservado de
  `TelaCadExame.adicao()`), com opção de sobrescrever manualmente
- Aceita vírgula ou ponto como separador decimal; grava sempre como número `[D10]`
- Sinal negativo automático para miopia, conforme o comportamento atual
- Eixo aceita apenas 0–180 graus
- Esférico e cilíndrico em passos de 0,25
- **Campos obrigatórios validados individualmente** `[D7]` — cliente e data do exame
- Datas em campo de calendário; **campo vazio é nulo**, não `1111-11-11` `[D6]`
- Receita **versionada**: o cliente acumula histórico, e a receita antiga nunca é sobrescrita
- Impressão da receita com a marca da ótica (RF-12)

**CA:**
1. Salvar sem cliente ou sem data é bloqueado com mensagem apontando o campo
2. Digitar `-1,25` grava `-1.25`
3. Data em branco fica em branco no relatório — nunca `11/11/1111`
4. Alterar o grau de um cliente cria nova versão e mantém a anterior consultável

---

### RF-06 — Ordem de Serviço e laboratório  `[D5]`

- **Numeração automática e sequencial** da OS, com prefixo configurável (ex.: `2026-00042`) `[D5]`
- Vincula: cliente, receita óptica, itens vendidos, vendedor e laboratório
- **Ciclo de vida** (situações configuráveis; padrão preservado do atual):
  `EM ABERTO → LABORATÓRIO → CHEGOU → ENTREGUE`, mais `CANCELADA`
- Datas rastreadas: abertura, envio ao laboratório, chegada, entrega, previsão
- Alerta de OS atrasada (passou da previsão sem chegar)
- **Protocolo de saída**: lista filtrada por período, situação e cliente, com impressão — preserva
  a funcionalidade de `TelaPesquisaProtocoloSaida`
- Assinatura do cliente na entrega (campo no impresso)

**CA:**
1. Dois usuários abrindo OS ao mesmo tempo recebem números diferentes
2. A situação só avança pelas transições válidas
3. O protocolo imprime exatamente as colunas atuais: cliente, data da compra, nº da OS,
   laboratório, lentes, data de saída, data de chegada, situação, celular
4. Entregar a OS exige que ela esteja quitada ou que o Admin autorize

---

### RF-07 — Produtos

- Categorias: **armação**, **lente**, **acessório**, **serviço**
- Campos: código interno, código de barras, descrição, marca, modelo, cor, tamanho, referência do
  fornecedor, unidade
- Preço de custo, margem, preço de venda, preço promocional com validade
- Foto do produto (opcional)
- Atributos específicos de **lente**: material, índice de refração, tipo (visão simples, bifocal,
  multifocal), tratamentos disponíveis, faixa de grau atendida
- Produto pode ser inativado, nunca excluído se tiver movimentação
- **Custo e margem visíveis somente ao Administrador** (RF-03)

**CA:**
1. Alterar o custo recalcula a sugestão de preço pela margem configurada
2. Código de barras é único; leitura por leitor de código de barras funciona no campo de busca
3. Vendedor abre o cadastro e vê descrição, preço de venda e saldo — não vê custo nem margem

---

### RF-08 — Estoque

- Saldo por produto, atualizado por **movimentações** (nunca editado direto)
- Tipos de movimentação: entrada por compra, saída por venda, devolução, perda/quebra,
  ajuste de inventário, transferência
- Toda movimentação registra data, usuário, documento de origem e motivo
- Estoque mínimo por produto, com alerta no dashboard
- **Inventário**: contagem, comparação com o saldo do sistema e geração do ajuste
- Consulta de saldo com filtro por categoria, marca e situação (abaixo do mínimo, zerado, parado)
- **A venda baixa o estoque automaticamente**; o cancelamento estorna

**CA:**
1. O saldo é sempre a soma das movimentações — nunca um campo editável
2. Venda de produto sem saldo é bloqueada ou exige autorização do Admin, conforme configuração
3. Cancelar uma venda devolve exatamente as quantidades ao estoque
4. O ajuste de inventário gera movimentação rastreável, com o usuário responsável

---

### RF-09 — Fornecedores e compras

- Cadastro de fornecedores: razão social, CNPJ, contato, prazo médio de entrega, observações
- Ordem de compra com itens, quantidade e custo previsto
- **Entrada de mercadoria**: confere a ordem, lança a movimentação de estoque e gera a conta a pagar
- Recálculo do **custo médio** na entrada
- Histórico de compras por fornecedor e por produto
- Módulo inteiro **exclusivo do Administrador**

**CA:**
1. A entrada de mercadoria gera, na mesma transação, a movimentação de estoque e a conta a pagar
2. Falha em qualquer etapa desfaz tudo (transação atômica)
3. O custo médio é recalculado e fica registrado no histórico do produto

---

### RF-10 — Vendas  `[D9]`

- Venda com **múltiplos itens** (armação + lentes + acessórios), cada um com quantidade e desconto
- Vínculo opcional com a receita óptica e com a OS
- Desconto por item e no total, **limitado ao teto do vendedor** (RF-01); acima disso exige
  autorização de Admin (RF-03.4)
- **Vendedor responsável** registrado, com comissão calculada pelo percentual configurado
- Formas de pagamento (lista configurável, iniciando com as atuais: à vista, PIX, cartão,
  promissória), aceitando **pagamento misto** (ex.: R$ 200 no PIX + 3× no cartão)
- **Parcelamento**: nº de parcelas, entrada, vencimentos — gera as contas a receber
- **A venda lança automaticamente o financeiro** `[D9]` — à vista entra no caixa; parcelada gera
  as parcelas a receber
- Cancelamento estorna estoque e financeiro; exige autorização de Admin
- Impressão do comprovante e da OS

**CA:**
1. Concluir a venda grava, na mesma transação: venda, itens, movimentação de estoque, parcelas e
   lançamento financeiro — nunca parcialmente
2. A soma das parcelas é exatamente igual ao total da venda (sem centavo perdido no arredondamento)
3. Desconto acima do teto exige credencial de Admin e registra ambos os usuários
4. O vendedor vê apenas as próprias vendas e a própria comissão

---

### RF-11 — Financeiro  `[D8, D9]`

**RF-11.1 Contas a receber**
- Geradas pela venda parcelada ou lançadas manualmente
- Baixa total ou parcial, com data e forma de recebimento
- **A baixa gera o lançamento de receita automaticamente** `[D9]`
- Parcelas vencidas destacadas; relatório de inadimplência
- O vendedor pode dar baixa **apenas nas parcelas das próprias vendas**

**RF-11.2 Contas a pagar** (só Administrador)
- Geradas pela entrada de mercadoria ou lançadas manualmente
- Despesas recorrentes (aluguel, energia, salários) com repetição automática
- Categorias de despesa configuráveis

**RF-11.3 Movimento de caixa** (só Administrador)
- Abertura e fechamento de caixa por dia/turno, com conferência
- Sangria e suprimento
- Preserva o lançamento manual de receita e despesa avulsa do sistema atual

**RF-11.4 Lucro / Prejuízo** `[D8]`
- **Funciona de verdade** — o cálculo hoje está comentado e não executa
- Por período: total de receitas − total de despesas
- Duas visões: **regime de caixa** (o que entrou e saiu) e **regime de competência** (o que foi
  vendido e comprado)
- Detalhamento por categoria e por forma de pagamento
- Margem bruta por produto e por categoria

**CA:**
1. O lucro/prejuízo do período confere com a soma dos lançamentos exibidos, ao centavo
2. Baixar uma parcela reflete imediatamente no caixa e no resultado
3. Estornar uma baixa desfaz o lançamento de receita correspondente
4. Nenhuma tela financeira da empresa é alcançável pelo módulo Vendedor

---

### RF-12 — Relatórios e impressão

Todos em PDF, com a logo e os dados da ótica (RF-01), visualização antes de imprimir, e exportação
para PDF, Excel/CSV.

| Relatório | Origem | Acesso |
|---|---|---|
| **Receita óptica / OS** | preserva `OS.jasper` | Admin, Vendedor |
| **Protocolo de saída** | preserva `Protocolo.jasper` | Admin, Vendedor |
| Comprovante de venda | novo | Admin, Vendedor |
| Carnê de parcelas | novo | Admin, Vendedor |
| Aniversariantes do mês | preserva tela atual | Admin, Vendedor |
| **Receitas e despesas** | preserva `Receitas_Despesas.jasper` | Admin |
| **Lucro / Prejuízo** | preserva `Lucro_Prejuizo.jasper`, agora calculando | Admin |
| Fluxo de caixa | novo | Admin |
| Inadimplência | novo | Admin |
| Posição de estoque | novo | Admin |
| Produtos abaixo do mínimo | novo | Admin |
| Curva ABC de produtos | novo | Admin |
| Vendas por período / vendedor | novo | Admin |
| Comissões a pagar | novo | Admin (Vendedor vê a própria) |
| Ranking de vendedores | novo | Admin |

**CA:**
1. Todo relatório aceita filtro por período, com padrão no mês corrente
2. O cabeçalho traz a logo e os dados configurados, nunca uma marca fixa
3. Relatório com 5.000 linhas é gerado em < 5 s
4. A impressão da OS reproduz o layout atual, campo a campo

---

### RF-13 — Backup, restauração e licença  `[D2]`

**RF-13.1 Backup automático**
- Agendado (padrão: diário no fechamento + a cada 4 h)
- Destino configurável: pasta local, pendrive, unidade de rede, pasta sincronizada em nuvem
- Retenção configurável (padrão: 30 diários, 12 mensais)
- Backup **verificado** — o arquivo é aberto e validado após a geração
- Alerta visível se o último backup falhou ou tem mais de 48 h

**RF-13.2 Backup manual** — um botão, com escolha do destino

**RF-13.3 Restauração**
- Lista os backups com data, tamanho e status de integridade
- Exige confirmação dupla e credencial de Administrador
- Faz backup de segurança do estado atual antes de restaurar

**RF-13.4 Licença**
- Ativação por chave, vinculada ao **fingerprint da máquina** (CPU + placa-mãe + disco)
- Validação **100% offline** — chave assinada criptograficamente
- Suporta licença perpétua e anual; carência configurável antes do bloqueio
- Tela "Sobre / Licença": ótica licenciada, validade, fingerprint, versão
- Ferramenta separada, para seu uso, que gera as chaves

**CA:**
1. O backup roda sem intervenção e **sem expor senha em linha de comando** `[D2]`
2. Restaurar um backup de 30 dias devolve o sistema ao estado exato daquele momento
3. Sem internet, a validação da licença funciona normalmente
4. Copiar a instalação para outra máquina exige nova ativação
5. Licença vencida entra em modo somente-leitura — **nunca apaga dados do cliente**

---

### RF-14 — Dashboard

Tela inicial, com conteúdo por módulo.

**Administrador:** vendas do dia/mês, comparativo com o mês anterior, contas a receber vencendo,
contas a pagar do dia, saldo de caixa, produtos abaixo do mínimo, OSs atrasadas, aniversariantes da
semana, ranking de vendedores, status do último backup.

**Vendedor:** próprias vendas do dia/mês, própria comissão acumulada, OSs sob sua responsabilidade,
OSs que chegaram e aguardam retirada, aniversariantes da semana.

**CA:**
1. Carrega em < 1 s com 3 anos de histórico
2. Cada indicador é clicável e leva à tela detalhada correspondente
3. O dashboard do Vendedor não exibe faturamento total nem qualquer valor da empresa

---

### RF-15 — Auditoria

- Registra: quem, o quê, quando, valor anterior, valor novo
- Cobre no mínimo: login e logout, criação/alteração/exclusão de cadastros, venda e cancelamento,
  desconto acima do teto, ajuste de estoque, baixa e estorno financeiro, alteração de preço,
  gestão de usuários, alteração de configuração, restauração de backup
- Registra também **quem autorizou** nas ações de RF-03.4
- Consulta com filtro por usuário, período, tipo de ação e registro afetado
- O log é **somente leitura**, inclusive para o Administrador
- Retenção configurável (padrão 24 meses)

**CA:**
1. Toda ação sensível gera um registro
2. Nenhuma interface permite editar ou apagar registro de auditoria
3. É possível reconstruir o histórico completo de uma venda a partir do log

---

### RF-16 — Atualização do aplicativo

- Verificação de nova versão (online quando disponível; instalação manual como alternativa)
- Download e instalação com confirmação do usuário
- **Migração automática do banco** na primeira execução da nova versão
- **Backup automático obrigatório antes de migrar**
- Notas da versão exibidas ao usuário
- Rollback documentado se a migração falhar

**CA:**
1. Atualizar preserva todos os dados e configurações
2. Falha na migração restaura o backup automático e informa o usuário
3. O sistema nunca atualiza sozinho durante o expediente sem consentimento

---

## 7. Módulos de acesso — detalhamento

> Este é o requisito RF-03 aberto. Vale a ênfase: hoje o sistema **não tem login algum** — qualquer
> pessoa que abra o programa vê o faturamento da loja.

### 7.1 Princípio

O Vendedor **não vê** o que não pode acessar — não é botão desabilitado, é menu ausente. E a
autorização é verificada **no processo principal do Electron**, não no renderer: checagem só na
interface é conveniência, não segurança, porque o DevTools contorna qualquer bloqueio de tela.

### 7.2 Módulo Administrador

Acesso total. Além de tudo que o Vendedor faz:

- **Usuários** — criar, editar, resetar senha, ativar/inativar
- **Configurações e white-label** (RF-01)
- **Financeiro completo** — contas a pagar, despesas, caixa, fluxo, lucro/prejuízo
- **Preço e custo** — custo de compra, margem, alteração de preço de venda
- **Estoque** — inventário, ajuste de saldo, entrada de mercadoria
- **Fornecedores e compras**
- **Comissões** — configuração do percentual e fechamento por vendedor
- **Relatórios gerenciais** — curva ABC, lucratividade, ranking
- **Backup, restauração e licença**
- **Auditoria**

### 7.3 Módulo Vendedor

Operação de balcão, sem exposição financeira da empresa:

- Clientes — cadastrar, editar, consultar, aniversariantes
- Receita óptica — registrar e imprimir
- Ordem de Serviço — abrir, acompanhar, protocolo de saída
- Venda — registrar, com desconto até o teto configurado
- Recebimento — baixa de parcela das próprias vendas
- Produtos — consulta de preço de venda e saldo
- Próprias vendas e própria comissão

### 7.4 Matriz de permissões

| Recurso | Administrador | Vendedor |
|---|---|---|
| Clientes | total | criar, editar, consultar (sem excluir) |
| Receita óptica | total | criar, editar, consultar |
| Ordem de Serviço | total | criar, editar, consultar |
| Protocolo de saída | total | consultar e imprimir |
| Aniversariantes | total | consultar |
| Venda | total, inclusive cancelar | criar; cancelar exige Admin |
| Desconto | sem limite | até o teto configurado |
| Produtos — descrição e preço de venda | editar | somente consultar |
| Produtos — custo e margem | ver e editar | **sem acesso** |
| Estoque — saldo | total | somente consultar |
| Estoque — ajuste e inventário | total | **sem acesso** |
| Fornecedores e compras | total | **sem acesso** |
| Contas a receber | total | baixa das próprias vendas |
| Contas a pagar e despesas | total | **sem acesso** |
| Caixa, fluxo, lucro/prejuízo | total | **sem acesso** |
| Comissões | de todos | apenas a própria |
| Relatórios gerenciais | total | **sem acesso** |
| Usuários | total | **sem acesso** |
| Configurações e white-label | total | **sem acesso** |
| Backup e licença | total | **sem acesso** |
| Auditoria | consultar | **sem acesso** |

### 7.5 Decisões de arquitetura decorrentes

- Toda operação grava o **usuário autor** — base da auditoria (RF-15) e da comissão (RF-10)
- Permissões por **recurso/ação**, não por enum rígido: acrescentar Gerente, Caixa ou Optometrista
  depois é cadastro, não refatoração
- Usuário é **inativado**, nunca excluído — senão registros históricos perdem o autor
- LGPD `[D13]`: a receita óptica passa a ter acesso controlado e rastreável

---

## 8. Requisitos não funcionais

### 8.1 Desempenho

| Operação | Meta |
|---|---|
| Abertura do sistema até o login | < 3 s |
| Login até o dashboard | < 2 s |
| Busca de cliente (20.000 registros) | < 300 ms |
| Abertura de qualquer tela de cadastro | < 500 ms |
| Conclusão de venda com 5 itens | < 1 s |
| Geração de PDF com 5.000 linhas | < 5 s |
| Backup de banco com 100.000 registros | < 30 s |
| Memória em uso normal | < 500 MB |

### 8.2 Usabilidade

- Interface em **português do Brasil**, com a terminologia do setor óptico
- **Atalhos de teclado preservados** do sistema atual (`Alt+C` cliente, `Ctrl+E` exame etc.) — o
  balcão trabalha por teclado
- Navegação completa por `Tab` nos formulários, na ordem lógica de preenchimento
- Mensagens de erro que dizem **o que fazer**, não o código da exceção — hoje o sistema mostra o
  objeto `Exception` cru ao usuário em 30+ pontos
- Confirmação antes de qualquer exclusão
- Auto-save de rascunho em formulários longos (receita óptica)
- Tema claro e escuro; fonte ajustável (o público de ótica costuma ter mais de 40 anos)

### 8.3 Segurança

- Senhas com **Argon2id** `[D1]`
- Banco de dados com opção de **criptografia em repouso** (SQLCipher) — recomendada por conter dado
  de saúde
- Backups criptografados quando o destino é nuvem ou unidade removível
- Nenhum segredo em código-fonte, arquivo de configuração em texto puro ou linha de comando `[D1, D2]`
- Electron endurecido: `contextIsolation` ligado, `nodeIntegration` desligado, `preload` com API
  mínima e tipada, CSP restritiva, DevTools desabilitado em produção
- Todo SQL por *prepared statement*
- Log de auditoria imutável (RF-15)

### 8.4 LGPD e dado de saúde  `[D13]`

A receita óptica é **dado pessoal sensível** (Lei 13.709/2018, art. 5º, II — "dado referente à
saúde"). Consequências obrigatórias no produto:

1. **Acesso controlado e rastreável** — quem consultou a receita de quem (RF-03, RF-15)
2. **Exportação dos dados do titular** em formato legível, sob solicitação
3. **Anonimização/exclusão** a pedido do titular, preservando o que a lei fiscal obriga a manter
4. **Termo de consentimento** configurável, impresso na ficha do cliente
5. **Criptografia em repouso** recomendada por padrão
6. **Documento de orientação** entregue à ótica sobre suas obrigações como controladora

> Sem isso, tanto a ótica quanto você ficam expostos. Vale destacar isso na venda: é um diferencial
> real frente a concorrentes que ignoram o tema.

### 8.5 Confiabilidade

- Toda operação composta em **transação atômica** (venda, entrada de mercadoria, baixa)
- Queda de energia não corrompe o banco (WAL habilitado)
- Verificação de integridade na abertura, com reparo automático quando possível
- Log técnico rotativo para diagnóstico de suporte

### 8.6 Instalação e distribuição

- Instalador Windows único (`.exe`), com opção silenciosa para instalação em lote
- **Sem pré-requisito externo** — nada de instalar MySQL, Java ou runtime separado
- Windows 10 e 11, 64 bits
- Desinstalação preserva os dados, avisando onde ficaram
- Modo portátil (execução de pendrive) como opção

### 8.7 Manutenibilidade

- TypeScript em modo estrito, sem `any` implícito
- **Nenhum SQL na camada de interface** — corrige o problema estrutural do sistema atual
- Migrations versionadas e idempotentes
- Testes automatizados nas regras de negócio: cálculo de grau, parcelamento, saldo de estoque,
  lucro/prejuízo, permissões

---

## 9. Arquitetura técnica

### 9.1 Stack

| Camada | Tecnologia | Por quê |
|---|---|---|
| Shell | Electron | Desktop com liberdade total de layout |
| UI | React + TypeScript | Ecossistema maduro |
| Estilo | Tailwind CSS + shadcn/ui | Interface moderna sem construir do zero |
| Estado | TanStack Query + Zustand | Cache de dados e estado local |
| Formulários | React Hook Form + Zod | Validação com tipo compartilhado entre UI e backend |
| Banco | SQLite via `better-sqlite3` | Local, síncrono, rápido, arquivo único |
| Migrations | `drizzle-kit` ou `umzug` | Evolução versionada do schema |
| PDF | React → HTML → PDF (Puppeteer do próprio Electron) | Reaproveita o CSS da aplicação |
| Gráficos | Recharts | Dashboard |
| Empacotamento | `electron-builder` | Instalador Windows e auto-update |
| Testes | Vitest + Playwright | Unidade e ponta a ponta |

### 9.2 Processos

```
┌─────────────────────────────────────────────────────────┐
│ MAIN  (Node.js) — confiança total                       │
│  · Autenticação e AUTORIZAÇÃO  ← ponto de segurança     │
│  · Serviços de domínio (regras de negócio)              │
│  · Repositórios → SQLite                                │
│  · Licença, backup, agendador, geração de PDF           │
└────────────────────────┬────────────────────────────────┘
                         │ IPC tipado (contrato Zod)
┌────────────────────────┴────────────────────────────────┐
│ PRELOAD — contextIsolation, API mínima e explícita      │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────┐
│ RENDERER (React) — SEM acesso a Node, SEM SQL           │
│  · Telas, componentes, navegação                        │
│  · Cache de dados                                       │
└─────────────────────────────────────────────────────────┘
```

**Regra inegociável:** o renderer nunca vê SQL nem credencial. Toda permissão é decidida no main.

### 9.3 Camadas no processo main

```
IPC handler  →  Serviço de aplicação  →  Repositório  →  SQLite
                       ↑
              Regras de negócio + verificação de permissão
```

**A camada de repositório é o que viabiliza o multi-terminal futuro.** Como nenhuma query vive fora
dela, migrar para PostgreSQL na v2 significa trocar a implementação dos repositórios — a interface,
os serviços e toda a UI permanecem intactos. É exatamente o oposto do sistema atual, onde 30+
queries estão espalhadas dentro das telas.

### 9.4 Estrutura de pastas

```
src/
├── main/
│   ├── index.ts
│   ├── ipc/                 handlers por domínio
│   ├── services/            regras de negócio
│   ├── repositories/        ÚNICO lugar com SQL
│   ├── db/
│   │   ├── schema.ts
│   │   ├── migrations/
│   │   └── connection.ts
│   ├── auth/                sessão, hash, permissões
│   ├── license/
│   ├── backup/
│   ├── reports/
│   └── audit/
├── preload/
│   └── index.ts             API exposta ao renderer
├── renderer/
│   ├── modules/
│   │   ├── admin/
│   │   └── vendedor/
│   ├── shared/              componentes, hooks, tema
│   └── App.tsx
└── shared/
    ├── types/               tipos compartilhados
    ├── schemas/             validação Zod (UI + main)
    └── permissions.ts       matriz de permissões
```

### 9.5 Localização dos dados

```
%PROGRAMDATA%\<NomeOtica>\
├── dados.db              banco principal
├── config.json           configurações (sem segredo)
├── license.dat           licença assinada
├── logo.png              logo da ótica
├── backups\
└── logs\
```

---

## 10. Modelo de dados proposto

### 10.1 Princípio

Desmembrar a tabela `exames` — que hoje acumula receita óptica, produto, venda e ordem de serviço —
em entidades separadas. É o que destrava parcelamento, múltiplos itens, histórico de grau e estoque.

### 10.2 Entidades

**Configuração e acesso**
```
empresa            (id, nome_fantasia, razao_social, cnpj, ie, endereço…, logo_path, cor_destaque)
configuracao       (chave, valor, tipo)
usuario            (id, nome, login, senha_hash, perfil, ativo, ultimo_acesso, deve_trocar_senha)
permissao          (perfil, recurso, acao)
auditoria          (id, usuario_id, autorizado_por_id, acao, entidade, entidade_id,
                    valor_anterior, valor_novo, data_hora)
lista_valor        (id, tipo, valor, ordem, ativo)   -- situações, formas pgto, tratamentos…
```

**Clientes e clínico**
```
cliente            (id, nome, data_nasc, cpf, rg, celular, telefone, email,
                    endereço…, profissao, indicado_por, obs, ativo, criado_em, criado_por)

profissional       (id, nome, registro, tipo, ativo)   -- optometrista / médico

receita_optica     (id, cliente_id, profissional_id, data_exame,
                    -- longe
                    longe_od_esf, longe_od_cil, longe_od_eixo, longe_od_dnp,
                    longe_oe_esf, longe_oe_cil, longe_oe_eixo, longe_oe_dnp,
                    -- perto
                    perto_od_esf, perto_od_cil, perto_od_eixo, perto_od_dnp,
                    perto_oe_esf, perto_oe_cil, perto_oe_eixo, perto_oe_dnp,
                    adicao, altura, observacao, criado_em, criado_por)
```

**Produtos e estoque**
```
produto            (id, codigo, codigo_barras, descricao, categoria, marca, modelo,
                    cor, tamanho, unidade, custo, margem, preco_venda,
                    estoque_minimo, foto_path, ativo)
produto_lente      (produto_id, material, indice, tipo, grau_min, grau_max)
fornecedor         (id, razao_social, cnpj, contato, telefone, email, prazo_entrega, ativo)
compra             (id, fornecedor_id, data, numero_nf, valor_total, situacao, usuario_id)
compra_item        (id, compra_id, produto_id, quantidade, custo_unitario)
estoque_movimento  (id, produto_id, tipo, quantidade, saldo_apos, documento_tipo,
                    documento_id, motivo, data_hora, usuario_id)
```

**Vendas e OS**
```
venda              (id, numero, cliente_id, vendedor_id, receita_optica_id,
                    data, subtotal, desconto, total, situacao,
                    autorizado_por_id, criado_em)
venda_item         (id, venda_id, produto_id, descricao, quantidade,
                    preco_unitario, desconto, total)
venda_pagamento    (id, venda_id, forma_pagamento, valor, parcelas)

ordem_servico      (id, numero, venda_id, cliente_id, receita_optica_id,
                    laboratorio_id, situacao, data_abertura, data_envio,
                    data_previsao, data_chegada, data_entrega, observacao)
```

**Financeiro**
```
conta_receber      (id, venda_id, cliente_id, parcela, total_parcelas,
                    valor, vencimento, situacao)
recebimento        (id, conta_receber_id, valor, data, forma_pagamento, usuario_id)
conta_pagar        (id, compra_id, fornecedor_id, descricao, categoria,
                    valor, vencimento, situacao, recorrente)
pagamento          (id, conta_pagar_id, valor, data, forma_pagamento, usuario_id)
lancamento         (id, tipo, categoria, descricao, valor, data,
                    origem_tipo, origem_id, usuario_id)   -- sucessor de receitas_despesas
caixa              (id, data_abertura, data_fechamento, saldo_inicial,
                    saldo_final, usuario_abertura_id, usuario_fechamento_id)
comissao           (id, venda_id, vendedor_id, base, percentual, valor, situacao)
```

### 10.3 Mapeamento a partir do sistema atual

| MD Óculos | Novo modelo |
|---|---|
| `clientes` | `cliente` (+ campos novos: RG, e-mail, telefone fixo, profissão) |
| `exames` — colunas de grau | `receita_optica` |
| `exames.lentes / tratamentos / armacao` | `venda_item` + `produto` (deixam de ser texto livre) |
| `exames.valor_exame / valor_oculos / forma_pgto / data_venda` | `venda` + `venda_pagamento` |
| `exames.laboratorio / med_opto / data_saida / data_chegada / situacao` | `ordem_servico` |
| `exames.id_exame` (digitado) | `ordem_servico.numero` (sequencial automático) `[D5]` |
| `receitas_despesas` | `lancamento` (+ `conta_receber` / `conta_pagar`) |

### 10.4 Convenções

- Datas em **ISO 8601** (`YYYY-MM-DD`); campo vazio é **NULL**, nunca `1111-11-11` `[D6]`
- Dinheiro em **centavos, como inteiro** — elimina erro de arredondamento em ponto flutuante
- Graus em `REAL`, sempre múltiplos de 0,25
- Todo registro tem `criado_em`, `criado_por`, `alterado_em`, `alterado_por`
- Exclusão lógica (`ativo`) onde há histórico vinculado
- Índices em: `cliente.nome`, `cliente.cpf`, `produto.codigo_barras`, `venda.data`,
  `ordem_servico.numero`, `conta_receber.vencimento`

---

## 11. Migração dos dados do MD Óculos

Ferramenta de importação embutida no wizard (RF-02), para converter uma ótica que já usa o sistema
antigo.

**Fluxo:** conectar ao MySQL `mdoculos` → ler → transformar → gravar no SQLite → relatório.

**Transformações necessárias:**

| Situação na origem | Tratamento |
|---|---|
| `data_nasc = '1111-11-11'` | `NULL` |
| `cpf = '888.888.888-88'` | `NULL` (é o valor padrão, não um CPF real) |
| `celular = '(85)91234-1234'` | `NULL` (idem) |
| `exames.lentes / tratamentos / armacao` | Cria produto genérico "Item importado"; texto original vai para observação da venda |
| `exames.id_exame` | Vira `ordem_servico.numero`; a sequência continua a partir do maior valor |
| Um registro de `exames` | Gera `receita_optica` + `venda` + `venda_item` + `ordem_servico` + `lancamento` |
| `receitas_despesas` | Vira `lancamento`, mapeando `tipo` para receita/despesa |
| Campos em CAIXA ALTA | Normalizados para Capitalização de Nome Próprio |

**CA:**
1. A importação é **idempotente** — rodar duas vezes não duplica
2. Ao final, apresenta um relatório: importados, ignorados, com aviso
3. O banco de origem **nunca** é modificado
4. Registro que não puder ser convertido é listado, não descartado em silêncio

---

## 12. Design e experiência

### 12.1 Estrutura visual

Substituir o MDI (janelas internas soltas dentro de uma janela cinza) por **navegação lateral fixa**,
que é o padrão que o usuário já conhece de qualquer aplicação atual.

```
┌────────────┬────────────────────────────────────────────┐
│  [LOGO]    │  Título da tela          [busca]  [usuário]│
│            ├────────────────────────────────────────────┤
│  Início    │                                            │
│  Clientes  │                                            │
│  Receitas  │            Conteúdo                        │
│  Vendas    │                                            │
│  OS        │                                            │
│  Produtos  │                                            │
│  Estoque   │                                            │
│  Financeiro│                                            │
│  Relatórios│                                            │
│  ─────     │                                            │
│  Config.   │                                            │
├────────────┼────────────────────────────────────────────┤
│ Ótica X    │  Vendedor: Diego    ·    06/09/2026        │
└────────────┴────────────────────────────────────────────┘
```

A barra lateral **muda conforme o módulo**: o Vendedor simplesmente não tem os itens Estoque,
Financeiro, Relatórios e Configurações.

### 12.2 Identidade visual

- Cor de destaque derivada da configuração da ótica, aplicada a botões, links e cabeçalhos de PDF
- Neutros consistentes em tema claro e escuro
- Verde para confirmação, âmbar para atenção, vermelho para erro e exclusão
- Logo da ótica na barra lateral, na tela de login e nos impressos

### 12.3 Diretrizes

- Formulário longo dividido em abas, preservando a organização atual da tela de exame
  (Longe / Perto / Produto / Financeiro / OS)
- Tabelas com ordenação, filtro, densidade ajustável e colunas configuráveis
- Busca global (`Ctrl+K`) — cliente, OS ou produto de qualquer tela
- Feedback imediato: *skeleton* ao carregar, *toast* ao concluir
- Erro sempre acompanhado de ação sugerida
- Impressão sempre com pré-visualização

### 12.4 Atalhos preservados do sistema atual

| Atalho | Ação |
|---|---|
| `Alt+C` | Novo cliente |
| `Alt+E` | Nova receita óptica |
| `Ctrl+C` | Pesquisar cliente |
| `Ctrl+E` | Pesquisar receita |
| `Ctrl+S` | Protocolo de saída |
| `Ctrl+A` | Aniversariantes |
| `Ctrl+B` | Backup |
| `Ctrl+K` | Busca global (novo) |
| `F2` | Nova venda (novo) |

---

## 13. Regras de negócio

| # | Regra |
|---|---|
| RN-01 | O número da OS é sequencial e automático, com prefixo configurável; nunca digitado `[D5]` |
| RN-02 | `esférico perto = esférico longe + adição`, calculado automaticamente e sobrescrevível |
| RN-03 | Eixo entre 0 e 180 graus; esférico e cilíndrico em passos de 0,25 |
| RN-04 | Situação da OS segue `EM ABERTO → LABORATÓRIO → CHEGOU → ENTREGUE`; `CANCELADA` a partir de qualquer estado |
| RN-05 | Venda concluída baixa estoque e gera financeiro na **mesma transação** `[D9]` |
| RN-06 | Soma das parcelas é exatamente igual ao total; o resíduo de arredondamento vai na primeira parcela |
| RN-07 | Desconto acima do teto do vendedor exige autorização de Administrador |
| RN-08 | Comissão calculada sobre o total líquido, provisionada na venda e liberada na quitação |
| RN-09 | `preço de venda = custo × (1 + margem)`, arredondado conforme a política configurada |
| RN-10 | Saldo de estoque é sempre a soma das movimentações; nunca campo editável |
| RN-11 | Cancelar venda estorna estoque, financeiro e comissão |
| RN-12 | `lucro = receitas − despesas` no período, em regime de caixa ou competência `[D8]` |
| RN-13 | Cliente, produto ou usuário com histórico é inativado, nunca excluído |
| RN-14 | Cada alteração de grau gera nova versão da receita; a anterior é preservada |
| RN-15 | Entrega da OS exige quitação ou autorização de Administrador |
| RN-16 | Licença vencida coloca o sistema em somente-leitura; **jamais apaga dados** |

---

## 14. Licenciamento

### 14.1 Modelo

- **Chave de ativação** vinculada ao fingerprint da máquina, validada offline
- Perpétua (com suporte anual opcional) ou anual
- Uma chave por instalação; ótica com vários PCs recebe uma chave por terminal

### 14.2 Fingerprint

Combinação estável de identificadores de hardware (CPU, placa-mãe, disco), com tolerância a
mudanças pequenas — trocar um pente de memória não pode invalidar a licença. Troca de placa-mãe ou
formatação exige reativação, com processo de suporte definido.

### 14.3 Estados

| Estado | Comportamento |
|---|---|
| Não ativado | Somente o wizard de ativação |
| Ativa | Funcionamento pleno |
| Próxima do vencimento | Aviso a partir de 30 dias antes |
| Em carência | Funciona, com aviso persistente (padrão 15 dias) |
| Vencida | Somente leitura: consulta e **backup liberados**; cadastro e venda bloqueados |

> A regra de nunca bloquear o backup é deliberada: o dado é da ótica, não seu. Bloquear o acesso aos
> próprios dados de um cliente inadimplente cria um problema jurídico muito maior que a dívida.

### 14.4 Ferramenta de geração de chaves

Aplicativo separado, de uso exclusivo seu: recebe fingerprint, dados da ótica e validade, e emite a
chave assinada. Mantém o registro das licenças emitidas.

---

## 15. Roadmap

| Fase | Entrega | Requisitos |
|---|---|---|
| **F0 — Fundação** | Projeto Electron+React, banco, migrations, camada de repositórios, IPC tipado, tema, componentes base | Arquitetura |
| **F1 — Acesso e configuração** | Login, usuários, permissões, wizard, white-label, auditoria | RF-01, RF-02, RF-03, RF-15 |
| **F2 — Núcleo óptico** | Clientes, receita óptica, OS, protocolo, aniversariantes, impressão da OS | RF-04, RF-05, RF-06 |
| **F3 — Comercial** | Produtos, vendas, contas a receber, parcelamento, comissão | RF-07, RF-10, RF-11.1 |
| **F4 — Estoque e compras** | Movimentações, inventário, fornecedores, compras, contas a pagar | RF-08, RF-09, RF-11.2 |
| **F5 — Gestão** | Caixa, fluxo, lucro/prejuízo, relatórios, dashboard | RF-11.3, RF-11.4, RF-12, RF-14 |
| **F6 — Produto** | Backup, licença, instalador, atualização, migração de dados | RF-13, RF-16, seção 11 |
| **F7 — Piloto** | Instalação em ótica real, ajustes, documentação, treinamento | — |

**Sugestão de sequência de validação:** ao final de F2 o sistema já substitui o MD Óculos atual no
essencial. Vale instalar numa ótica amiga nesse ponto, antes de construir F3–F5 — feedback real
sobre a receita óptica e a OS vale mais que qualquer suposição sobre estoque.

---

## 16. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Escopo grande demais para um MVP | Alto | Roadmap em fases; F2 já é entregável |
| Complexidade do domínio óptico | Médio | O domínio já está validado no sistema atual; glossário na seção 18 |
| Migração de dados corrompe informação | Alto | Origem nunca modificada; importação idempotente; relatório de divergência |
| Ótica sem hábito de backup perde tudo | Alto | Backup automático, verificado, com alerta visível |
| Usuário resiste a login onde antes não havia | Médio | Login rápido, sessão longa, mostrar o ganho (comissão por vendedor) |
| Instalador de ~150 MB assusta | Baixo | Expectativa alinhada na venda; sem pré-requisito compensa |
| LGPD ignorada expõe você e a ótica | Alto | Requisitos da seção 8.4 desde a v1; documento de orientação ao cliente |
| Suporte cresce mais que a base de clientes | Médio | Log técnico, backup automático, tela de diagnóstico, manual em vídeo |
| Licença quebra após troca de hardware | Médio | Tolerância no fingerprint; processo de reativação definido |

---

## 17. Decisões em aberto

| # | Questão | Recomendação |
|---|---|---|
| Q1 | Optometrista deve ser usuário do sistema ou apenas cadastro auxiliar? | Cadastro auxiliar na v1; virar perfil quando houver demanda |
| Q2 | Perfil "Gerente" (financeiro sim, configuração não) faz sentido? | Não na v1 — a arquitetura de permissões já permite criar depois |
| Q3 | Convênios e planos de saúde entram em qual versão? | v2, após validar com óticas piloto |
| Q4 | Vender por licença perpétua ou mensalidade? | Perpétua + suporte anual: óticas pequenas resistem a mensalidade de software |
| Q5 | Emissão fiscal (NFC-e) é bloqueio de venda? | Validar com as primeiras óticas; muitas usam emissor separado |

---

## 18. Glossário óptico

| Termo | Significado |
|---|---|
| **OD** | *Oculus Dexter* — olho direito |
| **OE** | *Oculus Sinister* — olho esquerdo |
| **Esférico (ESF)** | Grau de miopia (negativo) ou hipermetropia (positivo), em dioptrias |
| **Cilíndrico (CIL)** | Grau de astigmatismo, em dioptrias |
| **Eixo** | Orientação do astigmatismo, de 0° a 180° |
| **DNP** | Distância Naso-Pupilar — do centro do nariz ao centro da pupila, por olho, em mm |
| **Adição** | Grau adicional para perto, na presbiopia ("vista cansada") |
| **Longe** | Prescrição para visão à distância |
| **Perto** | Prescrição para leitura; esférico = longe + adição |
| **Altura** | Posição vertical do centro óptico na armação, em mm |
| **OS** | Ordem de Serviço — pedido de confecção do par |
| **Protocolo de saída** | Controle dos pares enviados ao laboratório e ainda não entregues |
| **Surfaçagem** | Processo de fabricação da lente conforme a receita |
| **Índice de refração** | Densidade óptica da lente; quanto maior, mais fina (1.56, 1.61, 1.67, 1.74) |
| **Tratamento** | Camada aplicada à lente: antirreflexo, fotossensível, filtro azul, endurecedor |
| **Visão simples** | Lente com um único grau |
| **Bifocal** | Lente com duas zonas de grau, com linha visível |
| **Multifocal** | Lente com transição progressiva entre longe e perto |

---

## Anexo A — Rastreabilidade das dívidas técnicas

| Dívida | Requisito que resolve |
|---|---|
| D1 — Credenciais hardcoded | RF-02, NF 8.3 |
| D2 — Senha em linha de comando no backup | RF-02, RF-13.1, NF 8.3 |
| D3 — Configuração externa não usada | RF-01 |
| D4 — Logo embutida no JAR | RF-01 |
| D5 — Nº da OS digitado à mão | RF-06, RN-01 |
| D6 — Sentinela `1111-11-11` e parsing por substring | RF-05, seção 10.4, seção 11 |
| D7 — `camposObrigatorios()` com `&&` | RF-05 |
| D8 — Lucro/Prejuízo não calcula | RF-11.4, RN-12 |
| D9 — Venda não gera financeiro | RF-10, RF-11.1, RN-05 |
| D10 — Decimais gravados como string | RF-05, seção 10.4 |
| D11 — Look-and-feel não aplicado | Seção 12 (stack nova) |
| D12 — Sem login, perfis, auditoria, estoque | RF-03, RF-08, RF-15, seção 7 |
| D13 — Dado de saúde sem controle (LGPD) | RF-03, RF-15, NF 8.4 |
