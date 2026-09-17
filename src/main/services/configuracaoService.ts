import { configuracaoRepository } from '@main/repositories/configuracaoRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import type { ConfiguracaoOperacional } from '@shared/types'
import type { ConfiguracaoOperacionalInput } from '@shared/ipc'

function obterOperacional(): ConfiguracaoOperacional {
  return {
    limiteDescontoVendedorPct: configuracaoRepository.obterNumero('limite_desconto_vendedor_pct', 10),
    comissaoPadraoPct: configuracaoRepository.obterNumero('comissao_padrao_pct', 0),
    diasGarantia: configuracaoRepository.obterNumero('dias_garantia', 90),
    sessaoExpiraMinutos: configuracaoRepository.obterNumero('sessao_expira_minutos', 30),
    prefixoOS: configuracaoRepository.obter('prefixo_os') ?? '',
    estoqueBloqueiaVendaSemSaldo: configuracaoRepository.obter('estoque_bloqueia_venda_sem_saldo') === '1'
  }
}

/**
 * RF-01/RF-08 CA2: opcoes operacionais que ate aqui so existiam na tabela
 * `configuracao`, sem nenhuma tela para edita-las (o dono da otica teria
 * que mexer direto no banco). Uma unica tela edita todas de uma vez.
 */
export const configuracaoService = {
  obterOperacional(): ConfiguracaoOperacional {
    requirePermissao('configuracoes', 'ver')
    return obterOperacional()
  },

  atualizarOperacional(input: ConfiguracaoOperacionalInput): ConfiguracaoOperacional {
    const sessao = requirePermissao('configuracoes', 'editar')

    configuracaoRepository.definir('limite_desconto_vendedor_pct', String(input.limiteDescontoVendedorPct))
    configuracaoRepository.definir('comissao_padrao_pct', String(input.comissaoPadraoPct))
    configuracaoRepository.definir('dias_garantia', String(input.diasGarantia))
    configuracaoRepository.definir('sessao_expira_minutos', String(input.sessaoExpiraMinutos))
    configuracaoRepository.definir('prefixo_os', input.prefixoOS ?? '')
    configuracaoRepository.definir('estoque_bloqueia_venda_sem_saldo', input.estoqueBloqueiaVendaSemSaldo ? '1' : '0')

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'ATUALIZAR',
      entidade: 'configuracao',
      valorNovo: input
    })

    return obterOperacional()
  }
}
