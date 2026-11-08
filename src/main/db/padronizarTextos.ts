import type { DatabaseSync } from 'node:sqlite'
import { maiusculoOuNulo } from '@shared/texto'

/**
 * Campos de cadastro que o sistema grava SEMPRE em maiusculas (com acento).
 * Ficam de fora de proposito: e-mail, site, login, senha, observacoes livres,
 * mensagens e valores vindos de listas configuraveis (tipo de lente,
 * tratamento, laboratorio), que sao comparados por igualdade com a lista.
 */
const CAMPOS_MAIUSCULOS: Record<string, string[]> = {
  cliente: ['nome', 'logradouro', 'complemento', 'bairro', 'cidade', 'uf', 'profissao', 'indicado_por'],
  produto: ['descricao', 'marca', 'modelo', 'cor', 'tamanho'],
  produto_lente: ['material', 'tipo'],
  fornecedor: ['razao_social', 'contato'],
  profissional: ['nome'],
  receita_optica: ['armacao'],
  conta_pagar: ['descricao']
}

const CHAVE = 'padronizacao_maiusculas_v1'

/**
 * Uma unica vez por banco, passa para maiusculas o que ja estava salvo antes
 * da regra existir. Feito em JS porque o UPPER() do SQLite so converte ASCII
 * ("Príscila" viraria "PRíSCILA"). Idempotente e em transacao unica: se algo
 * falhar, nada muda e a proxima abertura tenta de novo.
 */
export function padronizarTextos(db: DatabaseSync): void {
  const feito = db.prepare('SELECT 1 FROM configuracao WHERE chave = :chave').get({ chave: CHAVE })
  if (feito) return

  db.exec('BEGIN IMMEDIATE')
  try {
    for (const [tabela, colunas] of Object.entries(CAMPOS_MAIUSCULOS)) {
      const linhas = db.prepare(`SELECT rowid AS id, ${colunas.join(', ')} FROM ${tabela}`).all() as Record<string, unknown>[]
      const atualizar = db.prepare(`UPDATE ${tabela} SET ${colunas.map((c) => `${c} = :${c}`).join(', ')} WHERE rowid = :id`)
      for (const linha of linhas) {
        const novos: Record<string, string | null> = {}
        let mudou = false
        for (const c of colunas) {
          const atual = linha[c] == null ? null : String(linha[c])
          const novo = maiusculoOuNulo(atual)
          novos[c] = novo
          if (novo !== atual) mudou = true
        }
        if (mudou) atualizar.run({ id: linha.id as number, ...novos })
      }
    }
    db.prepare('INSERT INTO configuracao (chave, valor) VALUES (:chave, :valor)').run({ chave: CHAVE, valor: '1' })
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
