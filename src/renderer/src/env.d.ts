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
  DashboardResumo,
  PdfVisualizacao,
  BackupStatus,
  LicencaInfo,
  CaixaAberto,
  CaixaResumo,
  SistemaInfo,
  ContatoPendente,
  ClienteSemContato,
  ModelosMensagem
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
  PdfIdInput,
  DashboardQuery,
  AniversariantesQuery,
  ReceitaListByClienteInput,
  ReceitaOpticaInput,
  ReceitaOpticaAtualizarInput,
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
  ContatoRefInput,
  ContatoMarcarInput,
  AceitaContatoInput,
  ModelosMensagemInput,
  LicencaAtivarInput,
  PrimeiroAcessoInput,
  MigracaoConexaoInput,
  MigracaoImportarInput,
  PendenciasListQuery,
  PendenciasResumoQuery,
  PendenciaCorrigirDatasInput,
  EncerrarOsAntigasInput,
  PendenciaIdsInput,
  CaixaAbrirInput,
  CaixaFecharInput,
  CaixaMovimentoInput
} from '@shared/ipc'
import type { CampoDataExame, DetalhesExamePendencia, OsAntigasAbertas, OsAntigasEncerradas, MigracaoResultado, MigracaoAnalise, Pendencia, TipoPendencia } from '@shared/importacao'

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
    primeiroAcesso: (input: PrimeiroAcessoInput) => Promise<ApiResult<Sessao>>
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
    update: (input: ReceitaOpticaAtualizarInput) => Promise<ApiResult<ReceitaOptica>>
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
    get: (input: DashboardQuery) => Promise<ApiResult<DashboardResumo>>
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
    analisar: (input: MigracaoConexaoInput) => Promise<ApiResult<MigracaoAnalise>>
    importar: (input: MigracaoImportarInput) => Promise<ApiResult<MigracaoResultado>>
    pendenciasListar: (input: PendenciasListQuery) => Promise<ApiResult<Pendencia[]>>
    pendenciasResumo: (input: PendenciasResumoQuery) => Promise<ApiResult<Partial<Record<TipoPendencia, number>>>>
    pendenciaAplicar: (input: { id: number }) => Promise<ApiResult<void>>
    pendenciaResolver: (input: { id: number }) => Promise<ApiResult<void>>
    pendenciaIgnorar: (input: { id: number }) => Promise<ApiResult<void>>
    pendenciaReabrir: (input: { id: number }) => Promise<ApiResult<void>>
    pendenciaCorrigirDatas: (input: PendenciaCorrigirDatasInput) => Promise<ApiResult<{ aplicadas: number; avisos: string[]; resolvida: boolean }>>
    osAntigasAbertas: () => Promise<ApiResult<OsAntigasAbertas>>
    encerrarOsAntigas: (input: EncerrarOsAntigasInput) => Promise<ApiResult<OsAntigasEncerradas>>
    pendenciaDetalhes: (input: { id: number }) => Promise<ApiResult<DetalhesExamePendencia>>
    pendenciaDatasAtuais: (input: { id: number }) => Promise<ApiResult<Record<CampoDataExame, string | null>>>
    pendenciasAplicarVarias: (input: PendenciaIdsInput) => Promise<ApiResult<{ aplicadas: number; puladas: number }>>
    pendenciasIgnorarVarias: (input: PendenciaIdsInput) => Promise<ApiResult<{ ignoradas: number }>>
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
    ordemServico: (input: IdInput) => Promise<ApiResult<PdfVisualizacao>>
    protocoloSaida: (input: OrdensServicoQuery) => Promise<ApiResult<PdfVisualizacao>>
    comprovanteVenda: (input: IdInput) => Promise<ApiResult<PdfVisualizacao>>
    carneParcelas: (input: IdInput) => Promise<ApiResult<PdfVisualizacao>>
    aniversariantes: (input: AniversariantesQuery) => Promise<ApiResult<PdfVisualizacao>>
    receitasDespesas: (input: PeriodoQuery) => Promise<ApiResult<PdfVisualizacao>>
    fluxoCaixa: (input: PeriodoQuery) => Promise<ApiResult<PdfVisualizacao>>
    lucroPrejuizo: (input: PeriodoQuery) => Promise<ApiResult<PdfVisualizacao>>
    inadimplencia: () => Promise<ApiResult<PdfVisualizacao>>
    posicaoEstoque: (input: EstoqueListQuery) => Promise<ApiResult<PdfVisualizacao>>
    produtosAbaixoMinimo: () => Promise<ApiResult<PdfVisualizacao>>
    curvaAbc: (input: PeriodoQuery) => Promise<ApiResult<PdfVisualizacao>>
    vendasPorVendedor: (input: PeriodoQuery) => Promise<ApiResult<PdfVisualizacao>>
    rankingVendedores: (input: PeriodoQuery) => Promise<ApiResult<PdfVisualizacao>>
    comissoes: (input: PeriodoQuery) => Promise<ApiResult<PdfVisualizacao>>
    manual: () => Promise<ApiResult<PdfVisualizacao>>
  }
  pdf: {
    salvar: (input: PdfIdInput) => Promise<ApiResult<{ caminho: string } | null>>
    imprimir: (input: PdfIdInput) => Promise<ApiResult<{ impresso: boolean }>>
    descartar: (input: PdfIdInput) => Promise<ApiResult<void>>
  }
  sistema: {
    info: () => Promise<ApiResult<SistemaInfo>>
  }
  relacionamento: {
    listar: () => Promise<ApiResult<ContatoPendente[]>>
    semContato: () => Promise<ApiResult<ClienteSemContato[]>>
    abrirWhatsapp: (input: ContatoRefInput) => Promise<ApiResult<null>>
    marcarContatado: (input: ContatoMarcarInput) => Promise<ApiResult<null>>
    definirAceitaContato: (input: AceitaContatoInput) => Promise<ApiResult<null>>
    modelosObter: () => Promise<ApiResult<ModelosMensagem>>
    modelosSalvar: (input: ModelosMensagemInput) => Promise<ApiResult<null>>
  }
}

declare global {
  interface Window {
    api: Api
  }
}
