import { vendaRepository, type PagamentoResolvido } from '@main/repositories/vendaRepository'
import { clienteRepository } from '@main/repositories/clienteRepository'
import { ordemServicoRepository } from '@main/repositories/ordemServicoRepository'
import { receitaOpticaRepository } from '@main/repositories/receitaOpticaRepository'
import { configuracaoRepository } from '@main/repositories/configuracaoRepository'
import { formaPagamentoRepository } from '@main/repositories/formaPagamentoRepository'
import { bandeiraRepository } from '@main/repositories/bandeiraRepository'
import { saldoAtualProduto } from '@main/repositories/estoqueRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import { resolverAutorizador, exigirSenhaDoProprioAdmin } from '@main/auth/autorizacaoPontual'
import { possuiPermissao } from '@shared/permissions'
import { calcularPagamento, calcularTotaisVenda, comportamentoDoTipo, type BandeiraConfig } from '@shared/vendaCalculo'
import { hojeLocal } from '@shared/data'
import { Errors } from '@main/errors'
import type { PreviaExclusaoVenda, VendaDetalhada, VendaResumo } from '@shared/types'
import type { VendaCancelarInput, VendaCreateInput, VendaExcluirInput, VendasListQuery } from '@shared/ipc'

/**
 * Resolve cada linha de pagamento: busca a forma (e a bandeira, no cartao) no CADASTRO e calcula tudo de novo.
 * O que veio da tela (alem da escolha da forma, da bandeira, das parcelas e do valor) nunca e usado.
 */
function resolverPagamentos(input: VendaCreateInput, dataVenda: string): PagamentoResolvido[] {
  return input.pagamentos.map((p) => {
    const forma = formaPagamentoRepository.configParaVenda(p.formaPagamentoId)
    if (!forma) throw Errors.validacao('A forma de pagamento escolhida não existe mais ou está inativa. Escolha outra.')

    let bandeira: BandeiraConfig | null = null
    if (comportamentoDoTipo(forma.tipo) === 'OPERADORA' && p.bandeiraId) {
      bandeira = bandeiraRepository.configParaVenda(p.bandeiraId)
      if (!bandeira) throw Errors.validacao('A bandeira escolhida não existe mais ou está inativa. Escolha outra.')
    }

    const r = calcularPagamento({ forma, valorCentavos: p.valorCentavos, parcelas: p.parcelas, bandeira }, dataVenda)
    if (!r.ok) throw Errors.validacao(r.erro)
    return { forma: { id: forma.id, nome: forma.nome, tipo: forma.tipo }, calculado: r.pagamento }
  })
}

