import type { SecaoAjuda } from './tipos'

/**
 * O manual do OptiAleph. A ordem do array e a ordem do sumario e do PDF.
 * Quando uma tela mudar, a secao dela muda aqui: um teste confere que toda
 * tela do menu tem a sua secao.
 */
export const SECOES_AJUDA: SecaoAjuda[] = [
  {
    id: 'primeiros-passos',
    titulo: 'Primeiros passos',
    rotas: [],
    resumo: 'O que é o sistema, os dois perfis de acesso, a primeira configuração e o login.',
    blocos: [
      {
        tipo: 'paragrafo',
        texto:
          'O OptiAleph é o sistema de gestão da sua ótica: clientes, receitas ópticas, ordens de serviço, vendas, estoque, financeiro e relatórios, tudo integrado. Ele roda direto no computador da loja e não precisa de internet para o uso do dia a dia.'
      },
      {
        tipo: 'paragrafo',
        texto:
          'Cada pessoa entra com o próprio usuário, e o sistema mostra telas diferentes conforme o perfil. O Administrador tem acesso completo: além do que o Vendedor faz, cuida de estoque, fornecedores e compras, contas a pagar, caixa, relatórios financeiros, usuários, configurações, backup e auditoria. O Vendedor cadastra clientes, receitas e ordens de serviço, faz vendas e recebe parcelas, sempre dentro dos limites definidos pelo Administrador. Ele não vê o custo dos produtos nem os números financeiros da loja, só o que diz respeito às próprias vendas.'
      },
      {
        tipo: 'dica',
        titulo: 'Segurança de verdade',
        texto:
          'O sistema confere a permissão de novo, por trás da tela, toda vez que uma ação é feita. Um Vendedor nunca consegue fazer algo que o Administrador não liberou, nem sem querer.'
      },
      { tipo: 'paragrafo', texto: 'Primeiro acesso: na primeira vez que o sistema é aberto aparece o assistente de configuração. Ele só aparece uma vez.' },
      {
        tipo: 'tabela',
        colunas: ['Campo', 'O que preencher'],
        linhas: [
          ['Nome fantasia', 'O nome da sua ótica, como deve aparecer no sistema e nos impressos.'],
          ['CNPJ', 'Opcional aqui. Pode ser preenchido depois em Configurações.'],
          ['Seu nome', 'Quem vai ser o Administrador do sistema.'],
          ['Login', 'Pelo menos 3 caracteres. É o que você digita para entrar.'],
          ['Senha e confirmação', 'Pelo menos 8 caracteres, e as duas precisam ser iguais.']
        ]
      },
      {
        tipo: 'paragrafo',
        texto:
          'Clique em "Concluir configuração". Essa conta vira o primeiro Administrador. Não existe usuário nem senha de fábrica: só vale o que você criar aqui.'
      },
      {
        tipo: 'atencao',
        titulo: 'Senha provisória',
        texto:
          'Quando o Administrador cadastra um usuário novo, ele pode não ter senha ainda: no primeiro acesso a própria pessoa escolhe a senha na tela de login. Se o Administrador redefinir a senha de alguém, ela é provisória e o sistema pede a troca no próximo login. Isso é normal, não é erro.'
      }
    ]
  },
  {
    id: 'inicio',
    titulo: 'Início: o painel',
    rotas: ['/'],
    resumo: 'Como a ótica foi no período escolhido, com comparação, gráficos e avisos.',
    blocos: [
      {
        tipo: 'paragrafo',
        texto:
          'A tela inicial responde "como a ótica está indo". Os botões "Novo cliente" e "Nova OS" ficam sempre no topo. Logo abaixo está a barra de filtros, e tudo o que vem depois (indicadores e gráficos) acompanha o período escolhido.'
      },
      { tipo: 'paragrafo', texto: 'Barra de filtros' },
      {
        tipo: 'lista',
        itens: [
          'Período: Hoje, Ontem, Últimos 7 dias, Últimos 30 dias, Este mês, Mês anterior, Últimos 3 meses, Últimos 6 meses, Este ano, Ano anterior ou Personalizado (você escolhe as duas datas).',
          'Comparar com o período anterior: ligado por padrão. "Este mês" compara com a mesma fatia do mês passado (1 a 7 de novembro contra 1 a 7 de outubro). Os demais comparam com o período imediatamente anterior, de mesma duração.',
          'Vendedor (só para o Administrador): mostra os números de um vendedor específico. Com esse filtro, o caixa da loja e o ranking da equipe ficam de fora, porque são da loja toda.'
        ]
      },
      {
        tipo: 'dica',
        titulo: 'O período fica na tela',
        texto:
          'Se você abrir uma lista por um cartão do painel e voltar, o painel continua no período que você tinha escolhido.'
      },
      { tipo: 'paragrafo', texto: 'Indicadores do período' },
      {
        tipo: 'tabela',
        colunas: ['Indicador', 'O que mostra'],
        linhas: [
          ['Faturamento', 'Soma das vendas feitas no período, já com os descontos. Vendas canceladas não entram. É o que foi vendido, não o que já foi recebido.'],
          ['Vendas realizadas', 'Quantidade de vendas, sem as canceladas.'],
          ['Ticket médio', 'Faturamento dividido pela quantidade de vendas.'],
          ['Lucro bruto (estimado) e margem', 'Receita dos itens menos o custo deles. Usa o custo do produto na data da venda; vendas antigas usam o custo atual. Itens sem custo conhecido (importados do sistema antigo, produtos sem custo cadastrado) ficam de fora, e o painel avisa que parte da receita da margem é cobertura parcial.'],
          ['Clientes no período', 'Quem comprou. Novo é quem comprou pela primeira vez; recorrente já tinha comprado antes do período.'],
          ['Recebido, Despesas pagas e Resultado de caixa', 'Regime de caixa: o que de fato entrou e saiu. Suprimento e sangria de caixa não contam, e o estorno de uma venda cancelada abate o recebido. O resultado não é o lucro da empresa: é só a diferença entre o que entrou e o que saiu.']
        ]
      },
      {
        tipo: 'paragrafo',
        texto:
          'Cada cartão mostra a variação em relação ao período de comparação: seta para cima ou para baixo, o percentual e o valor de antes. Nas despesas as cores se invertem (gastar menos é bom). O "i" ao lado do nome explica o cálculo.'
      },
      {
        tipo: 'paragrafo',
        texto:
          'Posição atual: contas a receber (em aberto e vencidas), contas a pagar (vencidas e do dia), produtos abaixo do mínimo, OS atrasadas, óculos prontos para retirada e aniversariantes da semana. É a foto de hoje e não muda com o período do filtro. Clicar num cartão abre a lista já filtrada.'
      },
      {
        tipo: 'paragrafo',
        texto:
          'Insights da Ótica: avisos curtos sobre o que merece atenção (queda do faturamento, contas vencidas, OS atrasadas, estoque baixo, vendedor sem vendas). Quando há uma lista por trás do aviso, clicar nele abre a lista.'
      },
      {
        tipo: 'paragrafo',
        texto:
          'Gráficos: evolução do faturamento (com o período anterior em linha tracejada), recebido e despesas, vendas por categoria, ranking de vendedores, produtos mais vendidos, formas de pagamento e ordens de serviço. O botão no canto de cada gráfico troca para a tabela com os mesmos números.'
      },
      {
        tipo: 'atencao',
        titulo: 'Formas de pagamento mostram o vendido',
        texto: 'O gráfico de formas de pagamento soma o que foi vendido em cada forma. Venda parcelada ou com pagamento pendente entra inteira, mesmo que o dinheiro ainda não tenha chegado.'
      },
      {
        tipo: 'paragrafo',
        texto:
          'O Vendedor vê o mesmo painel, mas só com as próprias vendas, mais a comissão do período. Financeiro, custo e margem, e ranking da equipe não aparecem para ele.'
      }
    ]
  },
  {
    id: 'clientes',
    titulo: 'Clientes',
    rotas: ['/clientes'],
    resumo: 'Busca e cadastro de clientes.',
    blocos: [
      {
        tipo: 'paragrafo',
        texto: 'A tela tem o campo de busca por nome, CPF ou celular e a lista de clientes. Os botões "Aniversariantes" e "Novo cliente" ficam no topo.'
      },
      {
        tipo: 'passos',
        itens: [
          'Clique em "Novo cliente".',
          'Preencha os dados pessoais (nome completo, data de nascimento, CPF, RG, profissão, celular, telefone, e-mail).',
          'Preencha o endereço (CEP, logradouro, número, complemento, bairro, cidade, UF).',
          'Se quiser, preencha "Indicado por" e as observações.',
          'Clique em "Cadastrar cliente". O sistema já abre a ficha do cliente novo.'
        ]
      },
      { tipo: 'paragrafo', texto: 'Só o nome é obrigatório.' },
      {
        tipo: 'atencao',
        titulo: '"Remover" nem sempre apaga',
        texto: 'Se o cliente nunca comprou nada, ele é excluído de verdade. Se já tem histórico (venda, ordem de serviço ou receita), o sistema só o marca como inativo: ele some das buscas do dia a dia, mas o histórico fica guardado.'
      }
    ]
  },
  {
    id: 'ficha-cliente',
    titulo: 'Ficha do cliente e receita óptica',
    rotas: ['/clientes/:id'],
    resumo: 'Receitas, ordens de serviço e vendas de um cliente; como lançar uma receita.',
    blocos: [
      {
        tipo: 'paragrafo',
        texto:
          'Ao clicar num cliente da lista você chega na ficha dele, com os botões "Editar" e "Remover" e três seções: Receitas ópticas, Ordens de Serviço e Vendas, cada uma com o botão para lançar uma nova e o histórico completo.'
      },
      { tipo: 'paragrafo', texto: 'Lançar uma receita óptica' },
      {
        tipo: 'passos',
        itens: [
          'Na ficha, clique em "Nova receita".',
          'Informe a data do exame e, se quiser, o profissional (optometrista) que atendeu.',
          'Preencha as duas tabelas, Longe e Perto. Cada uma tem uma linha para o olho direito (OD) e outra para o esquerdo (OE), com as colunas Esférico, Cilíndrico, Eixo, DNP e DP.',
          'Preencha a Adição, o Tipo de lente e os Tratamentos, e depois a Armação e as Observações.',
          'Clique em "Salvar receita".'
        ]
      },
      {
        tipo: 'dica',
        titulo: 'Cálculo automático do Perto',
        texto: 'Se você preencher a Adição e deixar o esférico de Perto em branco, o sistema calcula sozinho (Longe mais Adição) para cada olho.'
      },
      {
        tipo: 'paragrafo',
        texto:
          'DNP é a distância do centro do nariz até a pupila, de cada olho. DP é a distância pupilar, também registrada por olho, em Longe e em Perto, sempre em milímetros. O campo Altura saiu do formulário; as receitas antigas continuam guardadas.'
      },
      {
        tipo: 'paragrafo',
        texto: 'Cada receita nova vira uma versão no histórico do cliente. As antigas continuam visíveis: nada é substituído nem perdido.'
      }
    ]
  },
  {
    id: 'ordens-servico',
    titulo: 'Ordens de serviço',
    rotas: ['/ordens-servico'],
    resumo: 'Acompanhar o pedido do cliente até a entrega, e o protocolo de saída.',
    blocos: [
      {
        tipo: 'paragrafo',
        texto:
          'A Ordem de Serviço (OS) acompanha o pedido, da abertura até a entrega ao cliente. Cada OS tem um número sequencial (ex.: 2026-00001) e passa por quatro situações, nesta ordem:'
      },
      {
        tipo: 'tabela',
        colunas: ['Situação', 'Significa'],
        linhas: [
          ['EM ABERTO', 'Acabou de ser criada.'],
          ['LABORATÓRIO', 'Foi enviada para confecção.'],
          ['CHEGOU', 'Voltou do laboratório e o cliente já pode retirar.'],
          ['ENTREGUE', 'O cliente retirou.']
        ]
      },
      { tipo: 'paragrafo', texto: 'Uma OS também pode ser marcada como CANCELADA a qualquer momento.' },
      {
        tipo: 'paragrafo',
        texto:
          'A tela tem busca, filtro por situação e a opção "Só atrasadas": uma OS está atrasada quando passou da data de previsão e o par ainda não chegou. O painel inicial leva direto para essa lista.'
      },
      {
        tipo: 'paragrafo',
        texto:
          'Protocolo de saída: o botão "Imprimir protocolo" gera um PDF com as OS da lista filtrada, útil para o laboratório ou para conferir na entrega. No detalhe de cada OS há também o botão para imprimir a própria OS com a receita.'
      }
    ]
  },
  {
    id: 'vendas',
    titulo: 'Vendas',
    rotas: ['/vendas'],
    resumo: 'Fazer, consultar e cancelar uma venda.',
    blocos: [
      {
        tipo: 'paragrafo',
        texto: 'A lista mostra número, cliente, data, total e situação. O Administrador vê também o vendedor de cada venda; o Vendedor só vê as próprias.'
      },
      {
        tipo: 'passos',
        itens: [
          'Clique em "Nova venda" e escolha o cliente.',
          'Se quiser, vincule uma receita óptica e uma ordem de serviço já existentes.',
          'Busque e adicione os produtos. Cada item tem quantidade, preço e desconto próprios.',
          'Se precisar, aplique um desconto adicional sobre o total.',
          'Adicione uma ou mais formas de pagamento (à vista, cartão, parcelado...) até o valor bater com o total.',
          'Clique em "Concluir venda".'
        ]
      },
      {
        tipo: 'paragrafo',
        texto: 'O sistema calcula subtotal, desconto e total ao vivo e avisa se falta ou sobra valor no pagamento.'
      },
      {
        tipo: 'atencao',
        titulo: 'Desconto acima do limite',
        texto: 'Se o desconto passar do limite que o Administrador definiu para o Vendedor, abre a tela "Autorização necessária", que pede o login e a senha de um Administrador ali mesmo, sem sair do sistema. A mesma tela aparece quando a loja está configurada para não vender sem saldo em estoque.'
      },
      {
        tipo: 'paragrafo',
        texto:
          'No detalhe da venda há os botões para imprimir o comprovante e o carnê de parcelas (um canhoto por parcela). Cancelar a venda devolve os produtos ao estoque, estorna o que já tinha entrado no financeiro e cancela a comissão, tudo de uma vez.'
      }
    ]
  },
  {
    id: 'contas-receber',
    titulo: 'Contas a receber',
    rotas: ['/contas-receber'],
    resumo: 'Parcelas das vendas parceladas e a baixa de cada uma.',
    blocos: [
      {
        tipo: 'paragrafo',
        texto: 'Lista as parcelas de vendas parceladas, com busca, filtro de situação (Em aberto, Pagas, Canceladas) e a opção "Só vencidas". Parcelas vencidas aparecem em vermelho.'
      },
      {
        tipo: 'passos',
        itens: [
          'Clique no ícone de cifrão da parcela em aberto.',
          'Confira o valor recebido (já vem com o valor restante, mas aceita baixa parcial).',
          'Informe a data e a forma de recebimento.',
          'Confirme.'
        ]
      },
      { tipo: 'paragrafo', texto: 'O Vendedor só vê e recebe as parcelas das próprias vendas.' }
    ]
  },
  {
    id: 'relacionamento',
    titulo: 'Relacionamento',
    rotas: ['/relacionamento'],
    resumo: 'Quem vale a pena chamar hoje, com a mensagem pronta no WhatsApp.',
    blocos: [
      {
        tipo: 'paragrafo',
        texto:
          'A lista "quem chamar hoje" reúne os clientes que merecem um contato agora: óculos que chegaram (retirada), parcela vencida (cobrança), aniversário, pós-venda e renovação da receita. O sistema não envia nada sozinho: ele abre o WhatsApp da própria pessoa com a mensagem pronta.'
      },
      {
        tipo: 'passos',
        itens: [
          'Filtre pelo motivo, se quiser.',
          'Clique no botão do WhatsApp do cliente: o WhatsApp abre com a mensagem pronta.',
          'Depois de falar com ele, clique em "Contatado" e, se quiser, anote algo (ex.: "vai passar na sexta").'
        ]
      },
      {
        tipo: 'paragrafo',
        texto: 'Quem já foi chamado por aquela ocorrência sai da lista. Só volta se surgir outra (um novo aniversário, uma nova parcela vencida...).'
      },
      {
        tipo: 'dica',
        texto: 'Para um cliente que não quer receber contato, use o ícone do sino cortado: ele deixa de aparecer na lista. O Administrador também pode editar os modelos de mensagem.'
      }
    ]
  },
  {
    id: 'aniversariantes',
    titulo: 'Aniversariantes',
    rotas: ['/aniversariantes'],
    resumo: 'Clientes que fazem aniversário no mês.',
    blocos: [
      {
        tipo: 'paragrafo',
        texto: 'Escolha o mês para ver os aniversariantes, com nascimento e celular. O botão de impressão gera o PDF da lista.'
      }
    ]
  },
  {
    id: 'produtos',
    titulo: 'Produtos',
    rotas: ['/produtos'],
    resumo: 'Cadastro de armações, lentes, acessórios e serviços.',
    blocos: [
      {
        tipo: 'paragrafo',
        texto: 'Cadastro de tudo o que a ótica vende. A busca aceita descrição, código interno ou código de barras, e há filtro por categoria.'
      },
      {
        tipo: 'paragrafo',
        texto: 'O Vendedor só consulta os produtos, sem custo nem margem. Só o Administrador cadastra e edita, e só ele vê o custo.'
      },
      {
        tipo: 'passos',
        itens: [
          'Clique em "Novo produto" (Administrador).',
          'Preencha a descrição e a categoria (Armação, Lente, Acessório ou Serviço). Para Lente aparecem campos extras: material, índice, tipo e faixa de grau.',
          'Preencha o custo, a margem (%) e o preço de venda.'
        ]
      },
      {
        tipo: 'dica',
        titulo: 'Preço sugerido',
        texto: 'Ao preencher custo e margem aparece "Sugestão pela margem": clique para preencher o preço de venda. Você ainda pode digitar outro valor.'
      },
      {
        tipo: 'atencao',
        titulo: 'Cadastre o custo',
        texto: 'O lucro bruto e a margem do painel só consideram produtos com custo cadastrado. Produto sem custo fica fora desse cálculo.'
      }
    ]
  },
  {
    id: 'estoque',
    titulo: 'Estoque',
    rotas: ['/estoque'],
    resumo: 'Saldo de cada produto e ajuste por contagem física.',
    blocos: [
      {
        tipo: 'paragrafo',
        texto: 'Mostra o saldo atual de cada produto, com filtro por categoria e por situação ("Abaixo do mínimo" e "Zerado"). O botão "Imprimir posição de estoque" gera o PDF dos produtos da lista.'
      },
      {
        tipo: 'paragrafo',
        texto: 'O Vendedor só consulta. O ajuste de estoque (contagem física) é do Administrador e fica registrado com motivo e usuário.'
      }
    ]
  },
  {
    id: 'fornecedores-compras',
    titulo: 'Fornecedores e compras',
    rotas: ['/fornecedores', '/compras'],
    soAdmin: true,
    resumo: 'Cadastro de fornecedores e entrada de mercadoria.',
    blocos: [
      {
        tipo: 'paragrafo',
        texto: 'Fornecedores: razão social, CNPJ, prazo de entrega, contato, telefone e e-mail. Um fornecedor pode ser inativado e reativado pelo ícone de energia, sem excluir.'
      },
      {
        tipo: 'paragrafo',
        texto: 'Compras: uma compra nova começa como ordem de compra (ABERTA). Escolha o fornecedor, informe a nota fiscal se tiver e adicione os produtos com quantidade e custo unitário.'
      },
      {
        tipo: 'atencao',
        titulo: 'Ordem de compra não mexe no estoque',
        texto: 'Só ao clicar em "Confirmar entrada" (informando o vencimento do pagamento) o sistema dá entrada no estoque, recalcula o custo médio dos produtos e cria uma conta a pagar. Antes disso, a compra pode ser cancelada sem afetar nada.'
      }
    ]
  },
  {
    id: 'contas-pagar',
    titulo: 'Contas a pagar',
    rotas: ['/contas-pagar'],
    soAdmin: true,
    resumo: 'Contas geradas pelas compras e contas lançadas à mão.',
    blocos: [
      {
        tipo: 'paragrafo',
        texto: 'Além das contas geradas pela entrada de mercadoria, dá para lançar uma conta manual: descrição, categoria, valor e vencimento. Há a opção "Só vencidas".'
      },
      {
        tipo: 'dica',
        titulo: 'Despesa recorrente',
        texto: 'Marque "Despesa recorrente" nas contas que se repetem todo mês (aluguel, energia). Assim que ela for paga, o sistema cria a do mês seguinte.'
      },
      { tipo: 'paragrafo', texto: 'Para pagar, clique no ícone de cifrão: informe o valor (aceita pagamento parcial), a data e a forma de pagamento.' }
    ]
  },
  {
    id: 'caixa',
    titulo: 'Caixa',
    rotas: ['/caixa'],
    soAdmin: true,
    resumo: 'Abertura, sangria, suprimento e fechamento do caixa do dia.',
    blocos: [
      {
        tipo: 'passos',
        itens: [
          'Ao abrir o dia, informe o saldo inicial e clique em "Abrir caixa".',
          'Com o caixa aberto, use "Sangria" (retirada) e "Suprimento" (reforço), cada um com valor e motivo.',
          'Ao "Fechar caixa", o sistema mostra o saldo esperado e pede o saldo contado no dinheiro físico.'
        ]
      },
      { tipo: 'paragrafo', texto: 'Se houver diferença, o sistema mostra exatamente quanto sobrou ou faltou. O histórico dos caixas fica na mesma tela.' }
    ]
  },
  {
    id: 'fluxo-lucro',
    titulo: 'Fluxo de caixa e lucro/prejuízo',
    rotas: ['/fluxo-caixa', '/lucro-prejuizo'],
    soAdmin: true,
    resumo: 'Receitas e despesas do período, nos regimes de caixa e de competência.',
    blocos: [
      {
        tipo: 'paragrafo',
        texto: 'O Fluxo de Caixa lista as receitas e despesas do período (filtro "De" e "Até") com o total de cada tipo e o saldo.'
      },
      { tipo: 'paragrafo', texto: 'O Lucro/Prejuízo mostra o resultado do período em duas visões:' },
      {
        tipo: 'lista',
        itens: [
          'Regime de caixa: o que efetivamente entrou e saiu.',
          'Regime de competência: reconhece a venda na data em que aconteceu e a despesa no vencimento da conta, mesmo que o dinheiro ainda não tenha mudado de mão.'
        ]
      },
      { tipo: 'paragrafo', texto: 'Abaixo, a margem por produto mostra quais itens deixam mais lucro: quantidade vendida, receita, custo e margem.' }
    ]
  },
  {
    id: 'relatorios',
    titulo: 'Relatórios e visualizador de PDF',
    rotas: ['/relatorios'],
    soAdmin: true,
    resumo: 'Todos os relatórios em PDF, e como visualizar, salvar e imprimir.',
    blocos: [
      {
        tipo: 'paragrafo',
        texto:
          'Todo relatório sai em PDF, com o cabeçalho da sua ótica (logo, nome, endereço e contatos) na cor de destaque que você escolheu em Configurações, e rodapé com "Página X de Y". Alguns ficam na tela de origem; os demais estão na tela Relatórios, que tem o filtro de período.'
      },
      {
        tipo: 'tabela',
        colunas: ['Relatório', 'Onde fica'],
        linhas: [
          ['OS com receita óptica', 'Botão de impressão no detalhe da OS'],
          ['Protocolo de saída', 'Botão na tela Ordens de Serviço'],
          ['Comprovante de venda e carnê de parcelas', 'Botões no detalhe da venda'],
          ['Aniversariantes', 'Botão na tela Aniversariantes'],
          ['Posição de estoque', 'Botão na tela Estoque'],
          ['Receitas e despesas, Fluxo de caixa, Lucro/Prejuízo, Inadimplência, Produtos abaixo do mínimo, Curva ABC, Vendas por vendedor, Ranking de vendedores, Comissões', 'Tela Relatórios (Administrador)']
        ]
      },
      {
        tipo: 'paragrafo',
        texto:
          'Visualizador de PDF: ao gerar um relatório ele abre numa tela própria dentro do sistema. Dali você pode dar zoom, navegar pelas páginas, clicar em "Salvar" (escolhe onde guardar o arquivo) ou em "Imprimir" (abre a janela de impressão do Windows, onde você escolhe a impressora). Nada é gravado no computador até você pedir.'
      },
      {
        tipo: 'tabela',
        colunas: ['Atalho', 'O que faz'],
        linhas: [
          ['Ctrl + S', 'Salvar o PDF'],
          ['Ctrl + P', 'Imprimir'],
          ['Ctrl + mais e Ctrl + menos', 'Aumentar e diminuir o zoom'],
          ['Ctrl + 0', 'Ajustar à largura da tela'],
          ['Esc', 'Fechar o visualizador']
        ]
      },
      {
        tipo: 'dica',
        texto: 'O PDF fica disponível por alguns minutos para salvar ou imprimir. Se o aviso disser que ele não está mais disponível, feche e gere de novo.'
      }
    ]
  },
  {
    id: 'usuarios',
    titulo: 'Usuários e permissões',
    rotas: ['/usuarios'],
    soAdmin: true,
    resumo: 'Cadastro de usuários, perfis e senhas.',
    blocos: [
      {
        tipo: 'paragrafo',
        texto: 'Clique em "Novo usuário" e preencha nome, login e o perfil (Vendedor ou Administrador). A senha pode ficar em branco: a própria pessoa escolhe a dela no primeiro acesso, na tela de login.'
      },
      {
        tipo: 'atencao',
        titulo: 'Senhas e inativação',
        texto: 'A senha que o Administrador define ou redefine é provisória: a pessoa precisa trocá-la no próximo login. Um usuário pode ser inativado (sem excluir) a qualquer momento, menos o próprio usuário logado.'
      }
    ]
  },
  {
    id: 'configuracoes',
    titulo: 'Configurações da ótica',
    rotas: ['/configuracoes'],
    soAdmin: true,
    resumo: 'Identidade visual, dados da ótica e regras de funcionamento.',
    blocos: [
      {
        tipo: 'lista',
        itens: [
          'Identidade visual: logo (PNG, JPG ou SVG, até 3 MB) e a cor de destaque, usada no sistema e no cabeçalho dos relatórios.',
          'Dados da ótica: nome fantasia, razão social, CNPJ, inscrição estadual e tema claro, escuro ou automático.',
          'Endereço e contato: aparecem no cabeçalho dos relatórios.'
        ]
      },
      { tipo: 'paragrafo', texto: 'Regras operacionais, que valem para todos:' },
      {
        tipo: 'tabela',
        colunas: ['Campo', 'Para que serve'],
        linhas: [
          ['Limite de desconto do vendedor (%)', 'Acima disso, a venda exige autorização de um Administrador.'],
          ['Comissão padrão do vendedor (%)', 'Percentual usado no cálculo da comissão de cada venda.'],
          ['Dias de garantia', 'Usado para calcular quando uma OS passa a aparecer como atrasada.'],
          ['Sessão expira após (minutos)', 'Tempo parado até pedir o login de novo.'],
          ['Prefixo da OS', 'Ex.: "2026-". Em branco, a numeração fica sem prefixo.'],
          ['Exigir autorização para vender sem saldo', 'Quando ligado, um Vendedor sozinho não conclui uma venda que deixaria o estoque negativo.']
        ]
      }
    ]
  },
  {
    id: 'backup',
    titulo: 'Backup',
    rotas: ['/backup'],
    soAdmin: true,
    resumo: 'Cópias de segurança automáticas e manuais, e a restauração.',
    blocos: [
      {
        tipo: 'paragrafo',
        texto: 'O sistema faz backup sozinho: confere a cada hora se já se passaram pelo menos 4 horas desde o último. O botão "Fazer backup agora" está sempre disponível. Cada backup é conferido (íntegro ou corrompido) e a lista mostra data, tamanho e resultado.'
      },
      {
        tipo: 'atencao',
        titulo: 'Restaurar é sério',
        texto: 'Restaurar um backup substitui todos os dados atuais pelo conteúdo dele. Antes, o sistema tira um backup de segurança do estado atual, mas ainda é uma ação de alto risco: é preciso digitar RESTAURAR para confirmar.'
      },
      {
        tipo: 'dica',
        texto: 'Guarde de vez em quando uma cópia fora do computador (pendrive ou nuvem).'
      }
    ]
  },
  {
    id: 'importar-dados',
    titulo: 'Importar dados do MD Óculos',
    rotas: ['/importar-dados'],
    soAdmin: true,
    resumo: 'Traz clientes, receitas, vendas e despesas do sistema antigo.',
    blocos: [
      {
        tipo: 'paragrafo',
        texto: 'A ferramenta conecta ao banco do sistema antigo pela rede, lê os dados e grava cópias convertidas aqui. O banco antigo nunca é alterado e a importação pode ser repetida sem duplicar o que já entrou.'
      },
      {
        tipo: 'passos',
        itens: [
          'Preencha host, porta, usuário, senha e nome do banco do sistema antigo.',
          'Clique em "Testar conexão".',
          'Clique em "Importar" e confirme.',
          'Confira o resultado e os avisos na tabela que aparece.'
        ]
      },
      {
        tipo: 'paragrafo',
        texto: 'Cada exame antigo vira uma receita óptica, uma venda e uma ordem de serviço. Os acentos quebrados do sistema antigo são corrigidos.'
      },
      {
        tipo: 'atencao',
        titulo: 'Clientes sem nome',
        texto: 'Clientes do sistema antigo sem nome e sem nenhuma receita não são importados. Se algum deles já tinha entrado numa importação anterior, a próxima importação o remove (depois de fazer um backup), desde que continue sem nome e sem nada vinculado: receita, venda, OS, conta a receber ou contato. Quem tem receita, mesmo sem nome, continua sendo importado.'
      }
    ]
  },
  {
    id: 'licenca',
    titulo: 'Licença do sistema',
    rotas: ['/licenca'],
    soAdmin: true,
    resumo: 'Ativação, vencimento e o modo somente leitura.',
    blocos: [
      {
        tipo: 'paragrafo',
        texto: 'A tela mostra a versão instalada, as notas de versão e o fingerprint, um código único do seu computador. Para ativar, informe o fingerprint a quem forneceu o sistema, cole a chave recebida no campo "Chave de licença" e clique em "Ativar". A ativação é feita totalmente offline.'
      },
      {
        tipo: 'atencao',
        titulo: 'Licença vencida não apaga nada',
        texto: 'Se a licença vencer e passar do período de carência, o sistema fica em modo somente leitura: dá para consultar tudo, tirar backup e abrir a tela de Licença, mas não para cadastrar, vender ou editar. Nenhum dado é apagado em hipótese alguma.'
      }
    ]
  },
  {
    id: 'auditoria',
    titulo: 'Auditoria',
    rotas: ['/auditoria'],
    soAdmin: true,
    resumo: 'Quem fez o quê e quando.',
    blocos: [
      {
        tipo: 'paragrafo',
        texto: 'Tela só de consulta: nem o Administrador consegue editar ou apagar. Mostra os eventos mais recentes (login, cadastros, vendas, cancelamentos, ajustes de estoque, mudanças de configuração, restauração de backup, remoção de clientes na importação), inclusive quem autorizou quando uma ação precisou de aprovação.'
      }
    ]
  },
  {
    id: 'perguntas-frequentes',
    titulo: 'Perguntas frequentes',
    rotas: ['/ajuda'],
    resumo: 'Respostas rápidas para as dúvidas mais comuns.',
    blocos: [
      { tipo: 'paragrafo', texto: 'Esqueci a senha, e agora? Só um Administrador pode redefinir a senha de outro usuário, na tela Usuários. Se for a senha do único Administrador, será preciso suporte técnico.' },
      { tipo: 'paragrafo', texto: 'Um Vendedor pode dar qualquer desconto? Não. Acima do limite de Configurações, o sistema exige a autorização de um Administrador na hora.' },
      { tipo: 'paragrafo', texto: 'Apaguei um cliente por engano, meus dados sumiram? Se o cliente já tinha venda, receita ou OS, ele nunca é apagado de verdade: só fica inativo. Peça a um Administrador para reativar.' },
      { tipo: 'paragrafo', texto: 'O sistema funciona sem internet? Sim. O uso do dia a dia e a ativação da licença não dependem de internet.' },
      { tipo: 'paragrafo', texto: 'Como sei se meus dados estão seguros? O sistema faz backup automático a cada poucas horas. Confira de vez em quando a tela de Backup e guarde uma cópia fora do computador.' },
      { tipo: 'paragrafo', texto: 'O PDF não abre ou diz que não está mais disponível. Feche o visualizador e gere o relatório de novo.' },
      { tipo: 'paragrafo', texto: 'Por que o lucro bruto não considera todas as vendas? Ele só conta itens com custo conhecido. Produtos sem custo cadastrado e itens importados do sistema antigo ficam de fora. Cadastre o custo dos produtos para a margem ficar mais fiel.' }
    ]
  }
]
