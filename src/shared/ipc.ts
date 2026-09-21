import { z } from 'zod'
import { MOTIVOS_CONTATO } from './types'

/**
 * Contrato de IPC: os nomes de canal moram em `ipcChannels.ts` (sem
 * dependencia de zod - ver o comentario la para o porque). Aqui ficam os
 * schemas de validacao de cada payload de escrita: o main NUNCA confia em
 * dado vindo do renderer - todo handler de escrita valida com o schema
 * daqui antes de tocar no banco (PRD, NF 8.3).
 */
export { IPC } from './ipcChannels'

// ---------------------------------------------------------------------
// Setup / bootstrap (RF-02)
// ---------------------------------------------------------------------

export const setupSchema = z.object({
  empresa: z.object({
    nomeFantasia: z.string().trim().min(1, 'Informe o nome da ótica'),
    cnpj: z.string().trim().optional()
  }),
  admin: z.object({
    nome: z.string().trim().min(1, 'Informe o nome do administrador'),
    login: z.string().trim().min(3, 'O login precisa de pelo menos 3 caracteres'),
    senha: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres')
  })
})
export type SetupInput = z.infer<typeof setupSchema>

// ---------------------------------------------------------------------
// Autenticacao (RF-03)
// ---------------------------------------------------------------------

export const loginSchema = z.object({
  login: z.string().trim().min(1),
  senha: z.string().min(1)
})
export type LoginInput = z.infer<typeof loginSchema>

export const trocarSenhaSchema = z.object({
  senhaAtual: z.string().min(1),
  novaSenha: z.string().min(8, 'A nova senha precisa de pelo menos 8 caracteres')
})
export type TrocarSenhaInput = z.infer<typeof trocarSenhaSchema>

export const primeiroAcessoSchema = z.object({
  login: z.string().trim().min(1, 'Informe o login'),
  novaSenha: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres')
})
export type PrimeiroAcessoInput = z.infer<typeof primeiroAcessoSchema>

/** RF-03.4: autoriza uma acao pontual do vendedor com credencial de Admin. */
export const autorizarAcaoSchema = z.object({
  loginAdmin: z.string().trim().min(1),
  senhaAdmin: z.string().min(1)
})
export type AutorizarAcaoInput = z.infer<typeof autorizarAcaoSchema>

// ---------------------------------------------------------------------
// Empresa / white-label (RF-01)
// ---------------------------------------------------------------------

export const empresaUpdateSchema = z.object({
  nomeFantasia: z.string().trim().min(1),
  razaoSocial: z.string().trim().optional().nullable(),
  cnpj: z.string().trim().optional().nullable(),
  ie: z.string().trim().optional().nullable(),
  logradouro: z.string().trim().optional().nullable(),
  numero: z.string().trim().optional().nullable(),
  complemento: z.string().trim().optional().nullable(),
  bairro: z.string().trim().optional().nullable(),
  cidade: z.string().trim().optional().nullable(),
  uf: z.string().trim().max(2).optional().nullable(),
  cep: z.string().trim().optional().nullable(),
  telefone: z.string().trim().optional().nullable(),
  whatsapp: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal('')),
  site: z.string().trim().optional().nullable(),
  corDestaque: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use uma cor no formato #RRGGBB'),
  tema: z.enum(['claro', 'escuro', 'sistema']),
  logoFormato: z.enum(['circulo', 'quadrado_arredondado', 'quadrado'])
})
export type EmpresaUpdateInput = z.infer<typeof empresaUpdateSchema>

// PNG/JPG/SVG (RF-01); o limite de tamanho e checado no service, nao aqui,
// para dar uma mensagem de erro melhor do que "string too long".
export const empresaLogoUploadSchema = z.object({
  fileName: z.string().trim().min(1),
  dataBase64: z.string().min(1)
})
export type EmpresaLogoUploadInput = z.infer<typeof empresaLogoUploadSchema>

// ---------------------------------------------------------------------
// Usuarios (RF-03.2)
// ---------------------------------------------------------------------

