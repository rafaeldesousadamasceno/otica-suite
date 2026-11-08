import { requirePermissao } from '@main/auth/session'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import * as mysqlSource from '@main/migracao/mysqlSource'
import type { ClienteOrigemRow, ExameOrigemRow } from '@main/migracao/mysqlSource'
import * as transformar from '@main/migracao/transformar'
import {
  analisarDatasExame,
  avaliarCpfJaImportado,
  calcularAnosVizinhos,
  classificarExameSemCliente,
  dataValidaOuNull,
  identificarRegistrosVazios,
  pendenciaRegistroVazio,
  planejarClientes,
  type ClienteExistente,
  type PlanoCliente
} from '@main/migracao/analisar'
import { explicarFalha } from '@main/migracao/mensagens'
import * as migracaoRepository from '@main/repositories/migracaoRepository'
import { migracaoPendenciaRepository } from '@main/repositories/migracaoPendenciaRepository'
import * as backupRepository from '@main/repositories/backupRepository'
import { Errors } from '@main/errors'
import type {
  MigracaoAnalise,
  MigracaoAprovacoes,
  MigracaoResultado,
  OsAntigasAbertas,
  OsAntigasEncerradas,
  PendenciaPrevista,
  TipoPendencia
} from '@shared/importacao'
import type { MigracaoConexaoInput, MigracaoImportarInput } from '@shared/ipc'
import { hojeLocal } from '@shared/data'
import { limparCpf } from '@shared/cpf'

function mensagemErro(err: unknown): string {
  return err instanceof Error ? err.message : 'Erro desconhecido'
}

const APROVACOES_PADRAO: MigracaoAprovacoes = { mesclarDuplicados: true, removerCpfConflitante: true, removerRegistrosVazios: true }

/** Pendencias de falha que deixam de valer quando o registro finalmente entra. */
const FALHAS_DE_EXAME: TipoPendencia[] = ['EXAME_SEM_CLIENTE', 'CLIENTE_INEXISTENTE_NA_ORIGEM', 'CLIENTE_FALHOU', 'ERRO_IMPORTACAO']
const FALHAS_DE_CLIENTE: TipoPendencia[] = ['CPF_DUPLICADO', 'ERRO_IMPORTACAO']

function descricaoDoCliente(c: ClienteOrigemRow): string {
  return c.nome?.trim() ? `Cliente ${c.nome.trim()}` : 'Cliente sem nome'
}

function unir<T>(valores: Iterable<T | null | undefined>): T[] {
  return [...valores].filter((v): v is T => v !== null && v !== undefined)
}

// ---------------------------------------------------------------------
// Preparo comum: a analise e a importacao decidem com as MESMAS regras
// ---------------------------------------------------------------------

interface Origem {
  clientes: ClienteOrigemRow[]
  exames: ExameOrigemRow[]
}

async function lerOrigem(config: MigracaoConexaoInput): Promise<Origem> {
  // Os exames sao lidos junto dos clientes: no sistema antigo cada exame e uma
  // receita, e um cliente sem nome so entra se tiver ao menos uma.
  let clientes: ClienteOrigemRow[]
  try {
    clientes = await mysqlSource.lerClientes(config)
  } catch (err) {
    throw Errors.validacao(`Não foi possível ler os clientes do banco antigo: ${mensagemErro(err)}`)
  }
  let exames: ExameOrigemRow[]
  try {
    exames = await mysqlSource.lerExames(config)
  } catch (err) {
    throw Errors.validacao(`Não foi possível ler os exames do banco antigo: ${mensagemErro(err)}`)
  }
  return { clientes, exames }
}

