import { handleIpc } from './handle'
import {
  IPC,
  idSchema,
  migracaoConexaoSchema,
  migracaoImportarSchema,
  encerrarOsAntigasSchema,
  pendenciaCorrigirDatasSchema,
  pendenciaIdsSchema,
  pendenciasListQuerySchema,
  pendenciasResumoQuerySchema
} from '@shared/ipc'
import { migracaoService } from '@main/services/migracaoService'
import { migracaoPendenciaService } from '@main/services/migracaoPendenciaService'

export function registerMigracaoIpc(): void {
  handleIpc(IPC.migracao.testarConexao, migracaoConexaoSchema, (input) => migracaoService.testarConexao(input))
  handleIpc(IPC.migracao.analisar, migracaoConexaoSchema, (input) => migracaoService.analisar(input))
  handleIpc(IPC.migracao.importar, migracaoImportarSchema, (input) => migracaoService.importar(input))
  handleIpc(IPC.migracao.pendenciasListar, pendenciasListQuerySchema, (input) => migracaoPendenciaService.listar(input))
  handleIpc(IPC.migracao.pendenciasResumo, pendenciasResumoQuerySchema, (input) => migracaoPendenciaService.resumo(input.status))
  handleIpc(IPC.migracao.pendenciaAplicar, idSchema, (input) => migracaoPendenciaService.aplicarSugestao(input.id))
  handleIpc(IPC.migracao.pendenciaResolver, idSchema, (input) => migracaoPendenciaService.resolver(input.id))
  handleIpc(IPC.migracao.pendenciaReabrir, idSchema, (input) => migracaoPendenciaService.reabrir(input.id))
  handleIpc(IPC.migracao.pendenciaIgnorar, idSchema, (input) => migracaoPendenciaService.ignorar(input.id))
  handleIpc(IPC.migracao.pendenciaCorrigirDatas, pendenciaCorrigirDatasSchema, (input) => migracaoPendenciaService.corrigirDatas(input))
  handleIpc(IPC.migracao.osAntigasAbertas, null, () => migracaoService.osAntigasAbertas())
  handleIpc(IPC.migracao.encerrarOsAntigas, encerrarOsAntigasSchema, (input) => migracaoService.encerrarOsAntigasAbertas(input.data))
  handleIpc(IPC.migracao.pendenciaDetalhes, idSchema, (input) => migracaoPendenciaService.detalhes(input.id))
  handleIpc(IPC.migracao.pendenciaDatasAtuais, idSchema, (input) => migracaoPendenciaService.datasAtuais(input.id))
  handleIpc(IPC.migracao.pendenciasAplicarVarias, pendenciaIdsSchema, (input) => migracaoPendenciaService.aplicarVarias(input.ids))
  handleIpc(IPC.migracao.pendenciasIgnorarVarias, pendenciaIdsSchema, (input) => migracaoPendenciaService.ignorarVarias(input.ids))
}
