import { handleIpc } from './handle'
import {
  IPC,
  idSchema,
  ordensServicoQuerySchema,
  aniversariantesQuerySchema,
  periodoQuerySchema,
  estoqueListQuerySchema
} from '@shared/ipc'
import { requirePermissao } from '@main/auth/session'
import { ordemServicoRepository } from '@main/repositories/ordemServicoRepository'
import { receitaOpticaRepository } from '@main/repositories/receitaOpticaRepository'
import { ordemServicoService } from '@main/services/ordemServicoService'
import { vendaService } from '@main/services/vendaService'
import { clienteService } from '@main/services/clienteService'
import { contaReceberService } from '@main/services/contaReceberService'
import { financeiroService } from '@main/services/financeiroService'
import { listarComSaldo } from '@main/repositories/estoqueRepository'
import { relatorioRepository } from '@main/repositories/relatorioRepository'
import { empresaService } from '@main/services/empresaService'
import { gerarESalvarPdf } from '@main/relatorios/pdf'
import { montarHtmlOrdemServico } from '@main/relatorios/ordemServicoHtml'
import { montarHtmlProtocoloSaida } from '@main/relatorios/protocoloSaidaHtml'
import { montarHtmlComprovanteVenda, montarHtmlCarneParcelas } from '@main/relatorios/vendaHtml'
import { montarHtmlAniversariantes } from '@main/relatorios/aniversariantesHtml'
import {
  montarHtmlReceitasDespesas,
  montarHtmlFluxoCaixa,
  montarHtmlLucroPrejuizo,
  montarHtmlInadimplencia
} from '@main/relatorios/financeiroHtml'
import { montarHtmlEstoque, calcularCurvaAbc, montarHtmlCurvaAbc } from '@main/relatorios/estoqueHtml'
import { montarHtmlVendasPorVendedor, montarHtmlRankingVendedores, montarHtmlComissoes } from '@main/relatorios/vendedoresHtml'
import { Errors } from '@main/errors'
import { hojeLocal } from '@shared/data'

const dataHojeSufixo = (): string => hojeLocal()

