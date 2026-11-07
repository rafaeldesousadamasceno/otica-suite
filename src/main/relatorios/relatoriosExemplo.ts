import type {
  ClienteResumo,
  ContaReceber,
  Empresa,
  EstoqueItem,
  FluxoCaixaResultado,
  LancamentoEntry,
  LucroPrejuizoResultado,
  OrdemServico,
  RankingVendedorItem,
  ReceitaOptica,
  VendaDetalhada
} from '@shared/types'
import type { ComissaoRelatorioItem, VendasPorVendedorItem } from '@main/repositories/relatorioRepository'

/**
 * Dados de exemplo dos relatorios. Usados so pelos testes e pela conferencia
 * visual dos PDFs - nada do app importa este arquivo.
 */

export const EMPRESA_EXEMPLO: Empresa = {
  nomeFantasia: 'MD Óculos',
  razaoSocial: 'MD Óculos LTDA',
  cnpj: '12.345.678/0001-90',
  ie: null,
  logradouro: 'Rua das Flores',
  numero: '120',
  complemento: null,
  bairro: 'Centro',
  cidade: 'Fortaleza',
  uf: 'CE',
  cep: '60000-000',
  telefone: '(85) 3333-4444',
  whatsapp: '(85) 99999-0000',
  email: 'contato@mdoculos.com',
  site: null,
  logoPath: null,
  logoFormato: 'quadrado',
  corDestaque: '#0D6A70',
  tema: 'claro'
}

export const PERIODO_EXEMPLO = { dataInicio: '2026-10-01', dataFim: '2026-10-31' }

const LANCAMENTOS: LancamentoEntry[] = [
  { id: 1, tipo: 'RECEITA', categoria: 'VENDA', descricao: 'Venda 2026-00001', valorCentavos: 45000, data: '2026-10-02' },
  { id: 2, tipo: 'DESPESA', categoria: 'ALUGUEL', descricao: 'Aluguel de outubro', valorCentavos: 180000, data: '2026-10-05' },
  { id: 3, tipo: 'RECEITA', categoria: 'VENDA', descricao: 'Venda 2026-00002', valorCentavos: 129990, data: '2026-10-12' },
  { id: 4, tipo: 'DESPESA', categoria: 'COMPRA', descricao: 'Compra de lentes <Lab & Cia>', valorCentavos: 62050, data: '2026-10-20' },
  { id: 5, tipo: 'RECEITA', categoria: 'VENDA', descricao: 'Venda 2026-00003', valorCentavos: 210000, data: '2026-10-28' }
]

export const FLUXO_EXEMPLO: FluxoCaixaResultado = {
  totalReceitasCentavos: 384990,
  totalDespesasCentavos: 242050,
  saldoCentavos: 142940,
  lancamentos: LANCAMENTOS
}

export const LUCRO_EXEMPLO: LucroPrejuizoResultado = {
  caixa: { receitasCentavos: 384990, despesasCentavos: 242050, resultadoCentavos: 142940, despesasPorCategoria: [] },
  competencia: { receitasCentavos: 410000, despesasCentavos: 450000, resultadoCentavos: -40000, despesasPorCategoria: [] },
  margemPorProduto: [
    { produtoId: 1, descricao: 'Armação Ray-Ban RB5154', categoria: 'armacao', quantidadeVendida: 3, receitaCentavos: 180000, custoCentavos: 90000, margemCentavos: 90000 },
    { produtoId: 2, descricao: 'Lente multifocal Varilux', categoria: 'lente', quantidadeVendida: 2, receitaCentavos: 160000, custoCentavos: 70000, margemCentavos: 90000 },
    { produtoId: 3, descricao: 'Estojo rígido', categoria: 'acessorio', quantidadeVendida: 10, receitaCentavos: 25000, custoCentavos: 8000, margemCentavos: 17000 },
    { produtoId: 4, descricao: 'Ajuste de armação', categoria: 'servico', quantidadeVendida: 4, receitaCentavos: 6000, custoCentavos: 0, margemCentavos: 6000 }
  ]
}

function parcela(id: number, cliente: string, venda: string, vencimento: string, valor: number, recebido = 0): ContaReceber {
  return {
    id,
    vendaId: id,
    vendaNumero: venda,
    clienteId: id,
    clienteNome: cliente,
    vendedorId: 2,
    vendedorNome: 'Beto Souza',
    parcela: 2,
    totalParcelas: 5,
    valorCentavos: valor,
    valorRecebidoCentavos: recebido,
    vencimento,
    situacao: 'ABERTA',
    vencida: true
  }
}

export const INADIMPLENCIA_EXEMPLO: ContaReceber[] = [
  parcela(1, 'Maria Aparecida Souza', '2026-00010', '2026-10-30', 25000),
  parcela(2, 'José Carlos Lima', '2026-00011', '2026-09-20', 40000, 10000),
  parcela(3, 'Ana Paula Ribeiro', '2026-00012', '2026-07-01', 15000)
]

export const ESTOQUE_EXEMPLO: EstoqueItem[] = [
  { produtoId: 1, descricao: 'Armação Ray-Ban RB5154', categoria: 'armacao', marca: 'Ray-Ban', unidade: 'UN', saldo: 4, estoqueMinimo: 2, ativo: true },
  { produtoId: 2, descricao: 'Lente CR-39 1.56', categoria: 'lente', marca: null, unidade: 'PAR', saldo: 1, estoqueMinimo: 5, ativo: true },
  { produtoId: 3, descricao: 'Cordão para óculos', categoria: 'acessorio', marca: 'Genérico', unidade: 'UN', saldo: 0, estoqueMinimo: 3, ativo: true }
]