export const usuarioCreateSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome'),
  login: z.string().trim().min(3, 'O login precisa de pelo menos 3 caracteres'),
  perfil: z.enum(['admin', 'vendedor'])
})
export type UsuarioCreateInput = z.infer<typeof usuarioCreateSchema>

export const usuarioSetAtivoSchema = z.object({
  id: z.number().int().positive(),
  ativo: z.boolean()
})
export type UsuarioSetAtivoInput = z.infer<typeof usuarioSetAtivoSchema>

export const usuarioResetSenhaSchema = z.object({
  id: z.number().int().positive(),
  novaSenha: z.string().min(8, 'A nova senha precisa de pelo menos 8 caracteres')
})
export type UsuarioResetSenhaInput = z.infer<typeof usuarioResetSenhaSchema>

export const idSchema = z.object({ id: z.number().int().positive() })
export type IdInput = z.infer<typeof idSchema>

// ---------------------------------------------------------------------
// Clientes (RF-04)
// ---------------------------------------------------------------------

// D7: cada campo obrigatorio e validado individualmente - nunca um "&&"
// que so bloqueia se TUDO estiver vazio.
export const clienteInputSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do cliente'),
  dataNasc: z.string().trim().length(10).optional().nullable().or(z.literal('')),
  cpf: z.string().trim().optional().nullable().or(z.literal('')),
  rg: z.string().trim().optional().nullable().or(z.literal('')),
  celular: z.string().trim().optional().nullable().or(z.literal('')),
  telefone: z.string().trim().optional().nullable().or(z.literal('')),
  email: z.string().trim().optional().nullable().or(z.literal('')),
  logradouro: z.string().trim().optional().nullable().or(z.literal('')),
  numero: z.string().trim().optional().nullable().or(z.literal('')),
  complemento: z.string().trim().optional().nullable().or(z.literal('')),
  bairro: z.string().trim().optional().nullable().or(z.literal('')),
  cidade: z.string().trim().optional().nullable().or(z.literal('')),
  uf: z.string().trim().max(2).optional().nullable().or(z.literal('')),
  cep: z.string().trim().optional().nullable().or(z.literal('')),
  profissao: z.string().trim().optional().nullable().or(z.literal('')),
  indicadoPor: z.string().trim().optional().nullable().or(z.literal('')),
  observacao: z.string().trim().optional().nullable().or(z.literal(''))
})
export type ClienteInput = z.infer<typeof clienteInputSchema>

export const clientesListQuerySchema = z.object({
  busca: z.string().trim().optional(),
  apenasAtivos: z.boolean().optional(),
  /** Quantos clientes devolver (padrao 200). A tela de Clientes pede mais em blocos. */
  limite: z.number().int().min(1).max(5000).optional()
})
export type ClientesListQuery = z.infer<typeof clientesListQuerySchema>

export const clienteUpdateSchema = z.object({
  id: z.number().int().positive(),
  dados: clienteInputSchema
})
export type ClienteUpdateInput = z.infer<typeof clienteUpdateSchema>

export const aniversariantesQuerySchema = z.object({
  mes: z.number().int().min(1).max(12).nullable()
})
export type AniversariantesQuery = z.infer<typeof aniversariantesQuerySchema>

// ---------------------------------------------------------------------
// Receita optica (RF-05)
// ---------------------------------------------------------------------

