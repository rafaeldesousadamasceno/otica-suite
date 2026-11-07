# Notas de versão — OptiAleph

## Próxima versão

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
