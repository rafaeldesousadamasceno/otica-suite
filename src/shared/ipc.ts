import { z } from 'zod'
import { MOTIVOS_CONTATO, UNIDADE_PADRAO } from './types'
import { PRESETS_PERIODO, validarPeriodo } from './periodos'
import { CAMPOS_DATA_EXAME, TIPOS_PENDENCIA } from './importacao'
import { BASES_PRISMA } from './prescricao'
import { cnpjValido, digitosCnpj } from './cnpj'
import { digitosTelefone, telefoneValido } from './telefone'

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

/** Recuperacao de senha do Admin: o codigo assinado que o fornecedor devolveu para o pedido mostrado na tela. */
export const recuperacaoCodigoSchema = z.object({
  codigo: z.string().trim().min(1, 'Cole o código de recuperação que você recebeu')
})
export type RecuperacaoCodigoInput = z.infer<typeof recuperacaoCodigoSchema>

export const recuperacaoRedefinirSchema = recuperacaoCodigoSchema.extend({
  usuarioId: z.number().int().positive('Escolha o usuário'),
  novaSenha: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres')
})
export type RecuperacaoRedefinirInput = z.infer<typeof recuperacaoRedefinirSchema>

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

/** PDF aberto no visualizador (id gerado pelo main com `randomUUID`). */
export const pdfIdSchema = z.object({ id: z.uuid() })
export type PdfIdInput = z.infer<typeof pdfIdSchema>

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

// Prescricao ("receita optica" no codigo): aqui so a FORMA dos dados; as faixas
// clinicas (esferico, DNP, grade da armacao...) e as regras entre campos moram em
// shared/prescricao.ts e o service as confere. Numero aceita virgula decimal e vazio (null).
const numeroOpcional = (rotulo: string) =>
  z
    .union([z.string(), z.number(), z.null()])
    .transform((v) => (v === '' || v === null ? null : Number(String(v).trim().replace(',', '.'))))
    .refine((v) => v === null || Number.isFinite(v), `${rotulo} inválido`)

const textoOpcional = z.string().trim().optional().nullable().or(z.literal(''))

export const receitaOpticaInputSchema = z.object({
  clienteId: z.number().int().positive(),
  profissionalNome: textoOpcional,
  dataExame: z.string().trim().length(10, 'Informe a data do exame'), // YYYY-MM-DD

  longeOdEsf: numeroOpcional('Esférico'),
  longeOdCil: numeroOpcional('Cilíndrico'),
  longeOdEixo: numeroOpcional('Eixo'),
  longeOdDnp: numeroOpcional('DNP'),
  longeOdAlt: numeroOpcional('Altura'),
  longeOdPrisma: numeroOpcional('Prisma'),
  longeOdBasePrisma: z.enum(BASES_PRISMA).default('NENHUM'),
  adicaoOd: numeroOpcional('Adição'),
  pertoOdDnp: numeroOpcional('DNP de perto'),

  longeOeEsf: numeroOpcional('Esférico'),
  longeOeCil: numeroOpcional('Cilíndrico'),
  longeOeEixo: numeroOpcional('Eixo'),
  longeOeDnp: numeroOpcional('DNP'),
  longeOeAlt: numeroOpcional('Altura'),
  longeOePrisma: numeroOpcional('Prisma'),
  longeOeBasePrisma: z.enum(BASES_PRISMA).default('NENHUM'),
  adicaoOe: numeroOpcional('Adição'),
  pertoOeDnp: numeroOpcional('DNP de perto'),

  tipoLente: textoOpcional,
  indiceRefracao: textoOpcional,
  tratamentos: textoOpcional,
  armacaoTipo: textoOpcional,
  armacaoModelo: textoOpcional,
  armacaoMarca: textoOpcional,
  armacaoCor: textoOpcional,

  ponte: numeroOpcional('Ponte'),
  horizontal: numeroOpcional('Horizontal'),
  vertical: numeroOpcional('Vertical'),
  diagonalMaior: numeroOpcional('Diagonal Maior'),

  observacao: textoOpcional
})
export type ReceitaOpticaInput = z.infer<typeof receitaOpticaInputSchema>

/** Edicao de uma prescricao ja salva: os mesmos campos da criacao, mais o id. O cliente nao muda. */
export const receitaOpticaAtualizarSchema = receitaOpticaInputSchema.extend({ id: z.number().int().positive() })
export type ReceitaOpticaAtualizarInput = z.infer<typeof receitaOpticaAtualizarSchema>

/** Exclusao logica: o registro fica guardado, so some das telas. O motivo e opcional. */
export const receitaExcluirSchema = z.object({
  id: z.number().int().positive(),
  motivo: z.string().trim().max(200).optional().nullable()
})
export type ReceitaExcluirInput = z.infer<typeof receitaExcluirSchema>