// Grau em passos de 0,25 (RN-03); eixo entre 0 e 180. Aceita vazio (campo
// nao preenchido) mas nunca um valor fora da faixa clinica.
const grauEsfCil = z
  .union([z.string(), z.number()])
  .transform((v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.'))))
  .refine((v) => v === null || Number.isFinite(v), 'Valor de grau inválido')
  .refine((v) => v === null || Math.abs(v * 4 - Math.round(v * 4)) < 1e-6, 'Use passos de 0,25')
  .nullable()

const eixo = z
  .union([z.string(), z.number()])
  .transform((v) => (v === '' || v === null || v === undefined ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 180), 'O eixo vai de 0° a 180°')
  .nullable()

const dnp = z
  .union([z.string(), z.number()])
  .transform((v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.'))))
  .refine((v) => v === null || Number.isFinite(v), 'DNP inválido')
  .nullable()

export const receitaOpticaInputSchema = z.object({
  clienteId: z.number().int().positive(),
  profissionalNome: z.string().trim().optional().nullable().or(z.literal('')),
  dataExame: z.string().trim().length(10, 'Informe a data do exame'), // YYYY-MM-DD

  longeOdEsf: grauEsfCil,
  longeOdCil: grauEsfCil,
  longeOdEixo: eixo,
  longeOdDnp: dnp,
  longeOeEsf: grauEsfCil,
  longeOeCil: grauEsfCil,
  longeOeEixo: eixo,
  longeOeDnp: dnp,

  pertoOdEsf: grauEsfCil,
  pertoOdCil: grauEsfCil,
  pertoOdEixo: eixo,
  pertoOdDnp: dnp,
  pertoOeEsf: grauEsfCil,
  pertoOeCil: grauEsfCil,
  pertoOeEixo: eixo,
  pertoOeDnp: dnp,

  adicao: grauEsfCil,
  altura: dnp,
  tipoLente: z.string().trim().optional().nullable().or(z.literal('')),
  tratamentos: z.string().trim().optional().nullable().or(z.literal('')),
  armacao: z.string().trim().optional().nullable().or(z.literal('')),
  observacao: z.string().trim().optional().nullable().or(z.literal(''))
})
export type ReceitaOpticaInput = z.infer<typeof receitaOpticaInputSchema>

export const receitaListByClienteSchema = z.object({ clienteId: z.number().int().positive() })
export type ReceitaListByClienteInput = z.infer<typeof receitaListByClienteSchema>

// ---------------------------------------------------------------------
// Ordem de Servico (RF-06)
// ---------------------------------------------------------------------

const dataOpcional = z.string().trim().length(10).optional().nullable().or(z.literal(''))

export const ordemServicoCreateSchema = z.object({
  clienteId: z.number().int().positive(),
  receitaOpticaId: z.number().int().positive().optional().nullable(),
  laboratorio: z.string().trim().optional().nullable().or(z.literal('')),
  dataPrevisao: dataOpcional,
  observacao: z.string().trim().optional().nullable().or(z.literal(''))
})
export type OrdemServicoCreateInput = z.infer<typeof ordemServicoCreateSchema>

export const ordemServicoAvancarSchema = z.object({
  id: z.number().int().positive(),
  /** Data do evento; em branco = hoje. */
  data: dataOpcional
})
export type OrdemServicoAvancarInput = z.infer<typeof ordemServicoAvancarSchema>

export const ordemServicoCancelarSchema = z.object({
  id: z.number().int().positive(),
  motivo: z.string().trim().min(1, 'Informe o motivo do cancelamento')
})
export type OrdemServicoCancelarInput = z.infer<typeof ordemServicoCancelarSchema>

export const ordemServicoAtualizarDatasSchema = z.object({
  id: z.number().int().positive(),
  laboratorio: z.string().trim().optional().nullable().or(z.literal('')),
  dataPrevisao: dataOpcional,
  observacao: z.string().trim().optional().nullable().or(z.literal(''))
})
export type OrdemServicoAtualizarDatasInput = z.infer<typeof ordemServicoAtualizarDatasSchema>

// ---------------------------------------------------------------------
// Produtos (RF-07)
// ---------------------------------------------------------------------

/**
 * Dinheiro digitado no padrao brasileiro ("1.234,56" ou "89,90") vira
 * centavos como inteiro (PRD 10.4: "dinheiro em centavos, como inteiro" -
 * elimina erro de arredondamento em ponto flutuante). O ponto e tratado
 * como separador de milhar e removido; a virgula e o separador decimal.
 */
const dinheiroCentavos = z
  .union([z.string(), z.number()])
  .transform((v) => {
    if (typeof v === 'number') return Math.round(v)
    const limpo = v.trim().replace(/\./g, '').replace(',', '.')
    return Math.round(Number(limpo || '0') * 100)
  })
  .refine((v) => Number.isFinite(v) && v >= 0, 'Valor inválido')

const percentual = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'number' ? v : Number(v.trim().replace(',', '.') || '0')))
  .refine((v) => Number.isFinite(v) && v >= 0, 'Percentual inválido')

export const produtoInputSchema = z.object({
  codigo: z.string().trim().optional().nullable().or(z.literal('')),
  codigoBarras: z.string().trim().optional().nullable().or(z.literal('')),
  descricao: z.string().trim().min(1, 'Informe a descrição do produto'),
  categoria: z.enum(['armacao', 'lente', 'acessorio', 'servico']),
  marca: z.string().trim().optional().nullable().or(z.literal('')),
  modelo: z.string().trim().optional().nullable().or(z.literal('')),
  cor: z.string().trim().optional().nullable().or(z.literal('')),
  tamanho: z.string().trim().optional().nullable().or(z.literal('')),
  unidade: z.string().trim().min(1).default('UN'),
  custoCentavos: dinheiroCentavos,
  margem: percentual,
  precoVendaCentavos: dinheiroCentavos,
  estoqueMinimo: z.coerce.number().int().min(0).default(0),
  // so relevante quando categoria === 'lente'; ignorado nos demais casos
  lenteMaterial: z.string().trim().optional().nullable().or(z.literal('')),
  lenteIndice: z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.'))))
    .nullable()
    .optional(),
  lenteTipo: z.string().trim().optional().nullable().or(z.literal('')),
  lenteGrauMin: z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.'))))
    .nullable()
    .optional(),
  lenteGrauMax: z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.'))))
    .nullable()
    .optional()
})
export type ProdutoInput = z.infer<typeof produtoInputSchema>

export const produtoUpdateSchema = z.object({ id: z.number().int().positive(), dados: produtoInputSchema })
export type ProdutoUpdateInput = z.infer<typeof produtoUpdateSchema>

export const produtoSetAtivoSchema = z.object({ id: z.number().int().positive(), ativo: z.boolean() })
export type ProdutoSetAtivoInput = z.infer<typeof produtoSetAtivoSchema>

export const produtosListQuerySchema = z.object({
  busca: z.string().trim().optional(),
  categoria: z.enum(['armacao', 'lente', 'acessorio', 'servico', '']).optional(),
  apenasAtivos: z.boolean().optional()
})
export type ProdutosListQuery = z.infer<typeof produtosListQuerySchema>

// ---------------------------------------------------------------------
// Vendas (RF-10)
// ---------------------------------------------------------------------

/** Credencial de Admin para autorizar uma acao pontual (RF-03.4). */
export const credencialAdminSchema = z.object({
  loginAdmin: z.string().trim().min(1),
  senhaAdmin: z.string().min(1)
})
export type CredencialAdminInput = z.infer<typeof credencialAdminSchema>

export const vendaItemInputSchema = z.object({
  produtoId: z.number().int().positive(),
  quantidade: z.number().int().positive(),
  precoUnitarioCentavos: dinheiroCentavos,
  descontoCentavos: dinheiroCentavos
})
export type VendaItemInput = z.infer<typeof vendaItemInputSchema>

export const vendaPagamentoInputSchema = z.object({
  formaPagamento: z.string().trim().min(1, 'Escolha a forma de pagamento'),
  valorCentavos: dinheiroCentavos,
  parcelas: z.number().int().min(1).max(24)
})
export type VendaPagamentoInput = z.infer<typeof vendaPagamentoInputSchema>

export const vendaCreateSchema = z.object({
  clienteId: z.number().int().positive(),
  receitaOpticaId: z.number().int().positive().optional().nullable(),
  ordemServicoId: z.number().int().positive().optional().nullable(),
  itens: z.array(vendaItemInputSchema).min(1, 'Adicione ao menos um item'),
  descontoAdicionalCentavos: dinheiroCentavos,
  pagamentos: z.array(vendaPagamentoInputSchema).min(1, 'Informe ao menos uma forma de pagamento'),
  /** So preenchido quando um Vendedor precisa de aprovacao (RN-07). */
  autorizacaoAdmin: credencialAdminSchema.optional().nullable()
})
export type VendaCreateInput = z.infer<typeof vendaCreateSchema>

export const vendasListQuerySchema = z.object({
  busca: z.string().trim().optional(),
  dataInicio: dataOpcional,
  dataFim: dataOpcional
})
export type VendasListQuery = z.infer<typeof vendasListQuerySchema>

/** RN-11: cancelar venda estorna estoque, financeiro e comissao. */
export const vendaCancelarSchema = z.object({
  id: z.number().int().positive(),
  /** So preenchido quando um Vendedor precisa de aprovacao (a matriz nao da a um vendedor a permissao 'vendas.cancelar'). */
  autorizacaoAdmin: credencialAdminSchema.optional().nullable()
})
export type VendaCancelarInput = z.infer<typeof vendaCancelarSchema>

// ---------------------------------------------------------------------
// Contas a receber (RF-11.1)
// ---------------------------------------------------------------------

export const contasReceberListQuerySchema = z.object({
  busca: z.string().trim().optional(),
  situacao: z.enum(['ABERTA', 'PAGA', 'CANCELADA', '']).optional(),
  /** true = so as em aberto que ja passaram do vencimento. */
  apenasVencidas: z.boolean().optional()
})
export type ContasReceberListQuery = z.infer<typeof contasReceberListQuerySchema>

export const contaReceberBaixarSchema = z.object({
  id: z.number().int().positive(),
  valorCentavos: dinheiroCentavos,
  data: dataOpcional,
  formaPagamento: z.string().trim().min(1, 'Escolha a forma de recebimento')
})
export type ContaReceberBaixarInput = z.infer<typeof contaReceberBaixarSchema>

export const ordensServicoQuerySchema = z.object({
  busca: z.string().trim().optional(),
  /** Vazio = todas as situacoes. */
  situacao: z.string().trim().optional(),
  dataInicio: dataOpcional,
  dataFim: dataOpcional,
  /** true = so as que passaram da previsao e nao chegaram. */
  apenasAtrasadas: z.boolean().optional()
})
export type OrdensServicoQuery = z.infer<typeof ordensServicoQuerySchema>

// ---------------------------------------------------------------------
// Fornecedores (RF-09)
// ---------------------------------------------------------------------

export const fornecedorInputSchema = z.object({
  razaoSocial: z.string().trim().min(1, 'Informe a razão social'),
  cnpj: z.string().trim().optional().nullable().or(z.literal('')),
  contato: z.string().trim().optional().nullable().or(z.literal('')),
  telefone: z.string().trim().optional().nullable().or(z.literal('')),
  email: z.string().trim().optional().nullable().or(z.literal('')),
  prazoEntregaDias: z
    .union([z.string(), z.number()])
    .transform((v) => (v === '' || v === null || v === undefined ? null : Math.round(Number(v))))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), 'Prazo inválido')
    .nullable()
    .optional()
})
export type FornecedorInput = z.infer<typeof fornecedorInputSchema>

