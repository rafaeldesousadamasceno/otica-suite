import { handleIpc } from './handle'
import { IPC, unidadeMedidaInputSchema, unidadeMedidaSetAtivoSchema, unidadeMedidaUpdateSchema } from '@shared/ipc'
import { unidadeMedidaService } from '@main/services/unidadeMedidaService'

export function registerUnidadesMedidaIpc(): void {
  handleIpc(IPC.unidadesMedida.list, null, () => unidadeMedidaService.listar())
  handleIpc(IPC.unidadesMedida.create, unidadeMedidaInputSchema, (input) => unidadeMedidaService.criar(input))
  handleIpc(IPC.unidadesMedida.update, unidadeMedidaUpdateSchema, (input) => unidadeMedidaService.atualizar(input))
  handleIpc(IPC.unidadesMedida.setAtivo, unidadeMedidaSetAtivoSchema, (input) =>
    unidadeMedidaService.setAtivo(input.id, input.ativo)
  )
}
