import { handleIpc } from './handle'
import { IPC, pdfIdSchema } from '@shared/ipc'
import { descartarPdf, imprimirPdf, salvarPdf } from '@main/relatorios/pdf'

/**
 * Acoes do visualizador de PDF. A permissao de ver o relatorio ja foi
 * checada quando ele foi gerado; aqui basta a sessao, e o cache so entrega
 * o PDF para quem o gerou.
 */
export function registerPdfIpc(): void {
  handleIpc(IPC.pdf.salvar, pdfIdSchema, (input) => salvarPdf(input.id))
  handleIpc(IPC.pdf.imprimir, pdfIdSchema, (input) => imprimirPdf(input.id))
  handleIpc(IPC.pdf.descartar, pdfIdSchema, (input) => descartarPdf(input.id))
}