export const fornecedorUpdateSchema = z.object({ id: z.number().int().positive(), dados: fornecedorInputSchema })
export type FornecedorUpdateInput = z.infer<typeof fornecedorUpdateSchema>

export const fornecedorSetAtivoSchema = z.object({ id: z.number().int().positive(), ativo: z.boolean() })
export type FornecedorSetAtivoInput = z.infer<typeof fornecedorSetAtivoSchema>

export const fornecedoresListQuerySchema = z.object({
  busca: z.string().trim().optional(),
  apenasAtivos: z.boolean().optional()
})
export type FornecedoresListQuery = z.infer<typeof fornecedoresListQuerySchema>

// ---------------------------------------------------------------------
// Compras (RF-09)
// ---------------------------------------------------------------------

export const compraItemInputSchema = z.object({
  produtoId: z.number().int().positive(),
  quantidade: z.number().int().positive(),
  custoUnitarioCentavos: dinheiroCentavos
})
export type CompraItemInput = z.infer<typeof compraItemInputSchema>

export const compraCreateSchema = z.object({
  fornecedorId: z.number().int().positive().optional().nullable(),
  numeroNf: z.string().trim().optional().nullable().or(z.literal('')),
  itens: z.array(compraItemInputSchema).min(1, 'Adicione ao menos um item')
})
export type CompraCreateInput = z.infer<typeof compraCreateSchema>

