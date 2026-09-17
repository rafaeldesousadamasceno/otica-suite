import * as backupRepository from '@main/repositories/backupRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import { Errors } from '@main/errors'
import { paths } from '@main/paths'
import type { BackupStatus } from '@shared/types'
import type { BackupRestaurarInput } from '@shared/ipc'

const QUARENTA_E_OITO_HORAS_MS = 48 * 60 * 60 * 1000
const QUATRO_HORAS_MS = 4 * 60 * 60 * 1000
const UMA_HORA_MS = 60 * 60 * 1000

/** PRD: "30 diarios, 12 mensais" - simplificado para um teto unico de arquivos, sem bucket diario/mensal separado. */
const RETENCAO_DIAS = 30
const RETENCAO_MAX_ARQUIVOS = 30

export const backupService = {
  /** RF-13.1/13.3: status do backup - ultimo, lista completa e alerta. */
  obterStatus(): BackupStatus {
    requirePermissao('backup', 'ver')

    const backups = backupRepository.listarBackups()
    const ultimoBackup = backups[0] ?? null
    const alerta =
      ultimoBackup === null ||
      !ultimoBackup.integro ||
      Date.now() - Date.parse(ultimoBackup.criadoEm) > QUARENTA_E_OITO_HORAS_MS

    return {
      destino: paths.backups(),
      ultimoBackup,
      backups,
      alerta
    }
  },

  /** RF-13.2: backup manual, disparado por um usuario com permissao. */
  criarManual(): BackupStatus {
    const sessao = requirePermissao('backup', 'criar')

    const resultado = backupRepository.criarArquivoBackup()
    if (!resultado.integro) {
      throw Errors.validacao('O backup foi gerado mas falhou na verificação de integridade.')
    }

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'BACKUP_MANUAL',
      entidade: 'backup',
      valorNovo: { arquivo: resultado.arquivo }
    })

    backupRepository.aplicarRetencao(RETENCAO_DIAS, RETENCAO_MAX_ARQUIVOS)

    return backupService.obterStatus()
  },

  /** RF-13.3: restaura a partir de um backup, apos tirar um snapshot de seguranca do estado atual. */
  restaurar(input: BackupRestaurarInput): void {
    const sessao = requirePermissao('backup', 'editar')

    // CA3: sempre faz um backup de seguranca do estado atual ANTES de sobrescrever.
    backupRepository.criarArquivoBackup()

    try {
      backupRepository.restaurar(input.arquivo)
    } catch (err) {
      console.error('[backup] falha ao restaurar', err)
      throw Errors.validacao('Não foi possível restaurar o backup selecionado. Verifique se o arquivo é válido.')
    }

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'RESTAURAR_BACKUP',
      entidade: 'backup',
      valorNovo: { arquivo: input.arquivo }
    })
  }
}

/**
 * RF-13.1: agenda "diario no fechamento + a cada 4h" - sem dependencia de
 * cron externo, um `setInterval` de 1h checa se ja se passaram >= 4h desde o
 * ultimo backup bem sucedido e, se sim, gera um novo. Roda uma checagem
 * imediata ao iniciar (sem forcar backup a cada boot) para uma sessao longa
 * nao esperar a primeira hora inteira.
 */
export function iniciarAgendadorBackup(): void {
  const checarEBackupSeDevido = (): void => {
    try {
      const ultimo = backupRepository.listarBackups()[0] ?? null
      const devido = ultimo === null || Date.now() - Date.parse(ultimo.criadoEm) >= QUATRO_HORAS_MS
      if (!devido) return

      // Sem sessao de usuario aqui (backup agendado, nao interativo) -
      // auditoria fica com usuarioId null.
      const resultado = backupRepository.criarArquivoBackup()
      auditoriaRepository.registrar({
        usuarioId: null,
        acao: 'BACKUP_AUTOMATICO',
        entidade: 'backup',
        valorNovo: { arquivo: resultado.arquivo, integro: resultado.integro }
      })

      backupRepository.aplicarRetencao(RETENCAO_DIAS, RETENCAO_MAX_ARQUIVOS)
    } catch (err) {
      console.error('[backup] falha no backup automatico agendado', err)
    }
  }

  checarEBackupSeDevido()
  setInterval(checarEBackupSeDevido, UMA_HORA_MS)
}
