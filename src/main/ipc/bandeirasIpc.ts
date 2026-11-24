import { handleIpc } from './handle'
import {
  IPC,
  bandeiraExcluirSchema,
  bandeiraInputSchema,
  bandeiraSetAtivoSchema,
  bandeiraUpdateSchema,
  bandeirasListQuerySchema
} from '@shared/ipc'
import { bandeiraService } from '@main/services/bandeiraService'

export function registerBandeirasIpc(): void {
  handleIpc(IPC.bandeiras.list, bandeirasListQuerySchema, (input) => bandeiraService.listar(input))
  handleIpc(IPC.bandeiras.create, bandeiraInputSchema, (input) => bandeiraService.criar(input))
  handleIpc(IPC.bandeiras.update, bandeiraUpdateSchema, (input) => bandeiraService.atualizar(input.id, input.dados))
  handleIpc(IPC.bandeiras.setAtivo, bandeiraSetAtivoSchema, (input) => bandeiraService.setAtivo(input.id, input.ativo))
  handleIpc(IPC.bandeiras.excluir, bandeiraExcluirSchema, (input) => bandeiraService.excluir(input))
}
