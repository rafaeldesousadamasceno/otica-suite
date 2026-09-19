import { shell } from 'electron'
import { handleIpc } from './handle'
import { IPC, aceitaContatoSchema, contatoMarcarSchema, contatoRefSchema, modelosMensagemSchema } from '@shared/ipc'
import { relacionamentoService } from '@main/services/relacionamentoService'
import { Errors } from '@main/errors'

export function registerRelacionamentoIpc(): void {
  handleIpc(IPC.relacionamento.listar, null, () => relacionamentoService.listar())
  handleIpc(IPC.relacionamento.semContato, null, () => relacionamentoService.semContato())

  handleIpc(IPC.relacionamento.abrirWhatsapp, contatoRefSchema, async (input) => {
    const url = relacionamentoService.linkWhatsapp(input)
    // Defesa em profundidade: so este destino pode ser aberto pelo sistema operacional, aconteca o que acontecer.
    if (!url.startsWith('https://wa.me/')) throw Errors.validacao('Link inválido.')
    await shell.openExternal(url)
    return null
  })

  handleIpc(IPC.relacionamento.marcarContatado, contatoMarcarSchema, (input) => {
    relacionamentoService.marcarContatado(input)
    return null
  })
  handleIpc(IPC.relacionamento.definirAceitaContato, aceitaContatoSchema, (input) => {
    relacionamentoService.definirAceitaContato(input)
    return null
  })

  handleIpc(IPC.relacionamento.modelosObter, null, () => relacionamentoService.modelosObter())
  handleIpc(IPC.relacionamento.modelosSalvar, modelosMensagemSchema, (input) => {
    relacionamentoService.modelosSalvar(input)
    return null
  })
}
