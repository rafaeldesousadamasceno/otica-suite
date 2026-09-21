import { contextBridge, ipcRenderer } from 'electron'
// Importa das constantes de canal puras, NUNCA de '@shared/ipc' (que
// arrasta o zod junto) - o preload sandboxado so consegue `require()` uns
// poucos modulos internos do Electron. Ver o comentario em ipcChannels.ts.
import { IPC } from '@shared/ipcChannels'

/**
 * Unica porta entre o renderer (sem Node, sem SQL) e o processo main.
 * Cada metodo aqui e so um `invoke` de um canal fixo - nenhuma logica,
 * nenhum acesso a Node alem do estritamente necessario para repassar a
 * chamada. E por isso que a checagem de permissao no main (nao aqui) e o
 * que realmente protege o sistema (PRD secao 7.1/9.2).
 */
const api = {
  bootstrap: {
    get: () => ipcRenderer.invoke(IPC.bootstrap.get),
    completeSetup: (input: unknown) => ipcRenderer.invoke(IPC.bootstrap.completeSetup, input)
  },
  auth: {
    login: (input: unknown) => ipcRenderer.invoke(IPC.auth.login, input),
    logout: () => ipcRenderer.invoke(IPC.auth.logout),
    getSession: () => ipcRenderer.invoke(IPC.auth.getSession),
    trocarSenha: (input: unknown) => ipcRenderer.invoke(IPC.auth.trocarSenha, input),
    primeiroAcesso: (input: unknown) => ipcRenderer.invoke(IPC.auth.primeiroAcesso, input),
    autorizarAcao: (input: unknown) => ipcRenderer.invoke(IPC.auth.autorizarAcao, input)
  },
  empresa: {
    get: () => ipcRenderer.invoke(IPC.empresa.get),
    update: (input: unknown) => ipcRenderer.invoke(IPC.empresa.update, input),
    uploadLogo: (input: unknown) => ipcRenderer.invoke(IPC.empresa.uploadLogo, input),
    removerLogo: () => ipcRenderer.invoke(IPC.empresa.removerLogo)
  },
  usuarios: {
    list: () => ipcRenderer.invoke(IPC.usuarios.list),
    create: (input: unknown) => ipcRenderer.invoke(IPC.usuarios.create, input),
    setAtivo: (input: unknown) => ipcRenderer.invoke(IPC.usuarios.setAtivo, input),
    resetSenha: (input: unknown) => ipcRenderer.invoke(IPC.usuarios.resetSenha, input)
  },
  clientes: {
    list: (input: unknown) => ipcRenderer.invoke(IPC.clientes.list, input),
    get: (input: unknown) => ipcRenderer.invoke(IPC.clientes.get, input),
    create: (input: unknown) => ipcRenderer.invoke(IPC.clientes.create, input),
    update: (input: unknown) => ipcRenderer.invoke(IPC.clientes.update, input),
    inativar: (input: unknown) => ipcRenderer.invoke(IPC.clientes.inativar, input),
    aniversariantes: (input: unknown) => ipcRenderer.invoke(IPC.clientes.aniversariantes, input)
  },
  receitas: {
    listByCliente: (input: unknown) => ipcRenderer.invoke(IPC.receitas.listByCliente, input),
    create: (input: unknown) => ipcRenderer.invoke(IPC.receitas.create, input)
  },
  ordensServico: {
    list: (input: unknown) => ipcRenderer.invoke(IPC.ordensServico.list, input),
    get: (input: unknown) => ipcRenderer.invoke(IPC.ordensServico.get, input),
    listByCliente: (input: unknown) => ipcRenderer.invoke(IPC.ordensServico.listByCliente, input),
    create: (input: unknown) => ipcRenderer.invoke(IPC.ordensServico.create, input),
    avancarSituacao: (input: unknown) => ipcRenderer.invoke(IPC.ordensServico.avancarSituacao, input),
    cancelar: (input: unknown) => ipcRenderer.invoke(IPC.ordensServico.cancelar, input),
    atualizarDatas: (input: unknown) => ipcRenderer.invoke(IPC.ordensServico.atualizarDatas, input),
    protocoloSaida: (input: unknown) => ipcRenderer.invoke(IPC.ordensServico.protocoloSaida, input)
  },
  produtos: {
    list: (input: unknown) => ipcRenderer.invoke(IPC.produtos.list, input),
    get: (input: unknown) => ipcRenderer.invoke(IPC.produtos.get, input),
    create: (input: unknown) => ipcRenderer.invoke(IPC.produtos.create, input),
    update: (input: unknown) => ipcRenderer.invoke(IPC.produtos.update, input),
    setAtivo: (input: unknown) => ipcRenderer.invoke(IPC.produtos.setAtivo, input)
  },
  vendas: {
    list: (input: unknown) => ipcRenderer.invoke(IPC.vendas.list, input),
    get: (input: unknown) => ipcRenderer.invoke(IPC.vendas.get, input),
    create: (input: unknown) => ipcRenderer.invoke(IPC.vendas.create, input),
    listByCliente: (input: unknown) => ipcRenderer.invoke(IPC.vendas.listByCliente, input),
    cancelar: (input: unknown) => ipcRenderer.invoke(IPC.vendas.cancelar, input)
  },
  contasReceber: {
    list: (input: unknown) => ipcRenderer.invoke(IPC.contasReceber.list, input),
    listByVenda: (input: unknown) => ipcRenderer.invoke(IPC.contasReceber.listByVenda, input),
    baixar: (input: unknown) => ipcRenderer.invoke(IPC.contasReceber.baixar, input)
  },
  listasValor: {
    listByTipo: (input: unknown) => ipcRenderer.invoke(IPC.listasValor.listByTipo, input)
  },
  auditoria: {
    list: () => ipcRenderer.invoke(IPC.auditoria.list)
  },
  fornecedores: {
    list: (input: unknown) => ipcRenderer.invoke(IPC.fornecedores.list, input),
    get: (input: unknown) => ipcRenderer.invoke(IPC.fornecedores.get, input),
    create: (input: unknown) => ipcRenderer.invoke(IPC.fornecedores.create, input),
    update: (input: unknown) => ipcRenderer.invoke(IPC.fornecedores.update, input),
    setAtivo: (input: unknown) => ipcRenderer.invoke(IPC.fornecedores.setAtivo, input)
  },
  compras: {
    list: (input: unknown) => ipcRenderer.invoke(IPC.compras.list, input),
    get: (input: unknown) => ipcRenderer.invoke(IPC.compras.get, input),
    create: (input: unknown) => ipcRenderer.invoke(IPC.compras.create, input),
    confirmarEntrada: (input: unknown) => ipcRenderer.invoke(IPC.compras.confirmarEntrada, input),
    cancelar: (input: unknown) => ipcRenderer.invoke(IPC.compras.cancelar, input)
  },
  estoque: {
    list: (input: unknown) => ipcRenderer.invoke(IPC.estoque.list, input),
    ajustar: (input: unknown) => ipcRenderer.invoke(IPC.estoque.ajustar, input)
  },
  contasPagar: {
    list: (input: unknown) => ipcRenderer.invoke(IPC.contasPagar.list, input),
    criar: (input: unknown) => ipcRenderer.invoke(IPC.contasPagar.criar, input),
    pagar: (input: unknown) => ipcRenderer.invoke(IPC.contasPagar.pagar, input)
  },
  configuracoes: {
    getOperacional: () => ipcRenderer.invoke(IPC.configuracoes.getOperacional),
    updateOperacional: (input: unknown) => ipcRenderer.invoke(IPC.configuracoes.updateOperacional, input)
  },
  financeiro: {
    fluxoCaixa: (input: unknown) => ipcRenderer.invoke(IPC.financeiro.fluxoCaixa, input),
    lucroPrejuizo: (input: unknown) => ipcRenderer.invoke(IPC.financeiro.lucroPrejuizo, input)
  },
  dashboard: {
    get: () => ipcRenderer.invoke(IPC.dashboard.get)
  },
  backup: {
    status: () => ipcRenderer.invoke(IPC.backup.status),
    criar: () => ipcRenderer.invoke(IPC.backup.criar),
    restaurar: (input: unknown) => ipcRenderer.invoke(IPC.backup.restaurar, input)
  },
  licenca: {
    status: () => ipcRenderer.invoke(IPC.licenca.status),
    ativar: (input: unknown) => ipcRenderer.invoke(IPC.licenca.ativar, input)
  },
  migracao: {
    testarConexao: (input: unknown) => ipcRenderer.invoke(IPC.migracao.testarConexao, input),
    importar: (input: unknown) => ipcRenderer.invoke(IPC.migracao.importar, input)
  },
  caixa: {
    atual: () => ipcRenderer.invoke(IPC.caixa.atual),
    listar: () => ipcRenderer.invoke(IPC.caixa.listar),
    abrir: (input: unknown) => ipcRenderer.invoke(IPC.caixa.abrir, input),
    fechar: (input: unknown) => ipcRenderer.invoke(IPC.caixa.fechar, input),
    sangria: (input: unknown) => ipcRenderer.invoke(IPC.caixa.sangria, input),
    suprimento: (input: unknown) => ipcRenderer.invoke(IPC.caixa.suprimento, input)
  },
  relatorios: {
    ordemServico: (input: unknown) => ipcRenderer.invoke(IPC.relatorios.ordemServico, input),
    protocoloSaida: (input: unknown) => ipcRenderer.invoke(IPC.relatorios.protocoloSaida, input),
    comprovanteVenda: (input: unknown) => ipcRenderer.invoke(IPC.relatorios.comprovanteVenda, input),
    carneParcelas: (input: unknown) => ipcRenderer.invoke(IPC.relatorios.carneParcelas, input),
    aniversariantes: (input: unknown) => ipcRenderer.invoke(IPC.relatorios.aniversariantes, input),
    receitasDespesas: (input: unknown) => ipcRenderer.invoke(IPC.relatorios.receitasDespesas, input),
    fluxoCaixa: (input: unknown) => ipcRenderer.invoke(IPC.relatorios.fluxoCaixa, input),
    lucroPrejuizo: (input: unknown) => ipcRenderer.invoke(IPC.relatorios.lucroPrejuizo, input),
    inadimplencia: () => ipcRenderer.invoke(IPC.relatorios.inadimplencia),
    posicaoEstoque: (input: unknown) => ipcRenderer.invoke(IPC.relatorios.posicaoEstoque, input),
    produtosAbaixoMinimo: () => ipcRenderer.invoke(IPC.relatorios.produtosAbaixoMinimo),
    curvaAbc: (input: unknown) => ipcRenderer.invoke(IPC.relatorios.curvaAbc, input),
    vendasPorVendedor: (input: unknown) => ipcRenderer.invoke(IPC.relatorios.vendasPorVendedor, input),
    rankingVendedores: (input: unknown) => ipcRenderer.invoke(IPC.relatorios.rankingVendedores, input),
    comissoes: (input: unknown) => ipcRenderer.invoke(IPC.relatorios.comissoes, input)
  },
  sistema: {
    info: () => ipcRenderer.invoke(IPC.sistema.info)
  },
  relacionamento: {
    listar: () => ipcRenderer.invoke(IPC.relacionamento.listar),
    semContato: () => ipcRenderer.invoke(IPC.relacionamento.semContato),
    abrirWhatsapp: (input: unknown) => ipcRenderer.invoke(IPC.relacionamento.abrirWhatsapp, input),
    marcarContatado: (input: unknown) => ipcRenderer.invoke(IPC.relacionamento.marcarContatado, input),
    definirAceitaContato: (input: unknown) => ipcRenderer.invoke(IPC.relacionamento.definirAceitaContato, input),
    modelosObter: () => ipcRenderer.invoke(IPC.relacionamento.modelosObter),
    modelosSalvar: (input: unknown) => ipcRenderer.invoke(IPC.relacionamento.modelosSalvar, input)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
