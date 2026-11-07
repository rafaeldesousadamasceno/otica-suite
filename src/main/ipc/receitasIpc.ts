import { handleIpc } from './handle'
import { IPC, receitaListByClienteSchema, receitaOpticaAtualizarSchema, receitaOpticaInputSchema } from '@shared/ipc'
import { receitaOpticaService } from '@main/services/receitaOpticaService'

export function registerReceitasIpc(): void {
  handleIpc(IPC.receitas.listByCliente, receitaListByClienteSchema, (input) =>
    receitaOpticaService.listarPorCliente(input.clienteId)
  )
  handleIpc(IPC.receitas.create, receitaOpticaInputSchema, (input) =>
    receitaOpticaService.criar(input)
  )
  handleIpc(IPC.receitas.update, receitaOpticaAtualizarSchema, (input) =>
    receitaOpticaService.atualizar(input)
  )
}
