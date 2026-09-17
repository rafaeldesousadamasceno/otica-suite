import { dashboardRepository } from '@main/repositories/dashboardRepository'
import { requireSessao } from '@main/auth/session'
import type { DashboardData } from '@shared/types'

/**
 * RF-14: sem recurso de permissao dedicado - qualquer usuario logado ve o
 * proprio dashboard. O formato (admin x vendedor) e decidido aqui pelo
 * perfil da sessao, nunca pelo que o renderer pede.
 */
export const dashboardService = {
  obter(): DashboardData {
    const sessao = requireSessao()
    if (sessao.usuario.perfil === 'admin') {
      return { perfil: 'admin', dados: dashboardRepository.obterAdmin() }
    }
    return { perfil: 'vendedor', dados: dashboardRepository.obterVendedor(sessao.usuario.id) }
  }
}
