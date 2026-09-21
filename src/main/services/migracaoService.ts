import { requirePermissao } from '@main/auth/session'
import { auditoriaRepository } from '@main/repositories/auditoriaRepository'
import * as mysqlSource from '@main/migracao/mysqlSource'
import * as transformar from '@main/migracao/transformar'
import * as migracaoRepository from '@main/repositories/migracaoRepository'
import { Errors } from '@main/errors'
import type { MigracaoAviso, MigracaoResultado } from '@shared/types'
import type { MigracaoConexaoInput } from '@shared/ipc'
import { hojeLocal } from '@shared/data'

function mensagemErro(err: unknown): string {
  return err instanceof Error ? err.message : 'Erro desconhecido'
}

function hoje(): string {
  return hojeLocal()
}

/**
 * RF-02/F7 (PRD secao 11): importa clientes, exames e receitas_despesas do
 * MySQL do MD Óculos. Cada tabela e processada registro a registro, nunca
 * numa transacao unica que tudo-ou-nada (CA4: um registro que nao pode ser
 * convertido e listado, os outros continuam sendo importados). Rodar duas
 * vezes nao duplica (CA1): cada registro so entra se `migracaoRepository`
 * ainda nao tiver um mapeamento pra ele.
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

  async importar(config: MigracaoConexaoInput): Promise<MigracaoResultado> {
    const sessao = requirePermissao('migracao', 'criar')
    const avisos: MigracaoAviso[] = []

    let clientesImportados = 0
    let clientesIgnorados = 0
    let examesImportados = 0
    let examesIgnorados = 0
    let despesasImportadas = 0
    let despesasIgnoradas = 0
    let textosCorrigidos = 0

    // --------------------------- clientes ---------------------------
    let clientesOrigem
    try {
      clientesOrigem = await mysqlSource.lerClientes(config)
    } catch (err) {
      throw Errors.validacao(`Não foi possível ler os clientes do banco antigo: ${mensagemErro(err)}`)
    }

    for (const c of clientesOrigem) {
      const clienteJaId = migracaoRepository.jaImportado('clientes', c.id_cliente)
      if (clienteJaId !== null) {
        clientesIgnorados++
        if (
          migracaoRepository.corrigirTextosCliente(clienteJaId, {
            nome: transformar.normalizarNomeProprio(c.nome),
            logradouro: c.logradouro,
            numero: c.numero,
            complemento: c.complemento,
            bairro: c.bairro,
            cidade: c.cidade
          })
        ) {
          textosCorrigidos++
        }
        continue
      }
      try {
        migracaoRepository.importarCliente(
          {
            nome: transformar.normalizarNomeProprio(c.nome),
            dataNasc: transformar.dataOuNull(c.data_nasc),
            cpf: transformar.cpfOuNull(c.cpf),
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
      } catch (err) {
        clientesIgnorados++
        avisos.push({ tabela: 'clientes', origemId: c.id_cliente, motivo: mensagemErro(err) })
      }
    }

    // --------------------------- exames ---------------------------
    const produtoGenericoId = migracaoRepository.garantirProdutoGenerico()

    let examesOrigem
    try {
      examesOrigem = await mysqlSource.lerExames(config)
    } catch (err) {
      throw Errors.validacao(`Não foi possível ler os exames do banco antigo: ${mensagemErro(err)}`)
    }

    for (const e of examesOrigem) {
      const vendaJaId = migracaoRepository.jaImportado('exames', e.id_exame)
      if (vendaJaId !== null) {
        examesIgnorados++
        const descricao =
          [e.armacao, e.lentes, e.tratamentos].filter((v) => v?.trim()).join(' · ') ||
          'Item importado do sistema anterior'
        if (migracaoRepository.corrigirTextosExame(vendaJaId, descricao, e.laboratorio, e.med_opto)) textosCorrigidos++
        continue
      }
      try {
        const clienteId = e.id_cliente ? migracaoRepository.jaImportado('clientes', e.id_cliente) : null
        if (!clienteId) {
          throw new Error('Cliente de origem não foi importado (registro órfão ou o cliente falhou antes).')
        }

        const dataExameOriginal = transformar.dataOuNull(e.data_exame)
        const dataExame = dataExameOriginal ?? transformar.dataOuNull(e.data_venda) ?? hoje()
        const dataVenda = transformar.dataOuNull(e.data_venda) ?? dataExame
        const situacaoOS = transformar.mapearSituacaoOS(e.situacao)
        const dataChegada = transformar.dataOuNull(e.data_chegada)

        const descricaoItem =
          [e.armacao, e.lentes, e.tratamentos].filter((v) => v?.trim()).join(' · ') ||
          'Item importado do sistema anterior'

        migracaoRepository.importarExame(
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
            dataEnvio: transformar.dataOuNull(e.data_saida),
            dataChegada,
            // Sistema anterior nao guardava uma data de entrega separada -
            // se ja estava "ENTREGUE", a data de chegada e o melhor proxy disponivel.
            dataEntrega: situacaoOS === 'ENTREGUE' ? dataChegada : null,
            vendedorId: sessao.usuario.id
          },
          produtoGenericoId,
          e.id_exame
        )

        if (!dataExameOriginal) {
          avisos.push({
            tabela: 'exames',
            origemId: e.id_exame,
            motivo: 'Data do exame desconhecida na origem; foi usada uma data de referência.'
          })
        }
        examesImportados++
      } catch (err) {
        examesIgnorados++
        avisos.push({ tabela: 'exames', origemId: e.id_exame, motivo: mensagemErro(err) })
      }
    }

    // --------------------------- receitas_despesas ---------------------------
    let despesasOrigem
    try {
      despesasOrigem = await mysqlSource.lerDespesas(config)
    } catch (err) {
      throw Errors.validacao(`Não foi possível ler receitas/despesas do banco antigo: ${mensagemErro(err)}`)
    }

    for (const d of despesasOrigem) {
      const lancamentoJaId = migracaoRepository.jaImportado('receitas_despesas', d.id)
      if (lancamentoJaId !== null) {
        despesasIgnoradas++
        if (migracaoRepository.corrigirTextosDespesa(lancamentoJaId, d.descricao)) textosCorrigidos++
        continue
      }
      try {
        migracaoRepository.importarDespesa(
          {
            tipo: d.tipo?.trim().toUpperCase() === 'DESPESA' ? 'DESPESA' : 'RECEITA',
            descricao: d.descricao,
            valorCentavos: transformar.paraCentavos(d.valor),
            data: transformar.dataOuNull(d.data) ?? hoje()
          },
          d.id
        )
        despesasImportadas++
      } catch (err) {
        despesasIgnoradas++
        avisos.push({ tabela: 'receitas_despesas', origemId: d.id, motivo: mensagemErro(err) })
      }
    }

    auditoriaRepository.registrar({
      usuarioId: sessao.usuario.id,
      acao: 'IMPORTAR_DADOS_MD_OCULOS',
      entidade: 'migracao',
      valorNovo: { clientesImportados, examesImportados, despesasImportadas }
    })

    return {
      clientesImportados,
      clientesIgnorados,
      examesImportados,
      examesIgnorados,
      despesasImportadas,
      despesasIgnoradas,
      textosCorrigidos,
      avisos
    }
  }
}
