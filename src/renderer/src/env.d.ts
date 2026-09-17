/// <reference types="vite/client" />

import type {
  ApiResult,
  BootstrapState,
  Sessao,
  Empresa,
  Usuario,
  Cliente,
  ClienteResumo,
  ReceitaOptica,
  OrdemServico,
  Produto,
  VendaResumo,
  VendaDetalhada,
  ContaReceber,
  ListaValorItem,
  AuditoriaEntrada,
  Fornecedor,
  CompraResumo,
  CompraDetalhada,
  EstoqueItem,
  ContaPagar,
  ConfiguracaoOperacional,
  FluxoCaixaResultado,
  LucroPrejuizoResultado,
  DashboardData,
  BackupStatus,
  LicencaInfo,
  MigracaoResultado,
  CaixaAberto,
  CaixaResumo,
  SistemaInfo
} from '@shared/types'
import type {
  SetupInput,
  LoginInput,
  TrocarSenhaInput,
  AutorizarAcaoInput,
  EmpresaUpdateInput,
  EmpresaLogoUploadInput,
  UsuarioCreateInput,
  UsuarioSetAtivoInput,
  UsuarioResetSenhaInput,
  ClientesListQuery,
  ClienteInput,
  ClienteUpdateInput,
  IdInput,
  AniversariantesQuery,
  ReceitaListByClienteInput,
  ReceitaOpticaInput,
  ListaValorTipoInput,
  OrdemServicoCreateInput,
  OrdemServicoAvancarInput,
  OrdemServicoCancelarInput,
  OrdemServicoAtualizarDatasInput,
  OrdensServicoQuery,
  ProdutoInput,
  ProdutoUpdateInput,
  ProdutoSetAtivoInput,
  ProdutosListQuery,
  VendaCreateInput,
  VendaCancelarInput,
  VendasListQuery,
  ContasReceberListQuery,
  ContaReceberBaixarInput,
  FornecedorInput,
  FornecedorUpdateInput,
  FornecedorSetAtivoInput,
  FornecedoresListQuery,
  CompraCreateInput,
  CompraConfirmarEntradaInput,
  ComprasListQuery,
  EstoqueListQuery,
  EstoqueAjustarInput,
  ContaPagarCriarInput,
  ContaPagarPagarInput,
  ContasPagarListQuery,
  ConfiguracaoOperacionalInput,
  PeriodoQuery,
  BackupRestaurarInput,
  LicencaAtivarInput,
  MigracaoConexaoInput,
  CaixaAbrirInput,
  CaixaFecharInput,
  CaixaMovimentoInput
} from '@shared/ipc'

/**
 * Espelha exatamente a superficie exposta em src/preload/index.ts.
 * E um arquivo de tipos apenas (nao importa o preload em runtime) porque
 * o projeto do renderer e compilado isoladamente do processo main/preload
 * (electron-vite usa tres tsconfigs separados - PRD secao 9.4).
 */
