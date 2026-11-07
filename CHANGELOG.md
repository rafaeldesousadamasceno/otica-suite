# Notas de versão — OptiAleph

## Próxima versão

- Formulários: o Enter dentro de um campo agora só passa para o próximo campo e
  não salva mais sem querer. Vale para receita, cliente, venda, compra, produto,
  fornecedor, ordem de serviço, contas, caixa, usuários, ajuste de estoque e
  baixas; o salvamento fica só no botão. Login, troca de senha, autorização de
  administrador e configuração inicial continuam enviando com Enter.
- Receita óptica: botão "Editar" em cada receita da ficha do cliente, para
  corrigir um dado digitado errado ou uma receita salva sem querer. A correção
  vale no mesmo registro (as OS ligadas a ela passam a mostrar o valor
  corrigido) e o valor de antes fica guardado na Auditoria.
- Receita óptica: campo DP (longe e perto, olho direito e esquerdo) logo depois
  do DNP, também no PDF da OS. O campo Altura saiu da tela e do PDF.
- Importação do MD Óculos: clientes sem nome e sem nenhuma receita não entram
  mais; os que já tinham entrado são removidos na próxima importação, com
  backup antes.
- Visualizador de PDF dentro do sistema: todo relatório abre na tela, com
  zoom e páginas, e de lá é possível salvar ou imprimir direto (escolhendo a
  impressora). Antes era preciso salvar o arquivo e abrir fora do sistema.
- Os relatórios em paisagem saem em paisagem e sem margem dobrada.
- Relatórios com visual novo e padronizado: faixa na cor da ótica com logo e
  contatos, cards de resumo coloridos (verde para resultado positivo, vermelho
  para negativo), tabelas zebradas, selos de situação, fonte do sistema e
  rodapé com "Página X de Y". Ganharam gráficos: receitas × despesas,
  saldo acumulado do fluxo de caixa, receita por categoria e produtos com
  maior margem (lucro/prejuízo), atraso da inadimplência, Pareto da curva
  ABC e total por vendedor. A OS, o comprovante, o carnê e o protocolo
  seguem o mesmo padrão.
- Painel inicial gerencial: filtro de período (hoje, últimos 7/30 dias, este mês,
  mês anterior, 3 e 6 meses, este ano, ano anterior ou datas livres), comparação
  com o período anterior e filtro por vendedor para o administrador. Indicadores
  de faturamento, vendas, ticket médio, lucro bruto e margem (estimados), clientes
  novos e recorrentes, recebido, despesas e resultado de caixa, cada um com a
  variação e a explicação do cálculo. Gráficos de evolução do faturamento (com o
  período anterior em linha tracejada), recebido e despesas, vendas por categoria,
  ranking de vendedores, produtos mais vendidos, formas de pagamento e ordens de
  serviço. "Posição atual" separada (contas, estoque e OS) e "Insights da Ótica",
  com avisos que levam direto à lista filtrada.
- O custo do produto passa a ser guardado em cada venda nova, para o lucro bruto
  não mudar quando o custo do produto mudar. Vendas antigas usam o custo atual.
- O painel não deixa mais de contar produtos abaixo do mínimo ou OS atrasadas
  quando há muitos registros.
- Ajuda dentro do sistema: página com sumário e busca (sem acento) e o botão
  "Ajuda" na barra superior, que abre direto a seção da tela em que a pessoa
  está. O Vendedor só vê as seções que usa. O mesmo conteúdo gera o "Manual em
  PDF", com capa na cor da ótica e sumário, aberto no visualizador.
- Base para a sincronização com a nuvem: cada registro ganha um identificador
  único e um número de alteração, e as exclusões ficam registradas. Nada é
  enviado ainda; o plano (Supabase e app de celular) está em
  docs/Arquitetura-Sincronizacao.md.
- Com a tela baixa, textos só para leitor de tela não esticam mais a página.
- Inadimplência mostra os dias em atraso; vendas por vendedor mostram ticket
  médio e participação.
- O relatório de produtos abaixo do mínimo não deixa mais produtos de fora
  quando a ótica tem mais de 500 itens cadastrados.
- Com a janela baixa, só o menu lateral rola, e não a tela inteira.

## 0.1.0

Primeira versão do sistema, substituindo o MD Óculos (Java Swing + MySQL).

- Login com perfis de Administrador e Vendedor
- Cadastro de clientes, receita óptica e ordens de serviço
- Vendas com pagamento misto, parcelamento e comissão automática
- Estoque, fornecedores e compras
- Contas a receber e a pagar, fluxo de caixa e lucro/prejuízo
- Dashboard com indicadores do dia e do mês e gráficos de vendas, receitas
  e despesas, ranking de vendedores, vendas por categoria e ordens de serviço
- Backup automático e licenciamento offline no mesmo padrão do Visium: 14 dias de
  teste, aviso 10 dias antes de vencer, carência de 7 dias, proteção contra
  relógio voltado e soma do tempo restante ao cadastrar a renovação
- Relacionamento: lista "quem chamar hoje" (retirada, cobrança, aniversário,
  pós-venda e renovação) com atalho para o WhatsApp e registro do contato
- Importação dos dados do sistema anterior (MD Óculos)
- Relatórios em PDF: ordem de serviço, protocolo de saída, comprovante de
  venda, carnê de parcelas, aniversariantes, financeiro, estoque, curva ABC
  de produtos e desempenho de vendedores
