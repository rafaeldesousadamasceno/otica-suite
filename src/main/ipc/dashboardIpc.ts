import { handleIpc } from './handle'
import { IPC, dashboardQuerySchema } from '@shared/ipc'
import { dashboardService } from '@main/services/dashboardService'

export function registerDashboardIpc(): void {
  handleIpc(IPC.dashboard.get, dashboardQuerySchema, (input) => dashboardService.obter(input))
}
