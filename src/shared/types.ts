// Tipos de dominio compartilhados entre main e renderer. O renderer nunca
// importa nada do processo main - so estes tipos e o contrato de IPC.

export type Perfil = 'admin' | 'vendedor'

export interface Usuario {
  id: number
  nome: string
  login: string
  perfil: Perfil
  ativo: boolean
  deveTrocarSenha: boolean
  /** Cadastrado pelo admin, ainda sem senha: escolhe a propria no primeiro acesso, na tela de login. */
  aguardandoPrimeiroAcesso: boolean
  ultimoAcesso: string | null
  criadoEm: string
}

/** Sessao ativa no processo main. Nunca inclui o hash da senha. */
export interface Sessao {
  usuario: Usuario
}

/** RF-01: formato do quadro da logo, aplicado onde ela aparece (sidebar, login, impressos). */
export type LogoFormato = 'circulo' | 'quadrado_arredondado' | 'quadrado'

export interface Empresa {
  nomeFantasia: string
  razaoSocial: string | null
  cnpj: string | null
  ie: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
  telefone: string | null
  whatsapp: string | null
  email: string | null
  site: string | null
  /**
   * Apesar do nome, isto NUNCA e um caminho de arquivo cru: e null (sem
   * logo) ou uma `data:` URI pronta para um `<img src>`. O main converte
   * antes de devolver pelo IPC - ver empresaService.paraExibicao().
   */
  logoPath: string | null
  logoFormato: LogoFormato
  corDestaque: string
  tema: 'claro' | 'escuro' | 'sistema'
}

export interface Cliente {
  id: number
  nome: string
  dataNasc: string | null
  cpf: string | null
  rg: string | null
  celular: string | null
  telefone: string | null
  email: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
  profissao: string | null
  indicadoPor: string | null
  observacao: string | null
  ativo: boolean
  criadoEm: string
}

export interface ClienteResumo {
  id: number
  nome: string
  celular: string | null
  cpf: string | null
  dataNasc: string | null
}

export interface ReceitaOptica {
  id: number
  clienteId: number
  profissionalId: number | null
  profissionalNome: string | null
  dataExame: string
  longeOdEsf: number | null
  longeOdCil: number | null
  longeOdEixo: number | null
  longeOdDnp: number | null
  longeOeEsf: number | null
  longeOeCil: number | null
  longeOeEixo: number | null
  longeOeDnp: number | null
  pertoOdEsf: number | null
  pertoOdCil: number | null
  pertoOdEixo: number | null
  pertoOdDnp: number | null
  pertoOeEsf: number | null
  pertoOeCil: number | null
  pertoOeEixo: number | null
  pertoOeDnp: number | null
  adicao: number | null
  altura: number | null
  tipoLente: string | null
  tratamentos: string | null
  armacao: string | null
  observacao: string | null
  versao: number
  criadoEm: string
}

/**
 * Ciclo de vida da OS (RN-04). A ordem do array E a ordem de avanco -
 * `situacoesValidasApos()` deriva as transicoes permitidas disso, entao
 * inserir um estado novo no meio ja passa a valer em toda a aplicacao.
 */
export const FLUXO_SITUACAO_OS = ['EM ABERTO', 'LABORATÓRIO', 'CHEGOU', 'ENTREGUE'] as const
export type SituacaoOS = (typeof FLUXO_SITUACAO_OS)[number] | 'CANCELADA'

export interface OrdemServico {
  id: number
  numero: string
  clienteId: number
  clienteNome: string
  clienteCelular: string | null
  receitaOpticaId: number | null
  receitaTipoLente: string | null
  laboratorio: string | null
  situacao: SituacaoOS
  dataAbertura: string
  dataEnvio: string | null
  dataPrevisao: string | null
  dataChegada: string | null
  dataEntrega: string | null
  observacao: string | null
  /** true quando passou da previsao e ainda nao chegou (RF-06). */
  atrasada: boolean
}

export type CategoriaProduto = 'armacao' | 'lente' | 'acessorio' | 'servico'

/**
 * `custoCentavos` e `margem` vem `null` quando quem pediu nao tem a
 * permissao `produtos.custo_margem` (RF-07, CA3) - o service redige esses
 * campos antes de responder, nunca manda o dado real para quem nao pode
 * ver. Nunca confunda com "produto sem custo cadastrado": no banco a
 * coluna e NOT NULL DEFAULT 0.
 */