interface Api {
  bootstrap: {
    get: () => Promise<ApiResult<BootstrapState>>
    completeSetup: (input: SetupInput) => Promise<ApiResult<void>>
  }
  auth: {
    login: (input: LoginInput) => Promise<ApiResult<Sessao>>
    logout: () => Promise<ApiResult<void>>
    getSession: () => Promise<ApiResult<Sessao | null>>
    trocarSenha: (input: TrocarSenhaInput) => Promise<ApiResult<void>>
    autorizarAcao: (input: AutorizarAcaoInput) => Promise<ApiResult<Usuario>>
  }
  empresa: {
    get: () => Promise<ApiResult<Empresa>>
    update: (input: EmpresaUpdateInput) => Promise<ApiResult<Empresa>>
    uploadLogo: (input: EmpresaLogoUploadInput) => Promise<ApiResult<Empresa>>
    removerLogo: () => Promise<ApiResult<Empresa>>
  }
  usuarios: {
    list: () => Promise<ApiResult<Usuario[]>>
    create: (input: UsuarioCreateInput) => Promise<ApiResult<Usuario>>
    setAtivo: (input: UsuarioSetAtivoInput) => Promise<ApiResult<void>>
    resetSenha: (input: UsuarioResetSenhaInput) => Promise<ApiResult<void>>
  }
  clientes: {
    list: (input: ClientesListQuery) => Promise<ApiResult<ClienteResumo[]>>
    get: (input: IdInput) => Promise<ApiResult<Cliente>>
    create: (input: ClienteInput) => Promise<ApiResult<Cliente>>
    update: (input: ClienteUpdateInput) => Promise<ApiResult<Cliente>>
    inativar: (input: IdInput) => Promise<ApiResult<{ modo: 'excluido' | 'inativado' }>>
    aniversariantes: (input: AniversariantesQuery) => Promise<ApiResult<ClienteResumo[]>>
  }
  receitas: {
    listByCliente: (input: ReceitaListByClienteInput) => Promise<ApiResult<ReceitaOptica[]>>
    create: (input: ReceitaOpticaInput) => Promise<ApiResult<ReceitaOptica>>
  }
  ordensServico: {
    list: (input: OrdensServicoQuery) => Promise<ApiResult<OrdemServico[]>>
    get: (input: IdInput) => Promise<ApiResult<OrdemServico>>
    listByCliente: (input: ReceitaListByClienteInput) => Promise<ApiResult<OrdemServico[]>>
    create: (input: OrdemServicoCreateInput) => Promise<ApiResult<OrdemServico>>
    avancarSituacao: (input: OrdemServicoAvancarInput) => Promise<ApiResult<OrdemServico>>
    cancelar: (input: OrdemServicoCancelarInput) => Promise<ApiResult<OrdemServico>>
    atualizarDatas: (input: OrdemServicoAtualizarDatasInput) => Promise<ApiResult<OrdemServico>>
    protocoloSaida: (input: OrdensServicoQuery) => Promise<ApiResult<OrdemServico[]>>
  }
  produtos: {
    list: (input: ProdutosListQuery) => Promise<ApiResult<Produto[]>>
    get: (input: IdInput) => Promise<ApiResult<Produto>>
    create: (input: ProdutoInput) => Promise<ApiResult<Produto>>
    update: (input: ProdutoUpdateInput) => Promise<ApiResult<Produto>>
    setAtivo: (input: ProdutoSetAtivoInput) => Promise<ApiResult<void>>
  }
  vendas: {
    list: (input: VendasListQuery) => Promise<ApiResult<VendaResumo[]>>
    get: (input: IdInput) => Promise<ApiResult<VendaDetalhada>>
    create: (input: VendaCreateInput) => Promise<ApiResult<VendaDetalhada>>
    listByCliente: (input: ReceitaListByClienteInput) => Promise<ApiResult<VendaResumo[]>>
    cancelar: (input: VendaCancelarInput) => Promise<ApiResult<VendaDetalhada>>
  }
  contasReceber: {
    list: (input: ContasReceberListQuery) => Promise<ApiResult<ContaReceber[]>>
    listByVenda: (input: IdInput) => Promise<ApiResult<ContaReceber[]>>
    baixar: (input: ContaReceberBaixarInput) => Promise<ApiResult<ContaReceber>>
  }
  listasValor: {
    listByTipo: (input: ListaValorTipoInput) => Promise<ApiResult<ListaValorItem[]>>
  }
  auditoria: {
    list: () => Promise<ApiResult<AuditoriaEntrada[]>>
  }
  fornecedores: {
    list: (input: FornecedoresListQuery) => Promise<ApiResult<Fornecedor[]>>
    get: (input: IdInput) => Promise<ApiResult<Fornecedor>>
    create: (input: FornecedorInput) => Promise<ApiResult<Fornecedor>>
    update: (input: FornecedorUpdateInput) => Promise<ApiResult<Fornecedor>>
    setAtivo: (input: FornecedorSetAtivoInput) => Promise<ApiResult<void>>
  }
  compras: {
    list: (input: ComprasListQuery) => Promise<ApiResult<CompraResumo[]>>
    get: (input: IdInput) => Promise<ApiResult<CompraDetalhada>>
    create: (input: CompraCreateInput) => Promise<ApiResult<CompraDetalhada>>
    confirmarEntrada: (input: CompraConfirmarEntradaInput) => Promise<ApiResult<CompraDetalhada>>
    cancelar: (input: IdInput) => Promise<ApiResult<CompraDetalhada>>
  }
  estoque: {
    list: (input: EstoqueListQuery) => Promise<ApiResult<EstoqueItem[]>>
    ajustar: (input: EstoqueAjustarInput) => Promise<ApiResult<EstoqueItem>>
  }
  contasPagar: {
    list: (input: ContasPagarListQuery) => Promise<ApiResult<ContaPagar[]>>
    criar: (input: ContaPagarCriarInput) => Promise<ApiResult<ContaPagar>>
    pagar: (input: ContaPagarPagarInput) => Promise<ApiResult<ContaPagar>>
  }
  configuracoes: {
    getOperacional: () => Promise<ApiResult<ConfiguracaoOperacional>>
    updateOperacional: (input: ConfiguracaoOperacionalInput) => Promise<ApiResult<ConfiguracaoOperacional>>
  }
  financeiro: {
    fluxoCaixa: (input: PeriodoQuery) => Promise<ApiResult<FluxoCaixaResultado>>
    lucroPrejuizo: (input: PeriodoQuery) => Promise<ApiResult<LucroPrejuizoResultado>>
  }
  dashboard: {
    get: () => Promise<ApiResult<DashboardData>>
  }
  backup: {
    status: () => Promise<ApiResult<BackupStatus>>
    criar: () => Promise<ApiResult<BackupStatus>>
    restaurar: (input: BackupRestaurarInput) => Promise<ApiResult<void>>
  }
  licenca: {
    status: () => Promise<ApiResult<LicencaInfo>>
    ativar: (input: LicencaAtivarInput) => Promise<ApiResult<LicencaInfo>>
  }
  migracao: {
    testarConexao: (input: MigracaoConexaoInput) => Promise<ApiResult<void>>
    importar: (input: MigracaoConexaoInput) => Promise<ApiResult<MigracaoResultado>>
  }
  caixa: {
    atual: () => Promise<ApiResult<CaixaAberto | null>>
    listar: () => Promise<ApiResult<CaixaResumo[]>>
    abrir: (input: CaixaAbrirInput) => Promise<ApiResult<CaixaAberto>>
    fechar: (input: CaixaFecharInput) => Promise<ApiResult<CaixaResumo>>
    sangria: (input: CaixaMovimentoInput) => Promise<ApiResult<CaixaAberto>>
    suprimento: (input: CaixaMovimentoInput) => Promise<ApiResult<CaixaAberto>>
  }
  relatorios: {
    ordemServico: (input: IdInput) => Promise<ApiResult<{ caminho: string } | null>>
    protocoloSaida: (input: OrdensServicoQuery) => Promise<ApiResult<{ caminho: string } | null>>
    comprovanteVenda: (input: IdInput) => Promise<ApiResult<{ caminho: string } | null>>
    carneParcelas: (input: IdInput) => Promise<ApiResult<{ caminho: string } | null>>
    aniversariantes: (input: AniversariantesQuery) => Promise<ApiResult<{ caminho: string } | null>>
    receitasDespesas: (input: PeriodoQuery) => Promise<ApiResult<{ caminho: string } | null>>
    fluxoCaixa: (input: PeriodoQuery) => Promise<ApiResult<{ caminho: string } | null>>
    lucroPrejuizo: (input: PeriodoQuery) => Promise<ApiResult<{ caminho: string } | null>>
    inadimplencia: () => Promise<ApiResult<{ caminho: string } | null>>
    posicaoEstoque: (input: EstoqueListQuery) => Promise<ApiResult<{ caminho: string } | null>>
    produtosAbaixoMinimo: () => Promise<ApiResult<{ caminho: string } | null>>
    curvaAbc: (input: PeriodoQuery) => Promise<ApiResult<{ caminho: string } | null>>
    vendasPorVendedor: (input: PeriodoQuery) => Promise<ApiResult<{ caminho: string } | null>>
    rankingVendedores: (input: PeriodoQuery) => Promise<ApiResult<{ caminho: string } | null>>
    comissoes: (input: PeriodoQuery) => Promise<ApiResult<{ caminho: string } | null>>
  }
  sistema: {
    info: () => Promise<ApiResult<SistemaInfo>>
  }
}

declare global {
  interface Window {
    api: Api
  }
}
