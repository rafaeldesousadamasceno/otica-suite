import { handleIpc } from './handle'
import {
  IPC,
  ordemServicoCreateSchema,
  ordemServicoAvancarSchema,
  ordemServicoCancelarSchema,
  ordemServicoAtualizarDatasSchema,
  ordensServicoQuerySchema,
  receitaListByClienteSchema,
  idSchema
} from '@shared/ipc'
import { ordemServicoService } from '@main/services/ordemServicoService'

export function registerOrdensServicoIpc(): void {
  handleIpc(IPC.ordensServico.list, ordensServicoQuerySchema, (input) => ordemServicoService.listar(input))
  handleIpc(IPC.ordensServico.get, idSchema, (input) => ordemServicoService.buscarPorId(input.id))
  handleIpc(IPC.ordensServico.listByCliente, receitaListByClienteSchema, (input) =>
    ordemServicoService.listarPorCliente(input.clienteId)
  )
  handleIpc(IPC.ordensServico.create, ordemServicoCreateSchema, (input) => ordemServicoService.criar(input))
  handleIpc(IPC.ordensServico.avancarSituacao, ordemServicoAvancarSchema, (input) =>
    ordemServicoService.avancar(input.id, input.data?.trim() || null)
  )
  handleIpc(IPC.ordensServico.cancelar, ordemServicoCancelarSchema, (input) =>
    ordemServicoService.cancelar(input)
  )
  handleIpc(IPC.ordensServico.atualizarDatas, ordemServicoAtualizarDatasSchema, (input) =>
    ordemServicoService.atualizarDados(input)
  )
  handleIpc(IPC.ordensServico.protocoloSaida, ordensServicoQuerySchema, (input) =>
    ordemServicoService.protocoloSaida(input)
  )
}
