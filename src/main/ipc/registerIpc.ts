import { registerBootstrapIpc } from './bootstrapIpc'
import { registerAuthIpc } from './authIpc'
import { registerEmpresaIpc } from './empresaIpc'
import { registerUsuariosIpc } from './usuariosIpc'
import { registerClientesIpc } from './clientesIpc'
import { registerReceitasIpc } from './receitasIpc'
import { registerOrdensServicoIpc } from './ordensServicoIpc'
import { registerProdutosIpc } from './produtosIpc'
import { registerVendasIpc } from './vendasIpc'
import { registerContasReceberIpc } from './contasReceberIpc'
import { registerFornecedoresIpc } from './fornecedoresIpc'
import { registerComprasIpc } from './comprasIpc'
import { registerEstoqueIpc } from './estoqueIpc'
import { registerContasPagarIpc } from './contasPagarIpc'
import { registerConfiguracaoIpc } from './configuracaoIpc'
import { registerFinanceiroIpc } from './financeiroIpc'
import { registerDashboardIpc } from './dashboardIpc'
import { registerBackupIpc } from './backupIpc'
import { registerLicencaIpc } from './licencaIpc'
import { registerMigracaoIpc } from './migracaoIpc'
import { registerCaixaIpc } from './caixaIpc'
import { registerRelatoriosIpc } from './relatoriosIpc'
import { registerListasValorIpc } from './listasValorIpc'
import { registerAuditoriaIpc } from './auditoriaIpc'
import { registerSistemaIpc } from './sistemaIpc'

export function registerAllIpc(): void {
  registerBootstrapIpc()
  registerAuthIpc()
  registerEmpresaIpc()
  registerUsuariosIpc()
  registerClientesIpc()
  registerReceitasIpc()
  registerOrdensServicoIpc()
  registerProdutosIpc()
  registerVendasIpc()
  registerContasReceberIpc()
  registerFornecedoresIpc()
  registerComprasIpc()
  registerEstoqueIpc()
  registerContasPagarIpc()
  registerConfiguracaoIpc()
  registerFinanceiroIpc()
  registerDashboardIpc()
  registerBackupIpc()
  registerLicencaIpc()
  registerMigracaoIpc()
  registerCaixaIpc()
  registerRelatoriosIpc()
  registerListasValorIpc()
  registerAuditoriaIpc()
  registerSistemaIpc()
}
