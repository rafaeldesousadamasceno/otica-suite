import { handleIpc } from './handle'
import { IPC, usuarioCreateSchema, usuarioSetAtivoSchema, usuarioResetSenhaSchema } from '@shared/ipc'
import { usuarioService } from '@main/services/usuarioService'

export function registerUsuariosIpc(): void {
  handleIpc(IPC.usuarios.list, null, () => usuarioService.listar())
  handleIpc(IPC.usuarios.create, usuarioCreateSchema, (input) => usuarioService.criar(input))
  handleIpc(IPC.usuarios.setAtivo, usuarioSetAtivoSchema, (input) =>
    usuarioService.setAtivo(input.id, input.ativo)
  )
  handleIpc(IPC.usuarios.resetSenha, usuarioResetSenhaSchema, (input) =>
    usuarioService.resetarSenha(input.id, input.novaSenha)
  )
}