export interface Produto {
  id: number
  codigo: string | null
  codigoBarras: string | null
  descricao: string
  categoria: CategoriaProduto
  marca: string | null
  modelo: string | null
  cor: string | null
  tamanho: string | null
  unidade: string
  custoCentavos: number | null
  margem: number | null
  precoVendaCentavos: number
  estoqueMinimo: number
  fotoPath: string | null
  ativo: boolean
  lenteMaterial: string | null
  lenteIndice: number | null
  lenteTipo: string | null
  lenteGrauMin: number | null
  lenteGrauMax: number | null
}

export type SituacaoVenda = 'CONCLUIDA' | 'CANCELADA'

export interface VendaItemDetalhe {
  id: number
  produtoId: number | null
  descricao: string
  quantidade: number
  precoUnitarioCentavos: number
  descontoCentavos: number
  totalCentavos: number
}

export interface VendaPagamentoDetalhe {
  id: number
  formaPagamento: string
  valorCentavos: number
  parcelas: number
}

export interface VendaResumo {
  id: number
  numero: string
  clienteId: number
  clienteNome: string
  vendedorId: number
  vendedorNome: string
  data: string
  totalCentavos: number
  situacao: SituacaoVenda
}

export type SituacaoContaReceber = 'ABERTA' | 'PAGA' | 'CANCELADA'

/**
 * `vendaNumero`, `clienteNome` e `vendedorNome` sao redundantes quando a
 * parcela vem embutida em `VendaDetalhada` (o pai ja tem esses dados), mas
 * o mesmo tipo tambem alimenta a tela "Contas a Receber", que lista
 * parcelas de varias vendas ao mesmo tempo - la esses campos e que
 * importam. Um tipo so, uma query so (`SELECT_CONTA_RECEBER`).
 */
export interface ContaReceber {
  id: number
  vendaId: number
  vendaNumero: string
  clienteId: number
  clienteNome: string
  vendedorId: number
  vendedorNome: string
  parcela: number
  totalParcelas: number
  valorCentavos: number
  valorRecebidoCentavos: number
  vencimento: string
  situacao: SituacaoContaReceber
  /** true quando `situacao === 'ABERTA'` e o vencimento ja passou. */
  vencida: boolean
}

export type SituacaoComissao = 'PROVISIONADA' | 'LIBERADA' | 'CANCELADA'

export interface ComissaoResumo {
  percentual: number
  valorCentavos: number
  situacao: SituacaoComissao
}

export interface VendaDetalhada extends VendaResumo {
  subtotalCentavos: number
  descontoCentavos: number
  receitaOpticaId: number | null
  autorizadoPorNome: string | null
  itens: VendaItemDetalhe[]
  pagamentos: VendaPagamentoDetalhe[]
  /** Vazio quando a venda foi paga inteiramente a vista (sem parcelamento). */
  parcelas: ContaReceber[]
  /** null quando a otica nao tem comissao configurada (RN-08). */
  comissao: ComissaoResumo | null
}

// ---------------------------------------------------------------------
// Estoque, fornecedores e compras (RF-08, RF-09, RF-11.2 - fase F4)
// ---------------------------------------------------------------------

export interface Fornecedor {
  id: number
  razaoSocial: string
  cnpj: string | null
  contato: string | null
  telefone: string | null
  email: string | null
  prazoEntregaDias: number | null
  ativo: boolean
}

/** Linha da consulta de saldo (RF-08) - servico nunca aparece aqui, nao tem estoque. */
export interface EstoqueItem {
  produtoId: number
  descricao: string
  categoria: CategoriaProduto
  marca: string | null
  unidade: string
  saldo: number
  estoqueMinimo: number
  ativo: boolean
}

export type SituacaoCompra = 'ABERTA' | 'RECEBIDA' | 'CANCELADA'

export interface CompraItemDetalhe {
  id: number
  produtoId: number
  produtoDescricao: string
  quantidade: number
  custoUnitarioCentavos: number
}

