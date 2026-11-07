import type { ClienteResumo, Empresa } from '@shared/types'
import { MESES } from '@shared/types'
import { formatarDataBr, montarRelatorioTabela, texto } from './htmlUtils'

/** RF-12: "Aniversariantes do mês" - preserva a tela atual, reaproveitando `clienteRepository.aniversariantes`. */
export function montarHtmlAniversariantes(clientes: ClienteResumo[], empresa: Empresa, mes: number | null): string {
  return montarRelatorioTabela({
    titulo: 'Aniversariantes',
    subtitulo: 'Clientes para parabenizar - uma boa hora para lembrar da renovação dos óculos.',
    empresa,
    filtroTexto: mes ? `Mês: ${MESES[mes - 1]}` : 'Todos os meses',
    orientacao: 'retrato',
    resumo: [{ label: 'Aniversariantes', valor: String(clientes.length), tom: 'destaque' }],
    colunas: [{ label: 'Nome' }, { label: 'Nascimento' }, { label: 'Celular' }, { label: 'CPF' }],
    linhas: clientes.map((c) => [texto(c.nome), formatarDataBr(c.dataNasc), texto(c.celular), texto(c.cpf)]),
    linhaVazia: 'Nenhum aniversariante encontrado.'
  })
}
