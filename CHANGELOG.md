# Notas de versão — OptiAleph

## Próxima versão

- Receita óptica: os tratamentos da lente agora são caixinhas de marcar, e dá para
  escolher mais de um (ex.: antirreflexo e filtro azul). Receitas antigas com um
  tratamento só continuam iguais; um valor antigo que não está mais na lista
  aparece marcado, com "(fora da lista)", e nada se perde ao editar.
- Receita óptica: ao digitar a Adição, o esférico de Perto de cada olho é calculado
  na hora (Longe mais Adição), sem precisar salvar. Se você digitar outro valor no
  Perto, ele é respeitado. Ao editar uma receita, um Perto diferente de Longe mais
  Adição não é sobrescrito.
- Tratamento de lente "ENDURECEDOR" passa a se chamar "ANTIRRISCO" na lista de
  opções. As receitas já gravadas com ENDURECEDOR não são alteradas.

- Recuperação de senha do Administrador: "Esqueci minha senha" na tela de login. O
  sistema mostra um pedido; o dono o envia ao suporte, que devolve um código
  assinado. Com o código, o sistema lista os Administradores (resolve também o
  login esquecido) e deixa definir a senha nova, sem internet. O código vale só
  para aquele computador e uma única vez, então um funcionário com acesso ao
  Windows não consegue virar Administrador. Funciona mesmo com a licença vencida,
  reativa a conta se estava inativa, tira o bloqueio por tentativas e fica na
  Auditoria. Para o suporte: `node tools/gerar-codigo-recuperacao.mjs <PEDIDO> --chave <chave-privada.pem>`.

- Relacionamento: nova seção "Resultados" (só para o Administrador), com os últimos
  30 ou 90 dias: contatos feitos, quantos clientes voltaram (e o percentual), quanto
  foi vendido depois do contato e quantas parcelas vencidas foram recuperadas, com o
  detalhe por motivo. "Voltar" é comprar (aniversário, pós-venda e renovação), retirar
  o óculos (retirada) ou pagar a parcela vencida (cobrança) até 30 dias depois do
  contato. Mostra o que veio depois do contato, não prova que foi por causa dele.

- Período de teste grátis passa de 14 para 30 dias. Quem já está em teste ganha os
  dias a mais, porque a contagem parte da data da primeira abertura. Depois do
  teste o sistema fica somente leitura, sem apagar nenhum dado, até a ativação da
  licença.

- Importação do MD Óculos em duas etapas: "Analisar" (não grava nada e mostra o
  que vai acontecer, com a explicação de cada problema) e "Importar agora"
  (com backup antes; sem backup a importação não começa). CPF repetido pode ser
  unido (mesma pessoa) ou importado sem o CPF de quem repete; o CPF original
  fica na observação do cadastro. Cadastros em branco do sistema antigo não
  entram, e há o cartão "Entregas antigas em aberto" para encerrar de uma vez as
  OS antigas nunca entregues.
- Nova tela "Pendências da importação" (administrador): CPF inválido ou
  repetido, datas incoerentes do exame (com data sugerida e correção em lote) e
  exames sem cliente. As pendências ficam salvas, e tudo vai para a Auditoria.
- Textos de cadastro (nome, endereço, marca, modelo etc.) passam a ser
  gravados em maiúsculas, com acento; os já cadastrados são ajustados uma vez.
- Busca sem acento e sem diferença de maiúsculas nos cadastros ("priscila"
  encontra "PRÍSCILA").
- Visualizador de PDF: Ctrl + roda do mouse aproxima e afasta a partir do
  ponteiro; a roda sozinha rola as páginas.
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
