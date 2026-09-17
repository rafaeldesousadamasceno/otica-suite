import { vendaRepository } from '@main/repositories/vendaRepository'
import { clienteRepository } from '@main/repositories/clienteRepository'
import { ordemServicoRepository } from '@main/repositories/ordemServicoRepository'
import { configuracaoRepository } from '@main/repositories/configuracaoRepository'
import { saldoAtualProduto } from '@main/repositories/estoqueRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import { resolverAutorizador } from '@main/auth/autorizacaoPontual'
import { possuiPermissao } from '@shared/permissions'
import { Errors } from '@main/errors'
import type { VendaDetalhada, VendaResumo } from '@shared/types'
import type { VendaCancelarInput, VendaCreateInput, VendasListQuery } from '@shared/ipc'

function calcularTotais(input: VendaCreateInput) {
  const subtotalCentavos = input.itens.reduce((soma, item) => soma + item.quantidade * item.precoUnitarioCentavos, 0)
  const descontoItens = input.itens.reduce((soma, item) => soma + item.descontoCentavos, 0)
  const descontoCentavos = descontoItens + input.descontoAdicionalCentavos
  const totalCentavos = subtotalCentavos - descontoCentavos
  const descontoPct = subtotalCentavos > 0 ? (descontoCentavos / subtotalCentavos) * 100 : 0
  return { subtotalCentavos, descontoCentavos, totalCentavos, descontoPct }
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

    if (input.ordemServicoId) {
      const os = ordemServicoRepository.buscarPorId(input.ordemServicoId)
      if (!os || os.clienteId !== input.clienteId) {
        throw Errors.validacao('A Ordem de Serviço selecionada não pertence a este cliente.')
      }
    }

    const { subtotalCentavos, descontoCentavos, totalCentavos, descontoPct } = calcularTotais(input)

    if (totalCentavos < 0) {
      throw Errors.validacao('O desconto não pode ser maior que o total da venda.')
    }

    const somaPagamentos = input.pagamentos.reduce((s, p) => s + p.valorCentavos, 0)
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
      subtotalCentavos,
      descontoCentavos,
      totalCentavos,
      comissaoPercentual
    })

    // Nunca loga a credencial de autorizacao no rastro de auditoria.
    const { autorizacaoAdmin: _credencial, ...inputSemCredencial } = input
    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      autorizadoPorId,
      acao: 'CRIAR',
      entidade: 'venda',
      entidadeId: vendaId,
      valorNovo: inputSemCredencial
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
  }
}