export const VENDAS_VENDEDOR_EXEMPLO: VendasPorVendedorItem[] = [
  { vendedorId: 2, vendedorNome: 'Beto Souza', quantidadeVendas: 12, totalCentavos: 845000 },
  { vendedorId: 3, vendedorNome: 'Cida Moraes', quantidadeVendas: 7, totalCentavos: 512300 }
]

export const RANKING_EXEMPLO: RankingVendedorItem[] = [
  { vendedorId: 2, vendedorNome: 'Beto Souza', totalCentavos: 845000 },
  { vendedorId: 3, vendedorNome: 'Cida Moraes', totalCentavos: 512300 },
  { vendedorId: 4, vendedorNome: 'Davi Nunes', totalCentavos: 98000 }
]

export const COMISSOES_EXEMPLO: ComissaoRelatorioItem[] = [
  { vendaId: 1, vendaNumero: '2026-00001', vendedorId: 2, vendedorNome: 'Beto Souza', data: '2026-10-02', baseCentavos: 45000, percentual: 5, valorCentavos: 2250, situacao: 'LIBERADA' },
  { vendaId: 2, vendaNumero: '2026-00002', vendedorId: 3, vendedorNome: 'Cida Moraes', data: '2026-10-12', baseCentavos: 129990, percentual: 5, valorCentavos: 6500, situacao: 'PROVISIONADA' },
  { vendaId: 3, vendaNumero: '2026-00003', vendedorId: 2, vendedorNome: 'Beto Souza', data: '2026-10-15', baseCentavos: 30000, percentual: 5, valorCentavos: 1500, situacao: 'CANCELADA' }
]

export const ANIVERSARIANTES_EXEMPLO: ClienteResumo[] = [
  { id: 1, nome: 'Maria Aparecida Souza', celular: '(85) 99999-0000', cpf: null, dataNasc: '1980-11-03' },
  { id: 2, nome: 'José Carlos Lima', celular: null, cpf: '123.456.789-00', dataNasc: '1975-11-21' }
]

export const OS_EXEMPLO: OrdemServico = {
  id: 1,
  numero: '2026-00042',
  clienteId: 1,
  clienteNome: 'Maria Aparecida Souza',
  clienteCelular: '(85) 99999-0000',
  receitaOpticaId: 2,
  receitaTipoLente: 'MULTIFOCAL',
  laboratorio: 'Lab Visão',
  situacao: 'LABORATÓRIO',
  dataAbertura: '2026-11-05',
  dataEnvio: '2026-11-06',
  dataPrevisao: '2026-11-12',
  dataChegada: null,
  dataEntrega: null,
  observacao: 'Cliente prefere retirar à tarde.',
  atrasada: false
}

export const RECEITA_EXEMPLO: ReceitaOptica = {
  id: 2,
  clienteId: 1,
  profissionalId: 1,
  profissionalNome: 'Joana Lima',
  dataExame: '2026-11-05',
  longeOdEsf: -1.25,
  longeOdCil: -0.5,
  longeOdEixo: 90,
  longeOdDnp: 31.5,
  longeOdDp: 32,
  longeOeEsf: -1.5,
  longeOeCil: -0.75,
  longeOeEixo: 85,
  longeOeDnp: 32,
  longeOeDp: 31.5,
  pertoOdEsf: 0.75,
  pertoOdCil: -0.5,
  pertoOdEixo: 90,
  pertoOdDnp: 30,
  pertoOdDp: 30.5,
  pertoOeEsf: 0.5,
  pertoOeCil: -0.75,
  pertoOeEixo: 85,
  pertoOeDnp: 30.5,
  pertoOeDp: 30,
  adicao: 2,
  altura: 18,
  tipoLente: 'MULTIFOCAL',
  tratamentos: 'ANTIRREFLEXO',
  armacao: 'ACETATO PRETA',
  observacao: null,
  versao: 2,
  criadoEm: '2026-11-05'
}

export const VENDA_EXEMPLO: VendaDetalhada = {
  id: 7,
  numero: '2026-00007',
  clienteId: 1,
  clienteNome: 'Maria Aparecida Souza',
  vendedorId: 2,
  vendedorNome: 'Beto Souza',
  data: '2026-11-05',
  totalCentavos: 120000,
  situacao: 'CONCLUIDA',
  subtotalCentavos: 130000,
  descontoCentavos: 10000,
  receitaOpticaId: 2,
  autorizadoPorNome: null,
  itens: [
    { id: 1, produtoId: 1, descricao: 'Armação Ray-Ban RB5154', quantidade: 1, precoUnitarioCentavos: 60000, descontoCentavos: 0, totalCentavos: 60000 },
    { id: 2, produtoId: 2, descricao: 'Lente multifocal Varilux', quantidade: 1, precoUnitarioCentavos: 70000, descontoCentavos: 0, totalCentavos: 70000 }
  ],
  pagamentos: [
    { id: 1, formaPagamento: 'ENTRADA', valorCentavos: 20000, parcelas: 1 },
    { id: 2, formaPagamento: 'PROMISSÓRIA', valorCentavos: 100000, parcelas: 4 }
  ],
  parcelas: ['2026-12-05', '2027-01-05', '2027-02-05', '2027-03-05'].map((vencimento, i) => ({
    id: i + 1,
    vendaId: 7,
    vendaNumero: '2026-00007',
    clienteId: 1,
    clienteNome: 'Maria Aparecida Souza',
    vendedorId: 2,
    vendedorNome: 'Beto Souza',
    parcela: i + 1,
    totalParcelas: 4,
    valorCentavos: 25000,
    valorRecebidoCentavos: i === 0 ? 25000 : 0,
    vencimento,
    situacao: i === 0 ? ('PAGA' as const) : ('ABERTA' as const),
    vencida: false
  })),
  comissao: { percentual: 5, valorCentavos: 6000, situacao: 'PROVISIONADA' }
}