export const compraConfirmarEntradaSchema = z.object({
  id: z.number().int().positive(),
  vencimentoContaPagar: z.string().trim().length(10, 'Informe o vencimento do pagamento')
})
export type CompraConfirmarEntradaInput = z.infer<typeof compraConfirmarEntradaSchema>

export const comprasListQuerySchema = z.object({
  busca: z.string().trim().optional(),
  situacao: z.enum(['ABERTA', 'RECEBIDA', 'CANCELADA', '']).optional()
})
export type ComprasListQuery = z.infer<typeof comprasListQuerySchema>

// ---------------------------------------------------------------------
// Estoque (RF-08)
// ---------------------------------------------------------------------

export const estoqueListQuerySchema = z.object({
  busca: z.string().trim().optional(),
  categoria: z.enum(['armacao', 'lente', 'acessorio', '']).optional(),
  situacao: z.enum(['abaixo_minimo', 'zerado', '']).optional()
})
export type EstoqueListQuery = z.infer<typeof estoqueListQuerySchema>

export const estoqueAjustarSchema = z.object({
  produtoId: z.number().int().positive(),
  saldoContado: z.coerce.number().int(),
  motivo: z.string().trim().min(1, 'Informe o motivo do ajuste')
})
export type EstoqueAjustarInput = z.infer<typeof estoqueAjustarSchema>

