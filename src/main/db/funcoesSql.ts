import type { DatabaseSync } from 'node:sqlite'
import { semAcento } from '@shared/texto'

/**
 * Funcoes SQL proprias. O LIKE do SQLite so ignora maiuscula para ASCII e
 * nunca ignora acento ("priscila" nao acha "PRISCILA" com acento), entao a
 * busca compara `sem_acento(coluna)` com o termo ja normalizado em JS.
 *
 * Precisa ser registrada em TODA conexao (por conexao, nao e persistente).
 */
export function registrarFuncoesSql(db: DatabaseSync): void {
  db.function('sem_acento', { deterministic: true }, (valor) => (valor == null ? null : semAcento(String(valor))))
}
