import { handleIpc } from './handle'
import { IPC, idSchema, ordensServicoQuerySchema } from '@shared/ipc'
import { requirePermissao } from '@main/auth/session'
import { ordemServicoRepository } from '@main/repositories/ordemServicoRepository'
import { receitaOpticaRepository } from '@main/repositories/receitaOpticaRepository'
import { ordemServicoService } from '@main/services/ordemServicoService'
import { empresaService } from '@main/services/empresaService'
import { gerarESalvarPdf } from '@main/relatorios/pdf'
import { montarHtmlOrdemServico } from '@main/relatorios/ordemServicoHtml'
import { montarHtmlProtocoloSaida } from '@main/relatorios/protocoloSaidaHtml'
import { Errors } from '@main/errors'

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
    return gerarESalvarPdf(html, `Protocolo-de-Saida-${new Date().toISOString().slice(0, 10)}.pdf`)
  })
}
