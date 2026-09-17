import { handleIpc } from './handle'
import { IPC } from '@shared/ipc'
import { dashboardService } from '@main/services/dashboardService'

export function registerDashboardIpc(): void {
  handleIpc(IPC.dashboard.get, null, () => dashboardService.obter())
}
