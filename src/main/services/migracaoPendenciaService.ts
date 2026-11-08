import { requirePermissao } from '@main/auth/session'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { migracaoPendenciaRepository } from '@main/repositories/migracaoPendenciaRepository'
import * as migracaoRepository from '@main/repositories/migracaoRepository'
import { analisarDatasExame, dataValidaOuNull } from '@main/migracao/analisar'
import { Errors } from '@main/errors'
import { hojeLocal } from '@shared/data'
import { ROTULO_CAMPO_DATA, type CampoDataExame, type DetalhesExamePendencia, type Pendencia, type StatusPendencia, type TipoPendencia } from '@shared/importacao'
import type { PendenciaCorrigirDatasInput, PendenciasListQuery } from '@shared/ipc'

function obter(id: number): Pendencia {
  const p = migracaoPendenciaRepository.buscarPorId(id)
  if (!p) throw Errors.naoEncontrado('Pendência')
  return p
}

function usuarioId(sessao: { usuario: { id: number } }): number {
  return sessao.usuario.id
}

/** Aplica a data sugerida de uma pendencia. Lanca erro se nao der; devolve nada se deu. */
function aplicarSugestaoDe(p: Pendencia, uid: number): void {
  const { campo, sugerido } = p.dados ?? {}
  const tiposComSugestao: TipoPendencia[] = ['DATA_INCOERENTE', 'DATA_AUSENTE', 'DATA_INVALIDA']

  if (p.status !== 'ABERTA' || !tiposComSugestao.includes(p.tipo) || !campo || !sugerido || p.destinoId === null) {
    throw Errors.validacao('Esta pendência não tem uma correção automática para aplicar.')
  }

  const jaAlterada = Errors.conflito(
    'A data deste registro já foi alterada depois da importação. Confira o cadastro e, se estiver certo, marque a pendência como resolvida.'
  )
  const gravada = migracaoRepository.datasAtuaisDoExame(p.destinoId)
  let atual: string | null
  if (p.tipo === 'DATA_INCOERENTE') {
    // So corrige se a data ainda e a que a analise viu.
    atual = p.dados?.atual ?? null
    if (!atual || gravada[campo] !== atual) throw jaAlterada
  } else {
    // Data ausente ou invalida: o que esta gravado e um valor de reserva da importacao (data da venda, a de hoje ou um valor
    // que nem e data). Se alguem ja informou uma data real diferente disso, nao sobrescreve.
    atual = gravada[campo]
    const ehReserva = atual === null || dataValidaOuNull(atual) === null || atual === gravada.data_venda || atual === p.criadoEm.slice(0, 10)
    if (!ehReserva) throw jaAlterada
  }
  if (!migracaoRepository.aplicarCorrecaoData(p.destinoId, campo, atual, sugerido)) throw jaAlterada

  migracaoPendenciaRepository.definirStatus(p.id, 'RESOLVIDA', uid)
  auditoriaRepository.registrar({
    usuarioId: uid,
    acao: 'CORRIGIR_DATA_IMPORTADA',
    entidade: 'venda',
    entidadeId: p.destinoId,
    valorAnterior: { campo, data: atual },
    valorNovo: { campo, data: sugerido, pendenciaId: p.id }
  })
}