// ---------------------------------------------------------------------
// Contas a pagar (RF-11.2)
// ---------------------------------------------------------------------

export const contaPagarCriarSchema = z.object({
  descricao: z.string().trim().min(1, 'Informe a descrição'),
  categoria: z.string().trim().optional().nullable().or(z.literal('')),
  valorCentavos: dinheiroCentavos,
  vencimento: z.string().trim().length(10, 'Informe o vencimento'),
  recorrente: z.boolean().optional()
})
export type ContaPagarCriarInput = z.infer<typeof contaPagarCriarSchema>

export const contaPagarPagarSchema = z.object({
  id: z.number().int().positive(),
  valorCentavos: dinheiroCentavos,
  data: dataOpcional,
  formaPagamento: z.string().trim().min(1, 'Escolha a forma de pagamento')
})
export type ContaPagarPagarInput = z.infer<typeof contaPagarPagarSchema>

export const contasPagarListQuerySchema = z.object({
  busca: z.string().trim().optional(),
  situacao: z.enum(['ABERTA', 'PAGA', 'CANCELADA', '']).optional(),
  apenasVencidas: z.boolean().optional()
})
export type ContasPagarListQuery = z.infer<typeof contasPagarListQuerySchema>

// ---------------------------------------------------------------------
// Configuracoes operacionais
// ---------------------------------------------------------------------

export const configuracaoOperacionalSchema = z.object({
  limiteDescontoVendedorPct: z.coerce.number().min(0).max(100),
  comissaoPadraoPct: z.coerce.number().min(0).max(100),
  diasGarantia: z.coerce.number().int().min(0),
  sessaoExpiraMinutos: z.coerce.number().int().min(1),
  prefixoOS: z.string().trim().optional().default(''),
  estoqueBloqueiaVendaSemSaldo: z.boolean()
})
export type ConfiguracaoOperacionalInput = z.infer<typeof configuracaoOperacionalSchema>

// ---------------------------------------------------------------------
// Financeiro e dashboard (RF-11.3, RF-11.4, RF-14 - fase F5)
// ---------------------------------------------------------------------

