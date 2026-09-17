import { listaValorRepository } from '@main/repositories/listaValorRepository'
import { requireSessao } from '@main/auth/session'
import type { ListaValorItem, TipoListaValor } from '@shared/types'

export const listaValorService = {
  listarPorTipo(tipo: TipoListaValor): ListaValorItem[] {
    requireSessao()
    return listaValorRepository.listarPorTipo(tipo)
  }
}