export const vendaService = {
  listar(query: VendasListQuery): VendaResumo[] {
    const sessao = requirePermissao('vendas', 'ver')
    // RF-10, CA4: vendedor ve so as proprias vendas - nao e uma opcao de
    // filtro, e uma restricao que o proprio service impoe, ignorando
    // qualquer coisa que o renderer tenha mandado.
    const todas = vendaRepository.listar(query)
    if (sessao.usuario.perfil === 'admin') return todas
    return todas.filter((v) => v.vendedorId === sessao.usuario.id)
  },

  listarPorCliente(clienteId: number): VendaResumo[] {
    const sessao = requirePermissao('vendas', 'ver')
    const todas = vendaRepository.listarPorCliente(clienteId)
    if (sessao.usuario.perfil === 'admin') return todas
    return todas.filter((v) => v.vendedorId === sessao.usuario.id)
  },

  buscarPorId(id: number): VendaDetalhada {
    const sessao = requirePermissao('vendas', 'ver')
    const venda = vendaRepository.buscarPorId(id)
    if (!venda) throw Errors.naoEncontrado('Venda')
    if (sessao.usuario.perfil !== 'admin' && venda.vendedorId !== sessao.usuario.id) {
      throw Errors.semPermissao()
    }
    return venda
  },

  async criar(input: VendaCreateInput): Promise<VendaDetalhada> {
    const sessao = requirePermissao('vendas', 'criar')

    if (!clienteRepository.buscarPorId(input.clienteId)) {
      throw Errors.naoEncontrado('Cliente')
    }

    if (input.receitaOpticaId) {
      const receita = receitaOpticaRepository.buscarPorId(input.receitaOpticaId)
      if (!receita || receita.clienteId !== input.clienteId) {
        throw Errors.validacao('A prescrição selecionada não existe mais ou não pertence a este cliente.')
      }
    }

    if (input.ordemServicoId) {
      const os = ordemServicoRepository.buscarPorId(input.ordemServicoId)
      if (!os || os.clienteId !== input.clienteId) {
        throw Errors.validacao('A Ordem de Serviço selecionada não pertence a este cliente.')
      }
    }

    // Os totais saem da funcao pura de shared/vendaCalculo (a mesma da tela): o servidor nunca usa o total que a tela mostrou.
    const totais = calcularTotaisVenda(input.itens, input.descontoAdicional)
    if (!totais.ok) throw Errors.validacao(totais.erro)
    const { subtotalCentavos, descontoCentavos, descontoAdicionalCentavos, totalCentavos, descontoPct } = totais

    const dataVenda = hojeLocal()
    const pagamentos = resolverPagamentos(input, dataVenda)

    const somaPagamentos = pagamentos.reduce((s, p) => s + p.calculado.valorCentavos, 0)
    if (somaPagamentos !== totalCentavos) {
      throw Errors.validacao(
        `A soma dos pagamentos (${somaPagamentos}) precisa ser igual ao total da venda (${totalCentavos}).`
      )
    }

    // RN-07 e RF-08 CA2: motivos que exigem autorizacao pontual de Admin
    // (RF-03.4) - uma so autorizacao cobre todos os motivos desta venda,
    // nunca uma por item.
    const motivosAutorizacao: string[] = []

    const limitePct = configuracaoRepository.obterNumero('limite_desconto_vendedor_pct', 10)
    const semLimite = possuiPermissao(sessao.usuario.perfil, 'vendas.desconto_sem_limite', 'ver')
    if (descontoPct > limitePct && !semLimite) {
      motivosAutorizacao.push(`desconto de ${descontoPct.toFixed(1)}% acima do limite de ${limitePct}%`)
    }

    // RF-08, CA2: quando ligada, a configuracao "bloqueia venda sem saldo"
    // nao bloqueia de fato a venda - exige autorizacao de Admin (mesmo
    // mecanismo de RN-07). Na pratica isso cobre os dois modos do texto do
    // PRD ("bloqueado ou exige autorizacao"): um Vendedor sozinho, sem
    // Admin por perto, fica de fato impedido de vender sem saldo.
    if (configuracaoRepository.obter('estoque_bloqueia_venda_sem_saldo') === '1') {
      for (const item of input.itens) {
        const produto = vendaRepository.buscarProdutoParaVenda(item.produtoId)
        if (produto && produto.categoria !== 'servico') {
          const saldo = saldoAtualProduto(item.produtoId)
          if (saldo - item.quantidade < 0) {
            motivosAutorizacao.push(`estoque insuficiente para "${produto.descricao}" (saldo: ${saldo})`)
          }
        }
      }
    }

    let autorizadoPorId: number | null = null
    if (motivosAutorizacao.length > 0) {
      autorizadoPorId = await resolverAutorizador(
        sessao,
        input.autorizacaoAdmin,
        `Esta venda precisa de autorização de um administrador: ${motivosAutorizacao.join('; ')}.`
      )
    }

    const comissaoPercentual = configuracaoRepository.obterNumero('comissao_padrao_pct', 0)

    const vendaId = vendaRepository.criar(input, {
      vendedorId: sessao.usuario.id,
      autorizadoPorId,
      dataVenda,
      subtotalCentavos,
      descontoCentavos,
      descontoAdicional: input.descontoAdicional,
      descontoAdicionalCentavos,
      totalCentavos,
      comissaoPercentual,
      pagamentos
    })

    // Nunca loga a credencial de autorizacao no rastro de auditoria.
    const { autorizacaoAdmin: _credencial, ...inputSemCredencial } = input
    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      autorizadoPorId,
      acao: 'CRIAR',
      entidade: 'venda',
      entidadeId: vendaId,
      valorNovo: { ...inputSemCredencial, pagamentosCalculados: pagamentos.map((p) => ({ forma: p.forma.nome, ...p.calculado })) }
    })

    return vendaRepository.buscarPorId(vendaId)!
  },

  /**
   * RN-11 / RF-10 CA4: qualquer um cancela a propria venda; a de outro
   * vendedor so o Admin. 'vendas.cancelar' na matriz so autoriza o Admin a
   * fazer isso sem credencial extra (mesmo esquema booleano de
   * 'vendas.desconto_sem_limite') - o Vendedor sempre passa pela
   * autorizacao pontual do RF-03.4.
   */
  async cancelar(input: VendaCancelarInput): Promise<VendaDetalhada> {
    const sessao = requirePermissao('vendas', 'ver')
    const venda = vendaRepository.buscarPorId(input.id)
    if (!venda) throw Errors.naoEncontrado('Venda')
    if (sessao.usuario.perfil !== 'admin' && venda.vendedorId !== sessao.usuario.id) {
      throw Errors.semPermissao()
    }
    if (venda.situacao === 'CANCELADA') {
      throw Errors.validacao('Esta venda já está cancelada.')
    }

    const podeCancelarDireto = possuiPermissao(sessao.usuario.perfil, 'vendas.cancelar', 'ver')
    let autorizadoPorId: number | null = null
    if (!podeCancelarDireto) {
      autorizadoPorId = await resolverAutorizador(
        sessao,
        input.autorizacaoAdmin,
        'Cancelar uma venda exige autorização de um administrador.'
      )
    }

    vendaRepository.cancelar(input.id, { usuarioId: sessao.usuario.id })

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      autorizadoPorId,
      acao: 'CANCELAR',
      entidade: 'venda',
      entidadeId: input.id,
      valorAnterior: { situacao: venda.situacao },
      valorNovo: { situacao: 'CANCELADA' }
    })

    return vendaRepository.buscarPorId(input.id)!
  },

  /**
   * 9.6: o que a tela precisa para perguntar antes de excluir: a venda e a lista de bloqueios (vazia = confirmacao
   * normal; com itens = so passa com a senha do Administrador).
   */
  exclusaoPrevia(id: number): PreviaExclusaoVenda {
    requirePermissao('vendas', 'excluir')
    const venda = vendaRepository.buscarPorId(id)
    if (!venda) throw Errors.naoEncontrado('Venda')
    return {
      vendaId: venda.id,
      numero: venda.numero,
      clienteNome: venda.clienteNome,
      totalCentavos: venda.totalCentavos,
      situacao: venda.situacao,
      bloqueios: vendaRepository.bloqueiosExclusao(id)
    }
  },

  /**
   * 9.6: exclusao logica da venda (so o Administrador), tudo numa transacao. Se houver parcela ja paga, recebivel
   * ja baixado, pagamento a vista ou OS ligada, o servidor RECUSA a menos que o Administrador digite a PROPRIA
   * senha (mesmo logado: a confirmacao e digitada, nao so um clique). O que ja entrou no caixa e estornado
   * com um lancamento compensatorio, como no cancelamento.
   */
  async excluir(input: VendaExcluirInput): Promise<void> {
    const sessao = requirePermissao('vendas', 'excluir')
    const venda = vendaRepository.buscarPorId(input.id)
    if (!venda) throw Errors.naoEncontrado('Venda')

    const bloqueios = vendaRepository.bloqueiosExclusao(input.id)
    let autorizadoPorId: number | null = null
    if (bloqueios.length > 0) {
      autorizadoPorId = await exigirSenhaDoProprioAdmin(
        sessao,
        input.autorizacaoAdmin,
        `A venda ${venda.numero} não pode ser excluída sem a sua senha de Administrador: ${bloqueios.map((b) => b.descricao).join(' ')}`
      )
    }

    const motivo = input.motivo?.trim() || null
    vendaRepository.excluir(input.id, { usuarioId: sessao.usuario.id, motivo })

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      autorizadoPorId,
      acao: 'EXCLUIR',
      entidade: 'venda',
      entidadeId: input.id,
      valorAnterior: { numero: venda.numero, cliente: venda.clienteNome, totalCentavos: venda.totalCentavos, situacao: venda.situacao },
      valorNovo: { motivo, bloqueiosLiberados: bloqueios.map((b) => b.descricao) }
    })
  }
}