export interface CompraResumo {
  id: number
  fornecedorId: number | null
  fornecedorNome: string | null
  data: string
  numeroNf: string | null
  valorTotalCentavos: number
  situacao: SituacaoCompra
}

export interface CompraDetalhada extends CompraResumo {
  itens: CompraItemDetalhe[]
}

export type SituacaoContaPagar = 'ABERTA' | 'PAGA' | 'CANCELADA'

export interface ContaPagar {
  id: number
  compraId: number | null
  fornecedorId: number | null
  fornecedorNome: string | null
  descricao: string
  categoria: string | null
  valorCentavos: number
  valorPagoCentavos: number
  vencimento: string
  situacao: SituacaoContaPagar
  recorrente: boolean
  /** true quando `situacao === 'ABERTA'` e o vencimento ja passou. */
  vencida: boolean
}

/**
 * Opcoes operacionais (RF-01) que hoje so existem na tabela `configuracao`
 * sem nenhuma tela para edita-las - a fase F4 (RF-08, CA2: bloqueio de
 * venda sem saldo configuravel) precisa que pelo menos essa fique
 * alcancavel pelo usuario, entao a tela de Configuracoes ganha uma secao
 * para todas de uma vez.
 */
export interface ConfiguracaoOperacional {
  limiteDescontoVendedorPct: number
  comissaoPadraoPct: number
  diasGarantia: number
  sessaoExpiraMinutos: number
  prefixoOS: string
  estoqueBloqueiaVendaSemSaldo: boolean
}

// ---------------------------------------------------------------------
// Financeiro: fluxo de caixa e lucro/prejuizo (RF-11.3, RF-11.4 - fase F5)
// ---------------------------------------------------------------------

export interface LancamentoEntry {
  id: number
  tipo: 'RECEITA' | 'DESPESA'
  categoria: string | null
  descricao: string
  valorCentavos: number
  data: string
}

export interface FluxoCaixaResultado {
  totalReceitasCentavos: number
  totalDespesasCentavos: number
  saldoCentavos: number
  lancamentos: LancamentoEntry[]
}

export interface LucroPrejuizoCategoria {
  categoria: string | null
  totalCentavos: number
}

export interface LucroPrejuizoRegime {
  receitasCentavos: number
  despesasCentavos: number
  resultadoCentavos: number
  despesasPorCategoria: LucroPrejuizoCategoria[]
}

export interface MargemProduto {
  produtoId: number
  descricao: string
  categoria: CategoriaProduto
  quantidadeVendida: number
  receitaCentavos: number
  custoCentavos: number
  margemCentavos: number
}

/**
 * RN-12: duas visoes do mesmo periodo.
 *  - `caixa`: o que efetivamente entrou/saiu (tabela `lancamento`, por
 *    data do lancamento) - dinheiro de verdade.
 *  - `competencia`: reconhece a venda na data da venda e a despesa na
 *    data de vencimento da conta a pagar (manual ou gerada por compra),
 *    independente de quando o dinheiro mudou de mao.
 */
export interface LucroPrejuizoResultado {
  caixa: LucroPrejuizoRegime
  competencia: LucroPrejuizoRegime
  margemPorProduto: MargemProduto[]
}

// ---------------------------------------------------------------------
// Dashboard (RF-14 - fase F5)
// ---------------------------------------------------------------------

export interface RankingVendedorItem {
  vendedorId: number
  vendedorNome: string
  totalCentavos: number
}

/** Total vendido num dia ('YYYY-MM-DD'); a serie do grafico e sempre continua, com 0 nos dias sem venda. */
export interface VendaDiaItem {
  data: string
  totalCentavos: number
}

/** Receitas e despesas de um mes ('YYYY-MM'), regime de caixa - a mesma definicao do card "Saldo do mes". */
export interface FluxoMesItem {
  mes: string
  receitasCentavos: number
  despesasCentavos: number
}

/** 'outros' agrupa itens vendidos sem produto cadastrado (ex.: itens importados do sistema antigo). */
export type CategoriaVenda = CategoriaProduto | 'outros'

export interface VendaCategoriaItem {
  categoria: CategoriaVenda
  totalCentavos: number
}

/** So as etapas em andamento - ENTREGUE e CANCELADA nao entram no funil. */
export type EtapaOS = 'EM ABERTO' | 'LABORATÓRIO' | 'CHEGOU'

