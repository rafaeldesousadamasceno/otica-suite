import { relacionamentoRepository } from '@main/repositories/relacionamentoRepository'
import { configuracaoRepository } from '@main/repositories/configuracaoRepository'
import { empresaRepository } from '@main/repositories/empresaRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import { AppError, Errors } from '@main/errors'
import { JANELA_CONTATADOS_DIAS, MOTIVOS_CONTATO } from '@shared/types'
import { montarLinkWhatsapp, normalizarCelularBR, preencherModelo } from '@shared/whatsapp'
import type { ClienteSemContato, ContatoFeito, ContatoPendente, ModelosMensagem, MotivoContato, ResultadosRelacionamento } from '@shared/types'
import type {
  AceitaContatoInput,
  ContatoDesfazerInput,
  ContatoMarcarInput,
  ContatoRefInput,
  ModelosMensagemInput,
  ResultadosRelacionamentoInput
} from '@shared/ipc'
import { hojeLocal } from '@shared/data'

function hoje(): string {
  return hojeLocal()
}

function chaveModelo(motivo: MotivoContato): string {
  return `relacionamento_msg_${motivo.toLowerCase()}`
}

/** Sem `variaveis` - a tela nao precisa dos dados crus da mensagem. */
function paraTela({ variaveis: _variaveis, ...pendente }: ReturnType<typeof relacionamentoRepository.listarPendentes>[number]): ContatoPendente {
  return pendente
}

/**
 * Relacionamento: quem chamar hoje + atalho para o WhatsApp do proprio usuario.
 * Nao envia nada, nao recebe nada: so abre a conversa com a mensagem pronta e
 * registra que o contato foi feito. O link e sempre montado AQUI, a partir de
 * ids - a tela nunca informa uma URL.
 */
export const relacionamentoService = {
  listar(): ContatoPendente[] {
    requirePermissao('relacionamento', 'ver')
    return relacionamentoRepository.listarPendentes(hoje()).map(paraTela)
  },

  semContato(): ClienteSemContato[] {
    requirePermissao('relacionamento', 'ver')
    return relacionamentoRepository.listarSemContato()
  },

  /** Administrador: o que aconteceu depois dos contatos feitos nos ultimos 30/90 dias (traz valores em R$). */
  resultados(input: ResultadosRelacionamentoInput): ResultadosRelacionamento {
    requirePermissao('relacionamento.resultados', 'ver')
    return relacionamentoRepository.resultados(hoje(), input.dias)
  },

  /** Devolve o link `https://wa.me/...` com a mensagem do motivo ja preenchida. */
  linkWhatsapp(ref: ContatoRefInput): string {
    requirePermissao('relacionamento', 'criar')

    const item = relacionamentoRepository
      .listarPendentes(hoje())
      .find((p) => p.clienteId === ref.clienteId && p.motivo === ref.motivo && p.referencia === ref.referencia)
    if (!item) throw Errors.conflito('Este contato não está mais pendente. Atualize a lista.')

    const numero = normalizarCelularBR(item.celular)
    if (!numero) {
      throw Errors.validacao('Este cliente não tem um celular válido cadastrado. Corrija o cadastro para usar o WhatsApp.')
    }

    const otica = empresaRepository.get()?.nomeFantasia ?? ''
    const modelo = configuracaoRepository.obter(chaveModelo(item.motivo)) ?? ''
    return montarLinkWhatsapp(numero, preencherModelo(modelo, { ...item.variaveis, otica }))
  },

  marcarContatado(input: ContatoMarcarInput): void {
    const sessao = requirePermissao('relacionamento', 'criar')
    const registrou = relacionamentoRepository.registrarContato({
      clienteId: input.clienteId,
      motivo: input.motivo,
      referencia: input.referencia,
      observacao: input.observacao?.trim() || null,
      usuarioId: sessao.usuario.id
    })
    if (!registrou) return

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'REGISTRAR_CONTATO',
      entidade: 'cliente',
      entidadeId: input.clienteId,
      valorNovo: { motivo: input.motivo, referencia: input.referencia, observacao: input.observacao ?? null }
    })
  },

  /** Contatos marcados nos ultimos JANELA_CONTATADOS_DIAS dias (todos os usuarios), mais recentes primeiro. */
  contatados(): ContatoFeito[] {
    const sessao = requirePermissao('relacionamento', 'ver')
    // `criado_em` e UTC 'AAAA-MM-DD HH:MM:SS': o corte tem que estar no mesmo formato para comparar como texto.
    const desde = new Date(Date.now() - JANELA_CONTATADOS_DIAS * 86_400_000).toISOString().slice(0, 19).replace('T', ' ')
    return relacionamentoRepository.listarContatados(desde).map(({ usuarioId, ...c }) => ({
      ...c,
      podeDesfazer: sessao.usuario.perfil === 'admin' || usuarioId === sessao.usuario.id
    }))
  },

  /** Remove a marcacao de contato: a pessoa volta para a lista de pendentes (se a ocorrencia ainda valer). */
  desfazerContato(input: ContatoDesfazerInput): void {
    const sessao = requirePermissao('relacionamento', 'criar')
    const contato = relacionamentoRepository.buscarContato(input.id)
    if (!contato) throw Errors.naoEncontrado('Contato')
    // Vendedor so desfaz o que ele mesmo marcou; contato antigo sem usuario so o Administrador desfaz.
    if (sessao.usuario.perfil !== 'admin' && contato.usuarioId !== sessao.usuario.id) throw new AppError('SEM_PERMISSAO', 'Você só pode desfazer os contatos que você mesmo marcou.')
    if (!relacionamentoRepository.removerContato(input.id)) throw Errors.naoEncontrado('Contato')

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'DESFAZER_CONTATO',
      entidade: 'contato',
      entidadeId: contato.id,
      valorAnterior: {
        clienteId: contato.clienteId,
        motivo: contato.motivo,
        referencia: contato.referencia,
        observacao: contato.observacao,
        usuarioId: contato.usuarioId,
        criadoEm: contato.criadoEm
      }
    })
  },

  definirAceitaContato(input: AceitaContatoInput): void {
    const sessao = requirePermissao('relacionamento', 'editar')
    if (!relacionamentoRepository.definirAceitaContato(input.clienteId, input.aceita)) {
      throw Errors.naoEncontrado('Cliente')
    }
    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'ALTERAR_CONTATO_CLIENTE',
      entidade: 'cliente',
      entidadeId: input.clienteId,
      valorNovo: { aceitaContato: input.aceita }
    })
  },

  modelosObter(): ModelosMensagem {
    requirePermissao('relacionamento.modelos', 'ver')
    return Object.fromEntries(
      MOTIVOS_CONTATO.map((m) => [m, configuracaoRepository.obter(chaveModelo(m)) ?? ''])
    ) as ModelosMensagem
  },

  modelosSalvar(input: ModelosMensagemInput): void {
    const sessao = requirePermissao('relacionamento.modelos', 'editar')
    const anterior = Object.fromEntries(MOTIVOS_CONTATO.map((m) => [m, configuracaoRepository.obter(chaveModelo(m))]))
    for (const motivo of MOTIVOS_CONTATO) configuracaoRepository.definir(chaveModelo(motivo), input[motivo])

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'ALTERAR_MODELOS_MENSAGEM',
      entidade: 'configuracao',
      valorAnterior: anterior,
      valorNovo: input
    })
  }
}