interface Preparo {
  idsClienteComExame: Set<number>
  idsClientesOrigem: Set<number>
  /** Cliente que ainda nao entrou e vai entrar (ou ser mesclado) nesta rodada. */
  novos: ClienteOrigemRow[]
  semNome: ClienteOrigemRow[]
  jaImportados: { cliente: ClienteOrigemRow; clienteId: number }[]
  /** Registros em branco (so nome + exames vazios): cliente de origem -> codigos dos exames. */
  vazios: Map<number, number[]>
  vaziosNovos: ClienteOrigemRow[]
  vaziosJaImportados: { cliente: ClienteOrigemRow; clienteId: number }[]
  /** Exames desses registros: nao entram em nenhuma conta (importacao, datas, vizinhos). */
  idsExameVazio: Set<number>
  plano: Map<number, PlanoCliente>
  existentes: ClienteExistente[]
}

function preparar(origem: Origem, aprovacoes: MigracaoAprovacoes): Preparo {
  const idsClienteComExame = new Set(unir(origem.exames.map((e) => e.id_cliente)))
  const idsClientesOrigem = new Set(origem.clientes.map((c) => c.id_cliente))
  const examesPorCliente = new Map<number, number>()
  for (const e of origem.exames) {
    if (e.id_cliente) examesPorCliente.set(e.id_cliente, (examesPorCliente.get(e.id_cliente) ?? 0) + 1)
  }

  const vazios = aprovacoes.removerRegistrosVazios ? identificarRegistrosVazios(origem.clientes, origem.exames) : new Map<number, number[]>()
  const idsExameVazio = new Set([...vazios.values()].flat())

  const novos: ClienteOrigemRow[] = []
  const semNome: ClienteOrigemRow[] = []
  const jaImportados: Preparo['jaImportados'] = []
  const vaziosNovos: ClienteOrigemRow[] = []
  const vaziosJaImportados: Preparo['vaziosJaImportados'] = []
  for (const c of origem.clientes) {
    const clienteId = migracaoRepository.jaImportado('clientes', c.id_cliente)
    if (vazios.has(c.id_cliente)) {
      if (clienteId !== null) vaziosJaImportados.push({ cliente: c, clienteId })
      else vaziosNovos.push(c)
    } else if (clienteId !== null) {
      jaImportados.push({ cliente: c, clienteId })
    } else if (transformar.nomeVazio(c.nome) && !idsClienteComExame.has(c.id_cliente)) {
      semNome.push(c)
    } else {
      novos.push(c)
    }
  }

  const existentes = migracaoRepository.listarClientesExistentes()
  const plano = planejarClientes({
    clientes: novos.map((c) => ({
      idOrigem: c.id_cliente,
      nome: c.nome,
      dataNasc: transformar.dataOuNull(c.data_nasc),
      cpfBruto: transformar.cpfOuNull(c.cpf)
    })),
    examesPorCliente,
    existentes,
    aprovacoes
  })

  return { idsClienteComExame, idsClientesOrigem, novos, semNome, jaImportados, vazios, vaziosNovos, vaziosJaImportados, idsExameVazio, plano, existentes }
}

function indicePorCpf(existentes: ClienteExistente[]): Map<string, ClienteExistente[]> {
  const mapa = new Map<string, ClienteExistente[]>()
  for (const e of existentes) {
    const d = e.cpf ? limparCpf(e.cpf) : ''
    if (d) mapa.set(d, [...(mapa.get(d) ?? []), e])
  }
  return mapa
}

/**
 * Datas de um exame ja importado so geram pendencia se ninguem mexeu nelas
 * depois: se o administrador ja corrigiu a data, nao ha o que avisar.
 */
function datasJaImportadasIntactas(vendaId: number, datas: ReturnType<typeof analisarDatasExame>['datas']): boolean {
  const atuais = migracaoRepository.datasAtuaisDoExame(vendaId)
  return (['data_exame', 'data_venda', 'data_saida', 'data_chegada'] as const).every(
    (campo) => datas[campo] === null || atuais[campo] === datas[campo]
  )
}

function pendenciasDeDatasJaImportado(vendaId: number, analise: ReturnType<typeof analisarDatasExame>): PendenciaPrevista[] {
  if (!datasJaImportadasIntactas(vendaId, analise.datas)) return []
  const atuais = migracaoRepository.datasAtuaisDoExame(vendaId)
  return analise.pendencias.filter((p) => {
    // A data de exame ausente virou a da venda (ou a de hoje) na importacao: so vale avisar se continua assim.
    if (p.tipo === 'DATA_AUSENTE') return atuais.data_exame === atuais.data_venda
    return true
  })
}

