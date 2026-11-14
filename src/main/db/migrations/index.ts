import initSql from './001_init.sql?raw'
import seedSql from './001_seed.sql?raw'
import entradaSql from './003_forma_pagamento_entrada.sql?raw'
import estoqueConfigSql from './004_estoque_config.sql?raw'
import logoFormatoSql from './005_empresa_logo_formato.sql?raw'
import migracaoSql from './006_migracao.sql?raw'
import relacionamentoSql from './007_relacionamento.sql?raw'
import receitaDpSql from './008_receita_dp.sql?raw'
import dashboardSql from './009_dashboard.sql?raw'
import syncBaseSql from './010_sync_base.sql?raw'
import migracaoPendenciaSql from './011_migracao_pendencia.sql?raw'
import antirriscoSql from './012_antirrisco.sql?raw'

export interface Migration {
  version: number
  name: string
  sql: string
}

/**
 * Migrations sao aplicadas em ordem, uma vez cada, dentro de uma
 * transacao. Nunca edite uma migracao ja publicada - crie a proxima.
 */
export const MIGRATIONS: Migration[] = [
  { version: 1, name: 'init_schema', sql: initSql },
  { version: 2, name: 'seed_listas_e_configuracao', sql: seedSql },
  { version: 3, name: 'forma_pagamento_entrada', sql: entradaSql },
  { version: 4, name: 'estoque_config', sql: estoqueConfigSql },
  { version: 5, name: 'empresa_logo_formato', sql: logoFormatoSql },
  { version: 6, name: 'migracao', sql: migracaoSql },
  { version: 7, name: 'relacionamento', sql: relacionamentoSql },
  { version: 8, name: 'receita_dp', sql: receitaDpSql },
  { version: 9, name: 'dashboard', sql: dashboardSql },
  { version: 10, name: 'sync_base', sql: syncBaseSql },
  { version: 11, name: 'migracao_pendencia', sql: migracaoPendenciaSql },
  { version: 12, name: 'antirrisco', sql: antirriscoSql }
]