/** Pendencias da importacao: o que o administrador precisa conferir, corrigir ou dispensar. */
export const migracaoPendenciaService = {
  listar(query: PendenciasListQuery): Pendencia[] {
    requirePermissao('migracao', 'ver')
    return migracaoPendenciaRepository.listar({ status: query.status, tipo: query.tipo })
  },

  /** Quantas ha de cada tipo na situacao pedida (para os filtros da tela). */
  resumo(status: StatusPendencia): Partial<Record<TipoPendencia, number>> {
    requirePermissao('migracao', 'ver')
    return migracaoPendenciaRepository.contarPorTipo(status)
  },

  /** Aplica a data sugerida: corrige tudo o que foi gravado a partir dela, com auditoria. */
  aplicarSugestao(id: number): void {
    const sessao = requirePermissao('migracao', 'editar')
    aplicarSugestaoDe(obter(id), usuarioId(sessao))
  },

  /** Aplica de uma vez as datas sugeridas das pendencias listadas. As que nao der (ja alteradas, sem sugestao) ficam como estao. */
  aplicarVarias(ids: number[]): { aplicadas: number; puladas: number } {
    const sessao = requirePermissao('migracao', 'editar')
    let aplicadas = 0
    let puladas = 0
    for (const id of ids) {
      const p = migracaoPendenciaRepository.buscarPorId(id)
      try {
        if (!p) throw new Error('inexistente')
        aplicarSugestaoDe(p, usuarioId(sessao))
        aplicadas++
      } catch {
        puladas++
      }
    }
    return { aplicadas, puladas }
  },

  /** Cliente, item, laboratorio e datas gravadas do exame: o suficiente para saber que data informar. */
  detalhes(id: number): DetalhesExamePendencia {
    requirePermissao('migracao', 'ver')
    const p = obter(id)
    const detalhes = p.destinoTabela === 'venda' && p.destinoId !== null ? migracaoRepository.detalhesDoExame(p.destinoId) : null
    if (!detalhes) throw Errors.validacao('Esta pendência não está ligada a um exame importado.')
    return detalhes
  },

  /** Datas do exame como estao hoje no sistema (para a tela mostrar antes de o administrador corrigir). */
  datasAtuais(id: number): Record<CampoDataExame, string | null> {
    requirePermissao('migracao', 'ver')
    const p = obter(id)
    if (p.destinoId === null) throw Errors.validacao('Esta pendência não está ligada a um exame importado.')
    return migracaoRepository.datasAtuaisDoExame(p.destinoId)
  },

  /**
   * O administrador informa a data certa de uma ou mais datas do exame. Salvar
   * NAO fecha a pendencia (a nao ser que peca para concluir): assim da para
   * corrigir uma data, ver o que ainda esta errado e corrigir as outras.
   * Depois de gravar, confere as datas de novo e devolve o que ainda parece errado.
   */
  corrigirDatas(input: PendenciaCorrigirDatasInput): { aplicadas: number; avisos: string[]; resolvida: boolean } {
    const sessao = requirePermissao('migracao', 'editar')
    const p = obter(input.id)
    if (!p.tipo.startsWith('DATA_') || p.status !== 'ABERTA' || p.destinoId === null) {
      throw Errors.validacao('Esta pendência não é de data ou já foi tratada.')
    }
    if (input.alteracoes.length === 0 && !input.concluir) throw Errors.validacao('Nenhuma data foi alterada.')

    // Valida tudo antes de gravar qualquer uma: ou entram todas, ou nenhuma.
    const gravadas = migracaoRepository.datasAtuaisDoExame(p.destinoId)
    const hoje = hojeLocal()
    const aplicar: { campo: CampoDataExame; atual: string | null; nova: string }[] = []
    const vistos = new Set<CampoDataExame>()
    for (const { campo, data } of input.alteracoes) {
      if (vistos.has(campo)) throw Errors.validacao('A mesma data foi informada duas vezes.')
      vistos.add(campo)
      const nova = dataValidaOuNull(data)
      if (!nova) throw Errors.validacao(`A ${ROTULO_CAMPO_DATA[campo]} informada não é uma data válida (e não pode ser anterior a 1990).`)
      if (nova > hoje) throw Errors.validacao(`A ${ROTULO_CAMPO_DATA[campo]} não pode estar no futuro.`)
      if (gravadas[campo] === nova) continue // nao mudou
      aplicar.push({ campo, atual: gravadas[campo], nova })
    }

    for (const { campo, atual, nova } of aplicar) {
      migracaoRepository.aplicarCorrecaoData(p.destinoId, campo, atual, nova)
      auditoriaRepository.registrar({
        usuarioId: usuarioId(sessao),
        acao: 'CORRIGIR_DATA_IMPORTADA',
        entidade: 'venda',
        entidadeId: p.destinoId,
        valorAnterior: { campo, data: atual },
        valorNovo: { campo, data: nova, pendenciaId: p.id }
      })
    }

    // Confere de novo, com as datas como ficaram, e conta ao administrador o que ainda parece errado.
    const depois = analisarDatasExame(p.origemId, migracaoRepository.datasAtuaisDoExame(p.destinoId), hoje)
    const restantes = depois.pendencias.filter((x) => x.tipo === 'DATA_INCOERENTE' || x.tipo === 'DATA_INVALIDA')
    const incoerencia = restantes.find((x) => x.tipo === 'DATA_INCOERENTE')
    if (incoerencia) migracaoPendenciaRepository.registrar(incoerencia, { tabela: 'venda', id: p.destinoId })

    if (input.concluir) migracaoPendenciaRepository.definirStatus(p.id, 'RESOLVIDA', usuarioId(sessao))
    return { aplicadas: aplicar.length, avisos: restantes.map((x) => x.motivo), resolvida: input.concluir }
  },

  /** O administrador conferiu e esta tudo certo (ou ja corrigiu a mao). */
  resolver(id: number): void {
    const sessao = requirePermissao('migracao', 'editar')
    obter(id)
    migracaoPendenciaRepository.definirStatus(id, 'RESOLVIDA', usuarioId(sessao))
  },

  /** Nao vai ser tratada: some da lista de abertas e nao volta numa nova importacao. */
  ignorar(id: number): void {
    const sessao = requirePermissao('migracao', 'editar')
    obter(id)
    migracaoPendenciaRepository.definirStatus(id, 'IGNORADA', usuarioId(sessao))
  },

  /** Devolve para a lista de abertas uma pendencia que foi ignorada ou resolvida, para tratar depois. */
  reabrir(id: number): void {
    const sessao = requirePermissao('migracao', 'editar')
    const p = obter(id)
    if (p.status === 'ABERTA') throw Errors.validacao('Esta pendência já está aberta.')
    migracaoPendenciaRepository.reabrir(id)
    auditoriaRepository.registrar({
      usuarioId: usuarioId(sessao),
      acao: 'REABRIR_PENDENCIA_IMPORTACAO',
      entidade: 'migracao_pendencia',
      entidadeId: id,
      valorAnterior: { status: p.status },
      valorNovo: { status: 'ABERTA' }
    })
  },

  ignorarVarias(ids: number[]): { ignoradas: number } {
    const sessao = requirePermissao('migracao', 'editar')
    let ignoradas = 0
    for (const id of ids) {
      const p = migracaoPendenciaRepository.buscarPorId(id)
      if (p?.status === 'ABERTA') {
        migracaoPendenciaRepository.definirStatus(id, 'IGNORADA', usuarioId(sessao))
        ignoradas++
      }
    }
    return { ignoradas }
  }
}