export function registerRelatoriosIpc(): void {
  handleIpc(IPC.relatorios.ordemServico, idSchema, async (input) => {
    requirePermissao('ordens_servico', 'ver')
    const os = ordemServicoRepository.buscarPorId(input.id)
    if (!os) throw Errors.naoEncontrado('Ordem de Serviço')
    const receita = os.receitaOpticaId ? receitaOpticaRepository.buscarPorId(os.receitaOpticaId) : null
    const empresa = empresaService.get()
    const html = montarHtmlOrdemServico(os, receita, empresa)
    return gerarESalvarPdf(html, `OS-${os.numero}.pdf`)
  })

  handleIpc(IPC.relatorios.protocoloSaida, ordensServicoQuerySchema, async (input) => {
    // A permissao 'protocolo_saida'/'ver' ja e checada dentro do proprio
    // ordemServicoService.protocoloSaida - reusar o mesmo entry point da
    // tela garante que a impressao nunca mostra mais do que a tela mostra
    // (RN: "Vendedor so ve o que pode").
    const itens = ordemServicoService.protocoloSaida(input)
    const empresa = empresaService.get()
    const html = montarHtmlProtocoloSaida(itens, empresa, {
      dataInicio: input.dataInicio,
      dataFim: input.dataFim,
      situacao: input.situacao
    })
    return gerarESalvarPdf(html, `Protocolo-de-Saida-${dataHojeSufixo()}.pdf`)
  })

  handleIpc(IPC.relatorios.comprovanteVenda, idSchema, async (input) => {
    // vendaService.buscarPorId ja restringe "vendedor so ve a propria venda".
    const venda = vendaService.buscarPorId(input.id)
    const empresa = empresaService.get()
    const html = montarHtmlComprovanteVenda(venda, empresa)
    return gerarESalvarPdf(html, `Comprovante-Venda-${venda.numero}.pdf`)
  })

  handleIpc(IPC.relatorios.carneParcelas, idSchema, async (input) => {
    const venda = vendaService.buscarPorId(input.id)
    const empresa = empresaService.get()
    const html = montarHtmlCarneParcelas(venda, empresa)
    return gerarESalvarPdf(html, `Carne-Parcelas-${venda.numero}.pdf`)
  })

  handleIpc(IPC.relatorios.aniversariantes, aniversariantesQuerySchema, async (input) => {
    const clientes = clienteService.aniversariantes(input.mes)
    const empresa = empresaService.get()
    const html = montarHtmlAniversariantes(clientes, empresa, input.mes)
    return gerarESalvarPdf(html, `Aniversariantes-${dataHojeSufixo()}.pdf`)
  })

  handleIpc(IPC.relatorios.receitasDespesas, periodoQuerySchema, async (input) => {
    const resultado = financeiroService.fluxoCaixa(input)
    const empresa = empresaService.get()
    const html = montarHtmlReceitasDespesas(resultado, empresa, input)
    return gerarESalvarPdf(html, `Receitas-e-Despesas-${dataHojeSufixo()}.pdf`)
  })

  handleIpc(IPC.relatorios.fluxoCaixa, periodoQuerySchema, async (input) => {
    const resultado = financeiroService.fluxoCaixa(input)
    const empresa = empresaService.get()
    const html = montarHtmlFluxoCaixa(resultado, empresa, input)
    return gerarESalvarPdf(html, `Fluxo-de-Caixa-${dataHojeSufixo()}.pdf`)
  })

  handleIpc(IPC.relatorios.lucroPrejuizo, periodoQuerySchema, async (input) => {
    const resultado = financeiroService.lucroPrejuizo(input)
    const empresa = empresaService.get()
    const html = montarHtmlLucroPrejuizo(resultado, empresa, input)
    return gerarESalvarPdf(html, `Lucro-Prejuizo-${dataHojeSufixo()}.pdf`)
  })

  handleIpc(IPC.relatorios.inadimplencia, null, async () => {
    const parcelas = contaReceberService.listar({ apenasVencidas: true })
    const empresa = empresaService.get()
    const html = montarHtmlInadimplencia(parcelas, empresa)
    return gerarESalvarPdf(html, `Inadimplencia-${dataHojeSufixo()}.pdf`)
  })

  handleIpc(IPC.relatorios.posicaoEstoque, estoqueListQuerySchema, async (input) => {
    requirePermissao('estoque', 'ver')
    const itens = listarComSaldo(input)
    const empresa = empresaService.get()
    const html = montarHtmlEstoque('Posição de Estoque', itens, empresa)
    return gerarESalvarPdf(html, `Posicao-Estoque-${dataHojeSufixo()}.pdf`)
  })

  handleIpc(IPC.relatorios.produtosAbaixoMinimo, null, async () => {
    requirePermissao('estoque', 'ver')
    const itens = listarComSaldo({ busca: '', categoria: '', situacao: 'abaixo_minimo' })
    const empresa = empresaService.get()
    const html = montarHtmlEstoque('Produtos Abaixo do Mínimo', itens, empresa)
    return gerarESalvarPdf(html, `Produtos-Abaixo-Minimo-${dataHojeSufixo()}.pdf`)
  })

  handleIpc(IPC.relatorios.curvaAbc, periodoQuerySchema, async (input) => {
    requirePermissao('relatorios_gerenciais', 'ver')
    const margem = financeiroService.lucroPrejuizo(input).margemPorProduto
    const curva = calcularCurvaAbc(margem)
    const empresa = empresaService.get()
    const html = montarHtmlCurvaAbc(curva, empresa, input)
    return gerarESalvarPdf(html, `Curva-ABC-${dataHojeSufixo()}.pdf`)
  })

  handleIpc(IPC.relatorios.vendasPorVendedor, periodoQuerySchema, async (input) => {
    requirePermissao('relatorios_gerenciais', 'ver')
    const itens = relatorioRepository.vendasPorVendedor(input.dataInicio, input.dataFim)
    const empresa = empresaService.get()
    const html = montarHtmlVendasPorVendedor(itens, empresa, input)
    return gerarESalvarPdf(html, `Vendas-por-Vendedor-${dataHojeSufixo()}.pdf`)
  })

  handleIpc(IPC.relatorios.rankingVendedores, periodoQuerySchema, async (input) => {
    requirePermissao('relatorios_gerenciais', 'ver')
    const itens = relatorioRepository.rankingVendedores(input.dataInicio, input.dataFim)
    const empresa = empresaService.get()
    const html = montarHtmlRankingVendedores(itens, empresa, input)
    return gerarESalvarPdf(html, `Ranking-Vendedores-${dataHojeSufixo()}.pdf`)
  })

  handleIpc(IPC.relatorios.comissoes, periodoQuerySchema, async (input) => {
    // RF-12: admin ve as comissoes de todos; vendedor sem 'comissoes.todas' ve so as proprias.
    const sessao = requirePermissao('vendas', 'ver')
    const vendedorId = sessao.usuario.perfil === 'admin' ? null : sessao.usuario.id
    const itens = relatorioRepository.comissoes(input.dataInicio, input.dataFim, vendedorId)
    const empresa = empresaService.get()
    const html = montarHtmlComissoes(itens, empresa, input)
    return gerarESalvarPdf(html, `Comissoes-${dataHojeSufixo()}.pdf`)
  })
}