export interface OsEtapaItem {
  situacao: EtapaOS
  quantidade: number
}

export interface DashboardAdmin {
  vendasHojeCentavos: number
  vendasMesCentavos: number
  vendasMesAnteriorCentavos: number
  contasReceberVencendoCentavos: number
  contasReceberVencendoQtd: number
  contasReceberVencidasQtd: number
  contasPagarVencendoCentavos: number
  contasPagarVencendoQtd: number
  saldoMesCentavos: number
  produtosAbaixoMinimo: number
  osAtrasadas: number
  aniversariantesSemana: number
  rankingVendedores: RankingVendedorItem[]
  vendasPorDia: VendaDiaItem[]
  fluxoMensal: FluxoMesItem[]
  vendasPorCategoria: VendaCategoriaItem[]
  osPorEtapa: OsEtapaItem[]
}

export interface DashboardVendedor {
  vendasHojeCentavos: number
  vendasMesCentavos: number
  comissaoAcumuladaCentavos: number
  osResponsavel: number
  osAguardandoRetirada: number
  aniversariantesSemana: number
  vendasPorDia: VendaDiaItem[]
  osPorEtapa: OsEtapaItem[]
}

/** O service decide o formato pelo perfil da sessao - nunca pelo que o renderer pede. */
export type DashboardData =
  | { perfil: 'admin'; dados: DashboardAdmin }
  | { perfil: 'vendedor'; dados: DashboardVendedor }

// ---------------------------------------------------------------------
// Backup e licenca (RF-13 - fase F6)
// ---------------------------------------------------------------------

export interface BackupInfo {
  arquivo: string
  tamanhoBytes: number
  criadoEm: string
  integro: boolean
}

export interface BackupStatus {
  destino: string
  ultimoBackup: BackupInfo | null
  backups: BackupInfo[]
  /** true quando nunca houve backup, o ultimo falhou/nao e integro, ou passou de 48h (RF-13.1). */
  alerta: boolean
}

/**
 * Situacao da licenca (mesmo padrao do Visium). Calculada no main a partir da chave
 * instalada + relogio; o renderer so exibe.
 *
 * - `teste`              avaliacao em andamento (grava normalmente)
 * - `teste_encerrado`    avaliacao acabou e nao ha chave: somente leitura
 * - `ativa`              chave valida, longe do vencimento
 * - `proxima_vencimento` chave valida, perto de vencer (aviso)
 * - `carencia`           venceu ha pouco: ainda grava, com aviso forte
 * - `vencida`            passou da carencia: somente leitura
 */
export type EstadoLicenca =
  | 'teste'
  | 'teste_encerrado'
  | 'ativa'
  | 'proxima_vencimento'
  | 'carencia'
  | 'vencida'

/** Por que uma chave instalada foi ignorada (informativo, para a tela Licenca). */
export type MotivoChaveRecusada = 'invalida' | 'outra_maquina'

export interface LicencaInfo {
  estado: EstadoLicenca
  /** Nome do cliente gravado na chave; null sem licenca. */
  cliente: string | null
  /** 'mensal' | 'anual' | ...; null se a chave nao traz plano. */
  plano: string | null
  /** Ultima data de uso; null = sem vencimento ou sem licenca. */
  validade: string | null
  /** Em `teste`: dias de teste restantes. Com licenca: dias ate a validade (negativo na carencia). */
  diasParaVencer: number | null
  /** Codigo da maquina, que o cliente informa para receber a chave. */
  fingerprint: string
  chaveRecusada: MotivoChaveRecusada | null
  /** true = o main bloqueia criar/editar/excluir. */
  somenteLeitura: boolean
}

/** RF-16: versao instalada e notas de versao (CHANGELOG.md empacotado com o app). */
export interface SistemaInfo {
  versao: string
  notas: string
}

// ---------------------------------------------------------------------
// Caixa (RF-11.3 - fase F5)
// ---------------------------------------------------------------------

