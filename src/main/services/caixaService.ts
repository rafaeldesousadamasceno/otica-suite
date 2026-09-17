import { caixaRepository } from '@main/repositories/caixaRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import { Errors } from '@main/errors'
import type { CaixaAberto, CaixaResumo } from '@shared/types'
import type { CaixaAbrirInput, CaixaFecharInput, CaixaMovimentoInput } from '@shared/ipc'

/** RF-11.3: caixa e exclusivo do Administrador (recurso `financeiro_caixa`). */
export const caixaService = {
  atual(): CaixaAberto | null {
    requirePermissao('financeiro_caixa', 'ver')
    const aberto = caixaRepository.buscarAberto()
    if (!aberto) return null

    return {
      id: aberto.id,
      dataAbertura: aberto.dataAbertura,
      saldoInicialCentavos: aberto.saldoInicialCentavos,
      usuarioAberturaNome: aberto.usuarioAberturaNome,
      saldoEsperadoCentavos: caixaRepository.calcularSaldoEsperado(aberto.dataAbertura, aberto.saldoInicialCentavos)
    }
  },

  listarHistorico(): CaixaResumo[] {
    requirePermissao('financeiro_caixa', 'ver')
    return caixaRepository.listarHistorico()
  },

  abrir(input: CaixaAbrirInput): CaixaAberto {
    const sessao = requirePermissao('financeiro_caixa', 'criar')

    if (caixaRepository.buscarAberto()) {
      throw Errors.validacao('Já existe um caixa aberto. Feche o caixa atual antes de abrir outro.')
    }

    const novoId = caixaRepository.abrir(input.saldoInicialCentavos, sessao.usuario.id)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'ABRIR_CAIXA',
      entidade: 'caixa',
      entidadeId: novoId,
      valorNovo: input
    })

    return this.atual()!
  },

  fechar(input: CaixaFecharInput): CaixaResumo {
    const sessao = requirePermissao('financeiro_caixa', 'editar')

    const aberto = caixaRepository.buscarAberto()
    if (!aberto) throw Errors.validacao('Não há caixa aberto para fechar.')

    const saldoEsperadoCentavos = caixaRepository.calcularSaldoEsperado(aberto.dataAbertura, aberto.saldoInicialCentavos)

    caixaRepository.fechar(aberto.id, input.saldoContadoCentavos, sessao.usuario.id)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'FECHAR_CAIXA',
      entidade: 'caixa',
      entidadeId: aberto.id,
      valorNovo: { saldoEsperadoCentavos, saldoContadoCentavos: input.saldoContadoCentavos }
    })

    const historico = this.listarHistorico()
    return historico.find((c) => c.id === aberto.id) ?? historico[0]
  },

  sangria(input: CaixaMovimentoInput): CaixaAberto {
    const sessao = requirePermissao('financeiro_caixa', 'editar')

    const aberto = caixaRepository.buscarAberto()
    if (!aberto) throw Errors.validacao('Abra o caixa antes de registrar uma sangria.')

    caixaRepository.registrarMovimento('DESPESA', 'SANGRIA', input.valorCentavos, `Sangria - ${input.motivo}`, sessao.usuario.id)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'SANGRIA',
      entidade: 'caixa',
      entidadeId: aberto.id,
      valorNovo: input
    })

    return this.atual()!
  },

  suprimento(input: CaixaMovimentoInput): CaixaAberto {
    const sessao = requirePermissao('financeiro_caixa', 'editar')

    const aberto = caixaRepository.buscarAberto()
    if (!aberto) throw Errors.validacao('Abra o caixa antes de registrar um suprimento.')

    caixaRepository.registrarMovimento('RECEITA', 'SUPRIMENTO', input.valorCentavos, `Suprimento - ${input.motivo}`, sessao.usuario.id)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'SUPRIMENTO',
      entidade: 'caixa',
      entidadeId: aberto.id,
      valorNovo: input
    })

    return this.atual()!
  }
}
