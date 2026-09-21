import { relacionamentoRepository } from '@main/repositories/relacionamentoRepository'
import { configuracaoRepository } from '@main/repositories/configuracaoRepository'
import { empresaRepository } from '@main/repositories/empresaRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import { Errors } from '@main/errors'
import { MOTIVOS_CONTATO } from '@shared/types'
import { montarLinkWhatsapp, normalizarCelularBR, preencherModelo } from '@shared/whatsapp'
import type { ClienteSemContato, ContatoPendente, ModelosMensagem, MotivoContato } from '@shared/types'
import type { AceitaContatoInput, ContatoMarcarInput, ContatoRefInput, ModelosMensagemInput } from '@shared/ipc'
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