/**
 * `saldoEsperadoCentavos` e sempre CALCULADO (saldo inicial + lancamentos
 * de RECEITA/DESPESA registrados desde a abertura), nunca guardado - mesma
 * filosofia do saldo de estoque (RN-10). Simplificacao assumida: como
 * `lancamento` nao guarda a forma de pagamento, o esperado soma TODO
 * lancamento do periodo (dinheiro, cartao, PIX...), nao so o dinheiro
 * fisico da gaveta - a conferencia real ainda depende de quem fecha o
 * caixa saber separar isso na hora de contar.
 */
export interface CaixaAberto {
  id: number
  dataAbertura: string
  saldoInicialCentavos: number
  usuarioAberturaNome: string
  saldoEsperadoCentavos: number
}

export interface CaixaResumo {
  id: number
  dataAbertura: string
  dataFechamento: string | null
  saldoInicialCentavos: number
  saldoFinalCentavos: number | null
  saldoEsperadoCentavos: number
  usuarioAberturaNome: string
  usuarioFechamentoNome: string | null
}

// ---------------------------------------------------------------------
// Migracao do MD Óculos (PRD secao 11 - fase F7)
// ---------------------------------------------------------------------

export interface MigracaoAviso {
  tabela: string
  origemId: number
  motivo: string
}

export interface MigracaoResultado {
  clientesImportados: number
  clientesIgnorados: number
  examesImportados: number
  examesIgnorados: number
  despesasImportadas: number
  despesasIgnoradas: number
  /** Registros ja importados cujos acentos quebrados foram corrigidos nesta rodada. */
  textosCorrigidos: number
  avisos: MigracaoAviso[]
}

export interface ListaValorItem {
  id: number
  tipo: string
  valor: string
  ordem: number
  ativo: boolean
}

export type TipoListaValor =
  | 'situacao_os'
  | 'forma_pagamento'
  | 'tipo_lente'
  | 'tratamento_lente'
  | 'laboratorio'
  | 'categoria_despesa'

export interface AuditoriaEntrada {
  id: number
  usuarioNome: string | null
  autorizadoPorNome: string | null
  acao: string
  entidade: string
  entidadeId: number | null
  valorAnterior: string | null
  valorNovo: string | null
  dataHora: string
}

/** UF's do Brasil - padrao universal, nao e "configuravel pela otica". */
export const UNIDADES_FEDERATIVAS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO'
] as const

export const MESES = [
  '01 - JANEIRO', '02 - FEVEREIRO', '03 - MARÇO', '04 - ABRIL',
  '05 - MAIO', '06 - JUNHO', '07 - JULHO', '08 - AGOSTO',
  '09 - SETEMBRO', '10 - OUTUBRO', '11 - NOVEMBRO', '12 - DEZEMBRO'
] as const

/** Resultado padrao de toda chamada IPC - nunca lanca a excecao crua para a UI. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }

export interface BootstrapState {
  /** false = ainda nao rodou o wizard (RF-02); a UI mostra o setup. */
  configurado: boolean
}

// ---------------------------------------------------------------------
// Relacionamento (lista "quem chamar hoje" + atalho para o WhatsApp)
// ---------------------------------------------------------------------

/** Ordem de exibicao = ordem de prioridade do dia. */
export const MOTIVOS_CONTATO = ['RETIRADA', 'COBRANCA', 'ANIVERSARIO', 'POS_VENDA', 'RENOVACAO'] as const
export type MotivoContato = (typeof MOTIVOS_CONTATO)[number]

export interface ContatoPendente {
  /** `${motivo}:${clienteId}:${referencia}` - unica por ocorrencia, serve de key na lista. */
  chave: string
  motivo: MotivoContato
  clienteId: number
  clienteNome: string
  celular: string | null
  /** Identifica a OCORRENCIA (ano do aniversario, id da OS, da parcela, da receita). */
  referencia: string
  /** Frase pronta para a tela: "Óculos da OS 2026-00012 chegaram há 5 dias". */
  detalhe: string
  /** Data ISO do evento, so para ordenar dentro do motivo. */
  data: string
  /** false quando nao ha celular valido para abrir o WhatsApp. */
  temWhatsapp: boolean
}

export interface ClienteSemContato {
  id: number
  nome: string
  celular: string | null
}

/** Uma mensagem por motivo, com placeholders como {nome} e {otica}. */
export type ModelosMensagem = Record<MotivoContato, string>
