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
    autorizarAcao: 'auth:autorizarAcao',
    recuperacaoPedido: 'auth:recuperacaoPedido',
    recuperacaoVerificar: 'auth:recuperacaoVerificar',
    recuperacaoRedefinir: 'auth:recuperacaoRedefinir'
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
    create: 'receitas:create',
    update: 'receitas:update',
    excluir: 'receitas:excluir'
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
    cancelar: 'vendas:cancelar',
    exclusaoPrevia: 'vendas:exclusaoPrevia',
    excluir: 'vendas:excluir'
  },
  contasReceber: {
    list: 'contasReceber:list',
    listByVenda: 'contasReceber:listByVenda',
    baixar: 'contasReceber:baixar'
  },
  listasValor: {
    listByTipo: 'listasValor:listByTipo'
  },
  unidadesMedida: {
    list: 'unidadesMedida:list',
    create: 'unidadesMedida:create',
    update: 'unidadesMedida:update',
    setAtivo: 'unidadesMedida:setAtivo'
  },
  auditoria: {
    list: 'auditoria:list'
  },
  formasPagamento: {
    list: 'formasPagamento:list',
    create: 'formasPagamento:create',
    update: 'formasPagamento:update',
    setAtivo: 'formasPagamento:setAtivo',
    excluir: 'formasPagamento:excluir'
  },
  bandeiras: {
    list: 'bandeiras:list',
    create: 'bandeiras:create',
    update: 'bandeiras:update',
    setAtivo: 'bandeiras:setAtivo',
    excluir: 'bandeiras:excluir'
  },
  laboratorios: {
    list: 'laboratorios:list',
    create: 'laboratorios:create',
    update: 'laboratorios:update',
    setAtivo: 'laboratorios:setAtivo',
    excluir: 'laboratorios:excluir'
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
    pagar: 'contasPagar:pagar',
    editar: 'contasPagar:editar',
    excluir: 'contasPagar:excluir',
    recorrencias: 'contasPagar:recorrencias',
    reajustarRecorrencia: 'contasPagar:reajustarRecorrencia',
    encerrarRecorrencia: 'contasPagar:encerrarRecorrencia'
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
    analisar: 'migracao:analisar',
    importar: 'migracao:importar',
    pendenciasListar: 'migracao:pendenciasListar',
    pendenciasResumo: 'migracao:pendenciasResumo',
    pendenciaAplicar: 'migracao:pendenciaAplicar',
    pendenciaResolver: 'migracao:pendenciaResolver',
    pendenciaIgnorar: 'migracao:pendenciaIgnorar',
    pendenciaReabrir: 'migracao:pendenciaReabrir',
    pendenciaCorrigirDatas: 'migracao:pendenciaCorrigirDatas',
    osAntigasAbertas: 'migracao:osAntigasAbertas',
    encerrarOsAntigas: 'migracao:encerrarOsAntigas',
    pendenciaDatasAtuais: 'migracao:pendenciaDatasAtuais',
    pendenciaDetalhes: 'migracao:pendenciaDetalhes',
    pendenciasAplicarVarias: 'migracao:pendenciasAplicarVarias',
    pendenciasIgnorarVarias: 'migracao:pendenciasIgnorarVarias'
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
    prescricao: 'relatorios:prescricao',
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
    comissoes: 'relatorios:comissoes',
    manual: 'relatorios:manual'
  },
  /** Visualizador de PDF: o PDF gerado por `relatorios:*` fica no main ate ser salvo, impresso ou descartado. */
  pdf: {
    salvar: 'pdf:salvar',
    imprimir: 'pdf:imprimir',
    descartar: 'pdf:descartar'
  },
  sistema: {
    info: 'sistema:info'
  },
  relacionamento: {
    listar: 'relacionamento:listar',
    semContato: 'relacionamento:semContato',
    abrirWhatsapp: 'relacionamento:abrirWhatsapp',
    abrirWhatsappAniversario: 'relacionamento:abrirWhatsappAniversario',
    marcarContatado: 'relacionamento:marcarContatado',
    contatados: 'relacionamento:contatados',
    desfazerContato: 'relacionamento:desfazerContato',
    definirAceitaContato: 'relacionamento:definirAceitaContato',
    resultados: 'relacionamento:resultados',
    modelosObter: 'relacionamento:modelosObter',
    modelosSalvar: 'relacionamento:modelosSalvar'
  }
} as const