/** Impressao da prescricao. `exibirDp` e a preferencia deste computador (a tela manda; o main nao a conhece). */
export const prescricaoImprimirSchema = z.object({
  id: z.number().int().positive(),
  exibirDp: z.boolean().optional()
})
export type PrescricaoImprimirInput = z.infer<typeof prescricaoImprimirSchema>

/** Impressao da OS (leva a prescricao junto, entao tambem depende de `exibirDp`). */
export const ordemServicoImprimirSchema = z.object({
  id: z.number().int().positive(),
  exibirDp: z.boolean().optional()
})
export type OrdemServicoImprimirInput = z.infer<typeof ordemServicoImprimirSchema>

export const receitaListByClienteSchema = z.object({ clienteId: z.number().int().positive() })
export type ReceitaListByClienteInput = z.infer<typeof receitaListByClienteSchema>

// ---------------------------------------------------------------------
// Ordem de Servico (RF-06)
// ---------------------------------------------------------------------

const dataOpcional = z.string().trim().length(10).optional().nullable().or(z.literal(''))

/** Contato do entregador: so os digitos, 10 ou 11 (RG-05); vazio e permitido. */
const telefoneDigitos = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => digitosTelefone(v) || null)
  .refine((v) => telefoneValido(v), 'Informe o telefone com DDD: 10 ou 11 dígitos')

export const ordemServicoCreateSchema = z.object({
  clienteId: z.number().int().positive(),
  receitaOpticaId: z.number().int().positive().optional().nullable(),
  /** Laboratorio do cadastro (so ativos). */
  laboratorioId: z.number().int().positive().optional().nullable(),
  entregadorNome: z.string().trim().max(80).optional().nullable().or(z.literal('')),
  entregadorContato: telefoneDigitos,
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
  /** Ausente = nao mexe no laboratorio; null = tira o laboratorio. */
  laboratorioId: z.number().int().positive().optional().nullable(),
  entregadorNome: z.string().trim().max(80).optional().nullable().or(z.literal('')),
  entregadorContato: telefoneDigitos,
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
  // Sigla da lista de unidades de medida; o service confere se ela esta cadastrada.
  unidade: z
    .string()
    .trim()
    .min(1, 'Escolha a unidade')
    .transform((v) => v.toLocaleUpperCase('pt-BR'))
    .default(UNIDADE_PADRAO),
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
// Laboratorios (cadastro; a OS escolhe um)
// ---------------------------------------------------------------------

const textoOpc = z.string().trim().optional().nullable().or(z.literal(''))

const telefoneLab = (rotulo: string) =>
  z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => digitosTelefone(v) || null)
    .refine((v) => telefoneValido(v), `${rotulo}: informe DDD e número (10 ou 11 dígitos)`)

export const laboratorioInputSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do laboratório').max(80, 'O nome tem no máximo 80 caracteres'),
  razaoSocial: textoOpc,
  cnpj: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => digitosCnpj(v) || null)
    .refine((v) => v === null || cnpjValido(v), 'CNPJ inválido'),
  telefone: telefoneLab('Telefone'),
  whatsapp: telefoneLab('WhatsApp'),
  email: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => v || null)
    .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'E-mail inválido'),
  endereco: textoOpc,
  contatoResponsavel: textoOpc,
  prazoMedioDias: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => (v === undefined || v === null || v === '' ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 365), 'O prazo vai de 0 a 365 dias'),
  observacoes: textoOpc
})
export type LaboratorioInput = z.infer<typeof laboratorioInputSchema>

export const laboratorioUpdateSchema = z.object({ id: z.number().int().positive(), dados: laboratorioInputSchema })
export type LaboratorioUpdateInput = z.infer<typeof laboratorioUpdateSchema>

export const laboratorioSetAtivoSchema = z.object({ id: z.number().int().positive(), ativo: z.boolean() })
export type LaboratorioSetAtivoInput = z.infer<typeof laboratorioSetAtivoSchema>

export const laboratorioExcluirSchema = z.object({
  id: z.number().int().positive(),
  motivo: z.string().trim().max(200).optional().nullable()
})
export type LaboratorioExcluirInput = z.infer<typeof laboratorioExcluirSchema>

export const laboratoriosListQuerySchema = z.object({
  busca: z.string().trim().optional(),
  /** Padrao: so os ativos (o que a OS oferece). A tela de cadastro pede todos. */
  apenasAtivos: z.boolean().optional()
})
export type LaboratoriosListQuery = z.infer<typeof laboratoriosListQuerySchema>

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

