import { getDb } from '@main/db/connection'

/**
 * Profissional (optometrista) e um cadastro auxiliar nesta versao - PRD
 * secao 17, Q1: vira usuario do sistema so quando houver demanda. Por
 * ora, o nome digitado na receita e suficiente; a tabela existe para que
 * o historico fique correto e a evolucao futura (RF-03 com perfil
 * proprio) nao exija migrar dado nenhum.
 */
export const profissionalRepository = {
  buscarOuCriarPorNome(nome: string): number {
    const nomeNormalizado = nome.trim().toUpperCase()
    const db = getDb()

    const existente = db
      .prepare('SELECT id FROM profissional WHERE UPPER(nome) = :nome')
      .get({ nome: nomeNormalizado }) as { id: number } | undefined

    if (existente) return existente.id

    const info = db
      .prepare('INSERT INTO profissional (nome) VALUES (:nome)')
      .run({ nome: nomeNormalizado })
    return Number(info.lastInsertRowid)
  }
}
