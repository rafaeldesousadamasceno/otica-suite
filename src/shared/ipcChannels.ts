/**
 * Nomes dos canais de IPC - SEM nenhuma dependencia externa (nada de zod
 * aqui). Isso e proposital: o preload roda em contexto sandboxado, que so
 * consegue `require()` uns poucos modulos internos do Electron - qualquer
 * pacote do node_modules importado por engano (mesmo que so pelo tipo)
 * quebra o preload inteiro em silencio ("module not found: zod").
 *
 * `shared/ipc.ts` reexporta este objeto para quem nao tem essa restricao
 * (processo main, renderer) continuar importando de um lugar so.
 */
export const IPC = {
  bootstrap: {
    get: 'app:bootstrap:get',
    completeSetup: 'app:bootstrap:completeSetup'
  },
  auth: {
    login: 'auth:login',
    logout: 'auth:logout',
    getSession: 'auth:getSession',
    trocarSenha: 'auth:trocarSenha',
    primeiroAcesso: 'auth:primeiroAcesso',
    autorizarAcao: 'auth:autorizarAcao'
  },
  empresa: {
    get: 'empresa:get',
    update: 'empresa:update',
    uploadLogo: 'empresa:uploadLogo',
    removerLogo: 'empresa:removerLogo'
  },
  usuarios: {
    list: 'usuarios:list',
    create: 'usuarios:create',
    setAtivo: 'usuarios:setAtivo',
    resetSenha: 'usuarios:resetSenha'
  },
  clientes: {
    list: 'clientes:list',
    get: 'clientes:get',
    create: 'clientes:create',
    update: 'clientes:update',
    inativar: 'clientes:inativar',
    aniversariantes: 'clientes:aniversariantes'
  },
  receitas: {
    listByCliente: 'receitas:listByCliente',
    create: 'receitas:create'
  },
  ordensServico: {
    list: 'ordensServico:list',
    get: 'ordensServico:get',
    listByCliente: 'ordensServico:listByCliente',
    create: 'ordensServico:create',
    avancarSituacao: 'ordensServico:avancarSituacao',
    cancelar: 'ordensServico:cancelar',
    atualizarDatas: 'ordensServico:atualizarDatas',
    protocoloSaida: 'ordensServico:protocoloSaida'
  },
  produtos: {
    list: 'produtos:list',
    get: 'produtos:get',
    create: 'produtos:create',
    update: 'produtos:update',
    setAtivo: 'produtos:setAtivo'
  },
  vendas: {
    list: 'vendas:list',
    get: 'vendas:get',
    create: 'vendas:create',
    listByCliente: 'vendas:listByCliente',
    cancelar: 'vendas:cancelar'
  },
  contasReceber: {
    list: 'contasReceber:list',
    listByVenda: 'contasReceber:listByVenda',
    baixar: 'contasReceber:baixar'
  },
  listasValor: {
    listByTipo: 'listasValor:listByTipo'
  },
  auditoria: {
    list: 'auditoria:list'
  },
  fornecedores: {
    list: 'fornecedores:list',
    get: 'fornecedores:get',
    create: 'fornecedores:create',
    update: 'fornecedores:update',
    setAtivo: 'fornecedores:setAtivo'
  },
  compras: {
    list: 'compras:list',
    get: 'compras:get',
    create: 'compras:create',
    confirmarEntrada: 'compras:confirmarEntrada',
    cancelar: 'compras:cancelar'
  },
  estoque: {
    list: 'estoque:list',
    ajustar: 'estoque:ajustar'
  },
  contasPagar: {
    list: 'contasPagar:list',
    criar: 'contasPagar:criar',
    pagar: 'contasPagar:pagar'
  },
  configuracoes: {
    getOperacional: 'configuracoes:getOperacional',
    updateOperacional: 'configuracoes:updateOperacional'
  },
  financeiro: {
    fluxoCaixa: 'financeiro:fluxoCaixa',
    lucroPrejuizo: 'financeiro:lucroPrejuizo'
  },
  dashboard: {
    get: 'dashboard:get'
  },
  backup: {
    status: 'backup:status',
    criar: 'backup:criar',
    restaurar: 'backup:restaurar'
  },
  licenca: {
    status: 'licenca:status',
    ativar: 'licenca:ativar'
  },
  migracao: {
    testarConexao: 'migracao:testarConexao',
    importar: 'migracao:importar'
  },
  caixa: {
    atual: 'caixa:atual',
    listar: 'caixa:listar',
    abrir: 'caixa:abrir',
    fechar: 'caixa:fechar',
    sangria: 'caixa:sangria',
    suprimento: 'caixa:suprimento'
  },
  relatorios: {
    ordemServico: 'relatorios:ordemServico',
    protocoloSaida: 'relatorios:protocoloSaida',
    comprovanteVenda: 'relatorios:comprovanteVenda',
    carneParcelas: 'relatorios:carneParcelas',
    aniversariantes: 'relatorios:aniversariantes',
    receitasDespesas: 'relatorios:receitasDespesas',
    fluxoCaixa: 'relatorios:fluxoCaixa',
    lucroPrejuizo: 'relatorios:lucroPrejuizo',
    inadimplencia: 'relatorios:inadimplencia',
    posicaoEstoque: 'relatorios:posicaoEstoque',
    produtosAbaixoMinimo: 'relatorios:produtosAbaixoMinimo',
    curvaAbc: 'relatorios:curvaAbc',
    vendasPorVendedor: 'relatorios:vendasPorVendedor',
    rankingVendedores: 'relatorios:rankingVendedores',
    comissoes: 'relatorios:comissoes'
  },
  sistema: {
    info: 'sistema:info'
  },
  relacionamento: {
    listar: 'relacionamento:listar',
    semContato: 'relacionamento:semContato',
    abrirWhatsapp: 'relacionamento:abrirWhatsapp',
    marcarContatado: 'relacionamento:marcarContatado',
    definirAceitaContato: 'relacionamento:definirAceitaContato',
    modelosObter: 'relacionamento:modelosObter',
    modelosSalvar: 'relacionamento:modelosSalvar'
  }
} as const