/** Filtro do painel gerencial: periodo (com o atalho usado, que decide como comparar), comparacao e vendedor. */
export const dashboardQuerySchema = z
  .object({
    dataInicio: z.string().trim(),
    dataFim: z.string().trim(),
    preset: z.enum(PRESETS_PERIODO).default('personalizado'),
    comparar: z.boolean().default(true),
    vendedorId: z.number().int().positive().optional()
  })
  .superRefine((q, ctx) => {
    const erro = validarPeriodo({ inicio: q.dataInicio, fim: q.dataFim })
    if (erro) ctx.addIssue({ code: 'custom', message: erro, path: ['dataInicio'] })
  })
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>

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

export const migracaoImportarSchema = z.object({
  conexao: migracaoConexaoSchema,
  aprovacoes: z.object({
    mesclarDuplicados: z.boolean(),
    removerCpfConflitante: z.boolean(),
    removerRegistrosVazios: z.boolean()
  })
})
export type MigracaoImportarInput = z.infer<typeof migracaoImportarSchema>

export const pendenciasListQuerySchema = z.object({
  status: z.enum(['ABERTA', 'RESOLVIDA', 'IGNORADA']).optional(),
  tipo: z.enum(TIPOS_PENDENCIA).optional()
})
export type PendenciasListQuery = z.infer<typeof pendenciasListQuerySchema>

export const pendenciasResumoQuerySchema = z.object({ status: z.enum(['ABERTA', 'RESOLVIDA', 'IGNORADA']).default('ABERTA') })
export type PendenciasResumoQuery = z.infer<typeof pendenciasResumoQuerySchema>

export const pendenciaCorrigirDatasSchema = z.object({
  id: z.number().int().positive(),
  alteracoes: z
    .array(z.object({ campo: z.enum(CAMPOS_DATA_EXAME), data: z.string().trim().length(10, 'Informe a data') }))
    .max(CAMPOS_DATA_EXAME.length),
  /** Fecha a pendencia depois de salvar. Sem isso ela continua aberta, para corrigir outras datas do mesmo exame. */
  concluir: z.boolean()
})
export type PendenciaCorrigirDatasInput = z.infer<typeof pendenciaCorrigirDatasSchema>

export const encerrarOsAntigasSchema = z.object({ data: z.string().trim().length(10, 'Informe a data de entrega') })
export type EncerrarOsAntigasInput = z.infer<typeof encerrarOsAntigasSchema>

export const pendenciaIdsSchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(2000) })
export type PendenciaIdsInput = z.infer<typeof pendenciaIdsSchema>

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
    'categoria_despesa',
    'unidade_medida',
    'indice_refracao',
    'tipo_armacao'
  ])
})
export type ListaValorTipoInput = z.infer<typeof listaValorTipoSchema>

// Unidades de medida do produto (cadastro proprio: sigla + descricao)

const descricaoUnidade = z
  .string()
  .trim()
  .min(1, 'Informe a descrição da unidade')
  .max(30, 'A descrição tem no máximo 30 caracteres')
  .transform((v) => v.toLocaleUpperCase('pt-BR'))

export const unidadeMedidaInputSchema = z.object({
  sigla: z
    .string()
    .trim()
    .min(1, 'Informe a sigla da unidade')
    .max(6, 'A sigla tem no máximo 6 caracteres')
    .regex(/^[\p{L}\p{N}]+$/u, 'A sigla só pode ter letras e números, sem espaço nem ponto')
    .transform((v) => v.toLocaleUpperCase('pt-BR')),
  descricao: descricaoUnidade
})
export type UnidadeMedidaInput = z.infer<typeof unidadeMedidaInputSchema>

/** So a descricao muda: a sigla fica gravada nos produtos. */
export const unidadeMedidaUpdateSchema = z.object({
  id: z.number().int().positive(),
  descricao: descricaoUnidade
})
export type UnidadeMedidaUpdateInput = z.infer<typeof unidadeMedidaUpdateSchema>

export const unidadeMedidaSetAtivoSchema = z.object({
  id: z.number().int().positive(),
  ativo: z.boolean()
})
export type UnidadeMedidaSetAtivoInput = z.infer<typeof unidadeMedidaSetAtivoSchema>

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

export const resultadosRelacionamentoSchema = z.object({ dias: z.union([z.literal(30), z.literal(90)]) })
export type ResultadosRelacionamentoInput = z.infer<typeof resultadosRelacionamentoSchema>

const modeloMensagem = z.string().trim().min(1, 'A mensagem não pode ficar vazia').max(700, 'Mensagem longa demais (máximo 700 caracteres)')
export const modelosMensagemSchema = z.object({
  RETIRADA: modeloMensagem,
  COBRANCA: modeloMensagem,
  ANIVERSARIO: modeloMensagem,
  POS_VENDA: modeloMensagem,
  RENOVACAO: modeloMensagem
})
export type ModelosMensagemInput = z.infer<typeof modelosMensagemSchema>