export const periodoQuerySchema = z.object({
  dataInicio: z.string().trim().length(10, 'Informe a data inicial'),
  dataFim: z.string().trim().length(10, 'Informe a data final')
})
export type PeriodoQuery = z.infer<typeof periodoQuerySchema>

// ---------------------------------------------------------------------
// Backup e licenca (RF-13 - fase F6)
// ---------------------------------------------------------------------

export const backupRestaurarSchema = z.object({
  arquivo: z.string().trim().min(1, 'Selecione um backup para restaurar')
})
export type BackupRestaurarInput = z.infer<typeof backupRestaurarSchema>

export const licencaAtivarSchema = z.object({
  chave: z.string().trim().min(1, 'Informe a chave de licença')
})
export type LicencaAtivarInput = z.infer<typeof licencaAtivarSchema>

// ---------------------------------------------------------------------
// Caixa (RF-11.3 - fase F5)
// ---------------------------------------------------------------------

export const caixaAbrirSchema = z.object({ saldoInicialCentavos: dinheiroCentavos })
export type CaixaAbrirInput = z.infer<typeof caixaAbrirSchema>

export const caixaFecharSchema = z.object({ saldoContadoCentavos: dinheiroCentavos })
export type CaixaFecharInput = z.infer<typeof caixaFecharSchema>

export const caixaMovimentoSchema = z.object({
  valorCentavos: dinheiroCentavos,
  motivo: z.string().trim().min(1, 'Informe o motivo')
})
export type CaixaMovimentoInput = z.infer<typeof caixaMovimentoSchema>

// ---------------------------------------------------------------------
// Migracao do MD Óculos (PRD secao 11 - fase F7)
// ---------------------------------------------------------------------

export const migracaoConexaoSchema = z.object({
  host: z.string().trim().min(1, 'Informe o host'),
  porta: z.coerce.number().int().min(1).max(65535),
  usuario: z.string().trim().min(1, 'Informe o usuário'),
  senha: z.string(),
  banco: z.string().trim().min(1, 'Informe o nome do banco')
})
export type MigracaoConexaoInput = z.infer<typeof migracaoConexaoSchema>

// ---------------------------------------------------------------------
// Listas de valor (RF-01)
// ---------------------------------------------------------------------

export const listaValorTipoSchema = z.object({
  tipo: z.enum([
    'situacao_os',
    'forma_pagamento',
    'tipo_lente',
    'tratamento_lente',
    'laboratorio',
    'categoria_despesa'
  ])
})
export type ListaValorTipoInput = z.infer<typeof listaValorTipoSchema>

// ---------------------------------------------------------------------
// Relacionamento (lista "quem chamar hoje" + atalho para o WhatsApp)
// ---------------------------------------------------------------------

/** Identifica uma ocorrencia pendente. A tela so manda ids - nunca um link: o link e montado no main. */
export const contatoRefSchema = z.object({
  clienteId: z.number().int().positive(),
  motivo: z.enum(MOTIVOS_CONTATO),
  referencia: z.string().trim().min(1).max(40)
})
export type ContatoRefInput = z.infer<typeof contatoRefSchema>

export const contatoMarcarSchema = contatoRefSchema.extend({
  observacao: z.string().trim().max(300).optional()
})
export type ContatoMarcarInput = z.infer<typeof contatoMarcarSchema>

export const aceitaContatoSchema = z.object({
  clienteId: z.number().int().positive(),
  aceita: z.boolean()
})
export type AceitaContatoInput = z.infer<typeof aceitaContatoSchema>

const modeloMensagem = z.string().trim().min(1, 'A mensagem não pode ficar vazia').max(700, 'Mensagem longa demais (máximo 700 caracteres)')
export const modelosMensagemSchema = z.object({
  RETIRADA: modeloMensagem,
  COBRANCA: modeloMensagem,
  ANIVERSARIO: modeloMensagem,
  POS_VENDA: modeloMensagem,
  RENOVACAO: modeloMensagem
})
export type ModelosMensagemInput = z.infer<typeof modelosMensagemSchema>