/**
 * RF-02/F7 (PRD secao 11): importa clientes, exames e receitas_despesas do
 * MySQL do MD Óculos. Cada registro e gravado na sua propria transacao, nunca
 * numa transacao unica tudo-ou-nada (CA4: um registro que nao pode ser
 * convertido e listado como pendencia, os outros continuam sendo importados).
 * Rodar duas vezes nao duplica (CA1).
 *
 * Fluxo: `analisar` (so le, mostra o que vai acontecer) -> o administrador
 * aprova o que pode ser resolvido sozinho -> `importar` (com backup antes) ->
 * o que sobrar fica salvo em `migracao_pendencia`.
 */
export const migracaoService = {
  async testarConexao(config: MigracaoConexaoInput): Promise<void> {
    requirePermissao('migracao', 'ver')
    try {
      await mysqlSource.testarConexao(config)
    } catch (err) {
      throw Errors.validacao(`Não foi possível conectar: ${mensagemErro(err)}`)
    }
  },

  /** Quantas OS do sistema antigo continuam sem entrega, e uma data sugerida para encerra-las. */
  osAntigasAbertas(): OsAntigasAbertas {
    requirePermissao('migracao', 'ver')
    return migracaoRepository.resumoOsAntigasAbertas(hojeLocal())
  },

  /**
   * Marca de uma vez como entregues todas as OS antigas ainda abertas, na data
   * escolhida pelo administrador. Faz backup antes e deixa tudo na Auditoria
   * (com o id e a situacao anterior de cada uma).
   */
  encerrarOsAntigasAbertas(data: string): OsAntigasEncerradas {
    const sessao = requirePermissao('migracao', 'editar')
    const dia = dataValidaOuNull(data)
    if (!dia) throw Errors.validacao('Informe uma data válida para a entrega.')
    if (dia > hojeLocal()) throw Errors.validacao('A data de entrega não pode estar no futuro.')
    if (migracaoRepository.resumoOsAntigasAbertas(hojeLocal()).total === 0) {
      throw Errors.validacao('Não há ordens de serviço antigas em aberto.')
    }

    let backupArquivo: string
    try {
      const backup = backupRepository.criarArquivoBackup()
      if (!backup.integro) throw new Error('o arquivo de backup não passou na verificação de integridade')
      backupArquivo = backup.arquivo
    } catch (err) {
      throw Errors.validacao(`Não foi possível fazer o backup de segurança (${mensagemErro(err)}). Nada foi alterado.`)
    }

    const feitas = migracaoRepository.encerrarOsAntigasAbertas(dia)
    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'ENCERRAR_OS_ANTIGAS',
      entidade: 'ordem_servico',
      valorAnterior: { situacoes: feitas.map((f) => ({ id: f.id, situacao: f.situacaoAnterior })) },
      valorNovo: { quantidade: feitas.length, dataEntregaEscolhida: dia, backup: backupArquivo }
    })
    return { encerradas: feitas.length, backupArquivo }
  },

  /** Simulacao: le a origem e diz o que aconteceria, sem gravar nada. */
  async analisar(config: MigracaoConexaoInput): Promise<MigracaoAnalise> {
    requirePermissao('migracao', 'ver')
    const origem = await lerOrigem(config)
    const prep = preparar(origem, APROVACOES_PADRAO)
    const hoje = hojeLocal()
    const pendencias: PendenciaPrevista[] = []

    for (const p of prep.plano.values()) pendencias.push(...p.pendencias)

    // CPF de quem ja esta aqui (gravado com mascara, repetido, invalido).
    const porCpf = indicePorCpf(prep.existentes)
    const existentePorId = new Map(prep.existentes.map((e) => [e.clienteId, e]))
    for (const { cliente, clienteId } of prep.jaImportados) {
      const atual = existentePorId.get(clienteId)
      if (!atual?.cpf) continue
      const outros = (porCpf.get(limparCpf(atual.cpf)) ?? []).filter((o) => o.clienteId !== clienteId)
      const { pendencia } = avaliarCpfJaImportado(atual, cliente.id_cliente, outros)
      if (pendencia) pendencias.push(pendencia)
    }

    const motivosDeFalha = new Map<number, string>()
    for (const [id, p] of prep.plano) {
      if (p.acao === 'PULAR') motivosDeFalha.set(id, p.pendencias[0]?.motivo ?? 'foi pulado')
    }

    // Registros em branco: mostrados como aviso informativo (nao entram, ou saem se ja tinham entrado sem uso).
    for (const c of prep.vaziosNovos) pendencias.push(pendenciaRegistroVazio(c, prep.vazios.get(c.id_cliente) ?? [], false))
    let registrosVazios = prep.vaziosNovos.length
    for (const { cliente, clienteId } of prep.vaziosJaImportados) {
      if (!migracaoRepository.registroVazioRemovivel(clienteId)) continue
      pendencias.push(pendenciaRegistroVazio(cliente, prep.vazios.get(cliente.id_cliente) ?? [], true))
      registrosVazios++
    }

    const vizinhos = calcularAnosVizinhos(origem.exames.filter((e) => !prep.idsExameVazio.has(e.id_exame)))
    let examesJaImportados = 0
    let examesAImportar = 0
    for (const e of origem.exames) {
      if (prep.idsExameVazio.has(e.id_exame)) continue
      const analise = analisarDatasExame(e.id_exame, e, hoje, { anosVizinhos: vizinhos.get(e.id_exame) ?? [] })
      const vendaId = migracaoRepository.jaImportado('exames', e.id_exame)
      if (vendaId !== null) {
        examesJaImportados++
        pendencias.push(...pendenciasDeDatasJaImportado(vendaId, analise))
        continue
      }
      const plano = e.id_cliente ? prep.plano.get(e.id_cliente) : undefined
      const clienteEntra =
        !!e.id_cliente &&
        (migracaoRepository.jaImportado('clientes', e.id_cliente) !== null || (plano !== undefined && plano.acao !== 'PULAR'))
      if (!clienteEntra) {
        pendencias.push(classificarExameSemCliente(e, prep.idsClientesOrigem, motivosDeFalha))
        continue
      }
      examesAImportar++
      pendencias.push(...analise.pendencias)
    }

    const porTipo: MigracaoAnalise['porTipo'] = {}
    for (const p of pendencias) porTipo[p.tipo] = (porTipo[p.tipo] ?? 0) + 1

    return {
      clientesLidos: origem.clientes.length,
      clientesAImportar: prep.novos.length,
      clientesJaImportados: prep.jaImportados.length,
      clientesSemNome: prep.semNome.length,
      registrosVazios,
      examesLidos: origem.exames.length,
      examesAImportar,
      examesJaImportados,
      porTipo,
      pendencias
    }
  },

  async importar({ conexao: config, aprovacoes }: MigracaoImportarInput): Promise<MigracaoResultado> {
    const sessao = requirePermissao('migracao', 'criar')
    const hoje = hojeLocal()

    let clientesImportados = 0
    let clientesMesclados = 0
    let clientesJaImportados = 0
    let clientesComFalha = 0
    let clientesSemNomeIgnorados = 0
    let registrosVaziosRemovidos = 0
    let clientesSemNomeRemovidos = 0
    let examesImportados = 0
    let examesJaImportados = 0
    let examesComFalha = 0
    let despesasImportadas = 0
    let despesasJaImportadas = 0
    let despesasComFalha = 0
    let textosCorrigidos = 0

    // --------------------------- leitura (nada e gravado antes de ler tudo) ---------------------------
    const origem = await lerOrigem(config)
    let despesasOrigem
    try {
      despesasOrigem = await mysqlSource.lerDespesas(config)
    } catch (err) {
      throw Errors.validacao(`Não foi possível ler receitas/despesas do banco antigo: ${mensagemErro(err)}`)
    }

    // --------------------------- backup obrigatorio ---------------------------
    let backupArquivo: string
    try {
      const backup = backupRepository.criarArquivoBackup()
      if (!backup.integro) throw new Error('o arquivo de backup não passou na verificação de integridade')
      backupArquivo = backup.arquivo
    } catch (err) {
      throw Errors.validacao(
        `Não foi possível fazer o backup de segurança antes de importar (${mensagemErro(err)}). Nada foi importado. Libere espaço em disco ou verifique a pasta de backups e tente de novo.`
      )
    }

    const prep = preparar(origem, aprovacoes)
    const registrar = migracaoPendenciaRepository.registrar.bind(migracaoPendenciaRepository)
    const motivosDeFalhaDoCliente = new Map<number, string>()

    // --------------------------- clientes ---------------------------
    // Sem nome e sem receita que ja tinham entrado antes: saem (o backup acima ja foi feito).
    const clientesRemovidosIds: number[] = []
    const porCpf = indicePorCpf(prep.existentes)
    const existentePorId = new Map(prep.existentes.map((e) => [e.clienteId, e]))

    for (const { cliente: c, clienteId } of prep.jaImportados) {
      if (transformar.nomeVazio(c.nome) && !prep.idsClienteComExame.has(c.id_cliente)) {
        if (migracaoRepository.removerClienteImportadoSemNome(clienteId)) {
          clientesSemNomeRemovidos++
          clientesRemovidosIds.push(clienteId)
        } else {
          clientesJaImportados++
        }
        continue
      }

      clientesJaImportados++
      if (
        migracaoRepository.corrigirTextosCliente(clienteId, {
          nome: transformar.normalizarNomeProprio(c.nome ?? ''),
          logradouro: c.logradouro,
          numero: c.numero,
          complemento: c.complemento,
          bairro: c.bairro,
          cidade: c.cidade
        })
      ) {
        textosCorrigidos++
      }

      // CPF gravado antes desta regra: padroniza (so digitos) ou avisa de repetido/invalido.
      const atual = existentePorId.get(clienteId)
      if (atual?.cpf) {
        const digitosAntes = limparCpf(atual.cpf)
        const outros = (porCpf.get(digitosAntes) ?? []).filter((o) => o.clienteId !== clienteId)
        const { novoCpf, pendencia } = avaliarCpfJaImportado(atual, c.id_cliente, outros)
        if (pendencia) {
          registrar(pendencia, { tabela: 'cliente', id: clienteId })
        } else {
          migracaoPendenciaRepository.resolverAutomaticamente('clientes', c.id_cliente, ['CPF_INVALIDO', 'CPF_DUPLICADO'])
          if (novoCpf) {
            migracaoRepository.atualizarCpfCliente(clienteId, novoCpf)
            porCpf.set(digitosAntes, (porCpf.get(digitosAntes) ?? []).filter((o) => o.clienteId !== clienteId))
            const atualizado = { ...atual, cpf: novoCpf }
            existentePorId.set(clienteId, atualizado)
            porCpf.set(novoCpf, [...(porCpf.get(novoCpf) ?? []), atualizado])
          }
        }
      }
    }
    clientesSemNomeIgnorados = prep.semNome.length

    // Registros em branco que ja tinham entrado: saem, desde que continuem sem uso (o backup acima ja foi feito).
    const vaziosRemovidos: { origemId: number; clienteId: number; nome: string; exames: number[] }[] = []
    for (const { cliente: c, clienteId } of prep.vaziosJaImportados) {
      if (migracaoRepository.removerRegistroVazioImportado(clienteId)) {
        registrosVaziosRemovidos++
        vaziosRemovidos.push({ origemId: c.id_cliente, clienteId, nome: c.nome ?? '', exames: prep.vazios.get(c.id_cliente) ?? [] })
      }
    }
    if (vaziosRemovidos.length > 0) {
      auditoriaRepository.registrar({
        usuarioId: sessao.usuario.id,
        acao: 'REMOVER_REGISTROS_VAZIOS',
        entidade: 'cliente',
        valorAnterior: { removidos: vaziosRemovidos },
        valorNovo: { quantidade: vaziosRemovidos.length, backup: backupArquivo }
      })
    }

    if (clientesRemovidosIds.length > 0) {
      auditoriaRepository.registrar({
        usuarioId: sessao.usuario.id,
        acao: 'REMOVER_CLIENTES_SEM_NOME',
        entidade: 'cliente',
        valorNovo: { quantidade: clientesRemovidosIds.length, ids: clientesRemovidosIds }
      })
    }

    // Primeiro quem entra como cadastro proprio; depois quem se une a um deles.
    const aMesclar: ClienteOrigemRow[] = []
    for (const c of prep.novos) {
      const plano = prep.plano.get(c.id_cliente)
      if (!plano) continue
      if (plano.acao === 'MESCLAR') {
        aMesclar.push(c)
        continue
      }
      if (plano.acao === 'PULAR') {
        clientesComFalha++
        motivosDeFalhaDoCliente.set(c.id_cliente, plano.pendencias[0]?.motivo ?? 'foi pulado')
        for (const p of plano.pendencias) registrar(p)
        continue
      }
      try {
        const novoId = migracaoRepository.importarCliente(
          {
            nome: transformar.normalizarNomeProprio(c.nome ?? ''),
            dataNasc: transformar.dataOuNull(c.data_nasc),
            cpf: plano.cpf,
            observacao: plano.observacao,
            celular: transformar.celularOuNull(c.celular),
            logradouro: c.logradouro,
            numero: c.numero,
            complemento: c.complemento,
            bairro: c.bairro,
            cidade: c.cidade,
            uf: c.uf
          },
          c.id_cliente
        )
        clientesImportados++
        for (const p of plano.pendencias) registrar(p, { tabela: 'cliente', id: novoId })
        migracaoPendenciaRepository.resolverAutomaticamente('clientes', c.id_cliente, FALHAS_DE_CLIENTE)
      } catch (err) {
        clientesComFalha++
        const falha = explicarFalha(err, { origemTabela: 'clientes', origemId: c.id_cliente, descricao: descricaoDoCliente(c) })
        motivosDeFalhaDoCliente.set(c.id_cliente, falha.motivo)
        registrar(falha)
      }
    }

    for (const c of aMesclar) {
      const plano = prep.plano.get(c.id_cliente)
      if (plano?.acao !== 'MESCLAR') continue
      const destinoId =
        plano.comClienteId ?? (plano.comOrigemId !== null ? migracaoRepository.jaImportado('clientes', plano.comOrigemId) : null)
      if (destinoId === null) {
        clientesComFalha++
        const falha: PendenciaPrevista = {
          tipo: 'ERRO_IMPORTACAO',
          gravidade: 'erro',
          origemTabela: 'clientes',
          origemId: c.id_cliente,
          motivo: `${descricaoDoCliente(c)} (código ${c.id_cliente} no sistema antigo) devia ser unido a outro cadastro com o mesmo CPF, mas esse cadastro não foi importado.`,
          sugestao: 'Resolva a pendência do outro cadastro e importe de novo.',
          dados: null
        }
        motivosDeFalhaDoCliente.set(c.id_cliente, falha.motivo)
        registrar(falha)
        continue
      }
      try {
        migracaoRepository.mesclarCliente(
          c.id_cliente,
          destinoId,
          {
            nome: transformar.normalizarNomeProprio(c.nome ?? ''),
            dataNasc: transformar.dataOuNull(c.data_nasc),
            cpf: null,
            celular: transformar.celularOuNull(c.celular),
            logradouro: c.logradouro,
            numero: c.numero,
            complemento: c.complemento,
            bairro: c.bairro,
            cidade: c.cidade,
            uf: c.uf
          }
        )
        clientesMesclados++
        for (const p of plano.pendencias) registrar(p, { tabela: 'cliente', id: destinoId })
        migracaoPendenciaRepository.resolverAutomaticamente('clientes', c.id_cliente, FALHAS_DE_CLIENTE)
      } catch (err) {
        clientesComFalha++
        const falha = explicarFalha(err, { origemTabela: 'clientes', origemId: c.id_cliente, descricao: descricaoDoCliente(c) })
        motivosDeFalhaDoCliente.set(c.id_cliente, falha.motivo)
        registrar(falha)
      }
    }

    // --------------------------- exames ---------------------------
    const produtoGenericoId = migracaoRepository.garantirProdutoGenerico()
    const vizinhos = calcularAnosVizinhos(origem.exames.filter((e) => !prep.idsExameVazio.has(e.id_exame)))

    for (const e of origem.exames) {
      if (prep.idsExameVazio.has(e.id_exame)) continue
      const analise = analisarDatasExame(e.id_exame, e, hoje, { anosVizinhos: vizinhos.get(e.id_exame) ?? [] })
      const vendaJaId = migracaoRepository.jaImportado('exames', e.id_exame)

      if (vendaJaId !== null) {
        examesJaImportados++
        const descricao =
          [e.armacao, e.lentes, e.tratamentos].filter((v) => v?.trim()).join(' · ') ||
          'Item importado do sistema anterior'
        if (migracaoRepository.corrigirTextosExame(vendaJaId, descricao, e.laboratorio, e.med_opto)) textosCorrigidos++
        const datasPendentes = pendenciasDeDatasJaImportado(vendaJaId, analise)
        for (const p of datasPendentes) registrar(p, { tabela: 'venda', id: vendaJaId })
        // O que estava aberto e a analise de agora nao reconhece mais (texto antigo, data ja ajustada) fecha sozinho.
        const aindaValem = new Set(datasPendentes.map((p) => p.tipo))
        const tiposDeData: TipoPendencia[] = ['DATA_AUSENTE', 'DATA_INVALIDA', 'DATA_INCOERENTE']
        migracaoPendenciaRepository.resolverAutomaticamente('exames', e.id_exame, tiposDeData.filter((t) => !aindaValem.has(t)))
        continue
      }

      const clienteId = e.id_cliente ? migracaoRepository.jaImportado('clientes', e.id_cliente) : null
      if (!clienteId) {
        examesComFalha++
        registrar(classificarExameSemCliente(e, prep.idsClientesOrigem, motivosDeFalhaDoCliente))
        continue
      }

      try {
        const { datas } = analise
        const dataExame = datas.data_exame ?? datas.data_venda ?? hoje
        const dataVenda = datas.data_venda ?? dataExame
        const situacaoOS = transformar.mapearSituacaoOS(e.situacao)
        const dataChegada = datas.data_chegada

        const descricaoItem =
          [e.armacao, e.lentes, e.tratamentos].filter((v) => v?.trim()).join(' · ') ||
          'Item importado do sistema anterior'

        const vendaId = migracaoRepository.importarExame(
          {
            clienteId,
            profissionalId: migracaoRepository.garantirProfissional(e.med_opto),
            dataExame,
            dataVenda,
            longeOdEsf: transformar.paraNumero(e.plonge_od_esf),
            longeOdCil: transformar.paraNumero(e.plonge_od_cil),
            longeOdEixo: transformar.paraNumero(e.plonge_od_eixo),
            longeOdDnp: transformar.paraNumero(e.plonge_od_dnp),
            longeOeEsf: transformar.paraNumero(e.plonge_oe_esf),
            longeOeCil: transformar.paraNumero(e.plonge_oe_cil),
            longeOeEixo: transformar.paraNumero(e.plonge_oe_eixo),
            longeOeDnp: transformar.paraNumero(e.plonge_oe_dnp),
            pertoOdEsf: transformar.paraNumero(e.pperto_od_esf),
            pertoOdCil: transformar.paraNumero(e.pperto_od_cil),
            pertoOdEixo: transformar.paraNumero(e.pperto_od_eixo),
            pertoOdDnp: transformar.paraNumero(e.pperto_od_dnp),
            pertoOeEsf: transformar.paraNumero(e.pperto_oe_esf),
            pertoOeCil: transformar.paraNumero(e.pperto_oe_cil),
            pertoOeEixo: transformar.paraNumero(e.pperto_oe_eixo),
            pertoOeDnp: transformar.paraNumero(e.pperto_oe_dnp),
            adicao: transformar.paraNumero(e.adicao),
            descricaoItem,
            valorTotalCentavos: transformar.paraCentavos(e.valor_exame) + transformar.paraCentavos(e.valor_oculos),
            formaPagamento: e.forma_pgto?.trim() || 'À VISTA',
            laboratorio: e.laboratorio,
            situacaoOS,
            dataEnvio: datas.data_saida,
            dataChegada,
            // Sistema anterior nao guardava uma data de entrega separada -
            // se ja estava "ENTREGUE", a data de chegada e o melhor proxy disponivel.
            dataEntrega: situacaoOS === 'ENTREGUE' ? dataChegada : null,
            vendedorId: sessao.usuario.id
          },
          produtoGenericoId,
          e.id_exame
        )

        for (const p of analise.pendencias) registrar(p, { tabela: 'venda', id: vendaId })
        migracaoPendenciaRepository.resolverAutomaticamente('exames', e.id_exame, FALHAS_DE_EXAME)
        examesImportados++
      } catch (err) {
        examesComFalha++
        registrar(explicarFalha(err, { origemTabela: 'exames', origemId: e.id_exame, descricao: `Exame ${e.id_exame}` }))
      }
    }

    // --------------------------- receitas_despesas ---------------------------
    for (const d of despesasOrigem) {
      const lancamentoJaId = migracaoRepository.jaImportado('receitas_despesas', d.id)
      if (lancamentoJaId !== null) {
        despesasJaImportadas++
        if (migracaoRepository.corrigirTextosDespesa(lancamentoJaId, d.descricao)) textosCorrigidos++
        continue
      }
      try {
        migracaoRepository.importarDespesa(
          {
            tipo: d.tipo?.trim().toUpperCase() === 'DESPESA' ? 'DESPESA' : 'RECEITA',
            descricao: d.descricao,
            valorCentavos: transformar.paraCentavos(d.valor),
            data: transformar.dataOuNull(d.data) ?? hoje
          },
          d.id
        )
        despesasImportadas++
        migracaoPendenciaRepository.resolverAutomaticamente('receitas_despesas', d.id, FALHAS_DE_EXAME)
      } catch (err) {
        despesasComFalha++
        registrar(explicarFalha(err, { origemTabela: 'receitas_despesas', origemId: d.id, descricao: `Lançamento “${d.descricao}”` }))
      }
    }

    const pendenciasAbertas = migracaoPendenciaRepository.contarAbertasPorTipo()

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'IMPORTAR_DADOS_MD_OCULOS',
      entidade: 'migracao',
      valorNovo: {
        clientesImportados,
        clientesMesclados,
        clientesComFalha,
        examesImportados,
        examesComFalha,
        despesasImportadas,
        despesasComFalha,
        aprovacoes,
        registrosVaziosIgnorados: prep.vaziosNovos.length,
        registrosVaziosRemovidos,
        pendenciasAbertas,
        backup: backupArquivo
      }
    })

    return {
      clientesImportados,
      clientesMesclados,
      clientesJaImportados,
      clientesComFalha,
      clientesSemNomeIgnorados,
      clientesSemNomeRemovidos,
      registrosVaziosIgnorados: prep.vaziosNovos.length,
      registrosVaziosRemovidos,
      examesImportados,
      examesJaImportados,
      examesComFalha,
      despesasImportadas,
      despesasJaImportadas,
      despesasComFalha,
      textosCorrigidos,
      pendenciasAbertas,
      backupArquivo
    }
  }
}
