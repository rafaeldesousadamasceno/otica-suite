import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs'
import { empresaRepository } from '@main/repositories/empresaRepository'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import { requirePermissao } from '@main/auth/session'
import { paths } from '@main/paths'
import { Errors } from '@main/errors'
import type { Empresa } from '@shared/types'
import type { EmpresaUpdateInput, EmpresaLogoUploadInput } from '@shared/ipc'

const EXTENSOES_PERMITIDAS = ['png', 'jpg', 'jpeg', 'svg']
const TAMANHO_MAXIMO_BYTES = 3 * 1024 * 1024 // 3 MB

const MIME_POR_EXTENSAO: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml'
}

/**
 * `empresaRepository.get().logoPath` guarda o CAMINHO no disco (uso interno
 * do main - existsSync/unlinkSync). O renderer nunca recebe esse caminho:
 * ele nao consegue exibir `file://` de forma confiavel (backslash do
 * Windows quebra a URL, e em dev o renderer roda em http://localhost, que
 * o Chromium proibe de carregar `file://` por seguranca). Por isso, antes
 * de devolver a Empresa pelo IPC, o campo `logoPath` e substituido pela
 * imagem embutida como `data:` URI - funciona igual em dev e produção,
 * sem depender de protocolo nenhum.
 */
function lerLogoComoDataUrl(caminhoAbsoluto: string): string | null {
  try {
    const extensao = caminhoAbsoluto.split('.').pop()?.toLowerCase() ?? ''
    const mime = MIME_POR_EXTENSAO[extensao]
    if (!mime || !existsSync(caminhoAbsoluto)) return null

    const buffer = readFileSync(caminhoAbsoluto)
    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch {
    return null // arquivo sumiu/corrompeu - melhor mostrar "sem logo" do que quebrar a tela
  }
}

function paraExibicao(empresa: Empresa): Empresa {
  return {
    ...empresa,
    logoPath: empresa.logoPath ? lerLogoComoDataUrl(empresa.logoPath) : null
  }
}

export const empresaService = {
  /**
   * Sem exigir sessao de proposito: nome, logo e cor precisam aparecer na
   * TELA DE LOGIN (RF-01, CA1), antes de qualquer autenticacao. Nao ha
   * risco de vazamento entre oticas - e uma instalacao por otica, e os
   * dados aqui (nome fantasia, CNPJ, endereco) sao os da propria loja
   * exibidos na propria maquina da loja.
   */
  get(): Empresa {
    const empresa = empresaRepository.get()
    if (!empresa) throw Errors.naoEncontrado('Configuração da empresa')
    return paraExibicao(empresa)
  },

  update(data: EmpresaUpdateInput): Empresa {
    const sessao = requirePermissao('configuracoes', 'editar')
    const antes = empresaRepository.get()
    empresaRepository.atualizar(data)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'ATUALIZAR',
      entidade: 'empresa',
      valorAnterior: antes,
      valorNovo: data
    })

    return paraExibicao(empresaRepository.get()!)
  },

  /**
   * RF-01: logo enviada pelo proprio usuario (PNG/JPG/SVG), substituindo o
   * recurso fixo embutido no JAR do sistema anterior (D4). O arquivo vem
   * do renderer como base64 - a leitura do disco (File API do navegador)
   * acontece la, nunca via caminho de arquivo cru vindo do renderer.
   */
  uploadLogo(input: EmpresaLogoUploadInput): Empresa {
    const sessao = requirePermissao('configuracoes', 'editar')

    const extensao = input.fileName.split('.').pop()?.toLowerCase() ?? ''
    if (!EXTENSOES_PERMITIDAS.includes(extensao)) {
      throw Errors.validacao('Use uma imagem PNG, JPG ou SVG.')
    }

    const buffer = Buffer.from(input.dataBase64, 'base64')
    if (buffer.byteLength > TAMANHO_MAXIMO_BYTES) {
      throw Errors.validacao('A imagem precisa ter no máximo 3 MB.')
    }

    const empresaAtual = empresaRepository.get()
    if (empresaAtual?.logoPath && existsSync(empresaAtual.logoPath)) {
      try {
        unlinkSync(empresaAtual.logoPath)
      } catch {
        // arquivo antigo preso por outro processo - nao impede a troca
      }
    }

    const destino = paths.logoAtual(extensao)
    writeFileSync(destino, buffer)
    empresaRepository.atualizarLogo(destino)

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'ATUALIZAR_LOGO',
      entidade: 'empresa'
    })

    return paraExibicao(empresaRepository.get()!)
  },

  /** Remove a logo por completo - volta ao estado "sem logo" (ícone padrão). */
  removerLogo(): Empresa {
    const sessao = requirePermissao('configuracoes', 'editar')

    const empresaAtual = empresaRepository.get()
    if (empresaAtual?.logoPath && existsSync(empresaAtual.logoPath)) {
      try {
        unlinkSync(empresaAtual.logoPath)
      } catch {
        // idem uploadLogo - nao trava a operacao por um arquivo preso
      }
    }

    empresaRepository.removerLogo()

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'REMOVER_LOGO',
      entidade: 'empresa'
    })

    return paraExibicao(empresaRepository.get()!)
  }
}
