import { formatarDioptria } from '@shared/dioptria'
import { ROTULO_BASE_PRISMA, ROTULO_OLHO, ROTULO_PRESCRICAO, resumoMedidas, type Olho } from '@shared/prescricao'
import type { Cliente, Empresa, ReceitaOptica } from '@shared/types'
import { escapeHtml, formatarDataBr, texto } from './formatacao'
import { assinatura, campos, montarDocumento, secao } from './layout'

/**
 * Impressao da PRESCRICAO (no codigo, "receita optica"): Direito e Esquerdo lado a lado, com
 * Longe e Perto. So sai o que esta preenchido (nada de linha vazia), as medidas da armacao so
 * aparecem se houver alguma e a DP so se a preferencia do computador estiver ligada. O mesmo
 * bloco entra na impressao da OS. O papel sempre usa graus decimais (+1,25), qualquer que seja
 * o formato escolhido para digitar.
 */

export interface OpcoesPrescricao {
  /** Preferencia "Exibir DP" do computador que mandou imprimir. */
  exibirDp?: boolean
}

export const ESTILO_PRESCRICAO = `
  table.presc-par { width: 100%; border-collapse: separate; border-spacing: 10px 0; margin: 0 -10px 10px; table-layout: fixed; }
  table.presc-par > tbody > tr > td { vertical-align: top; padding: 0; width: 50%; }
  .presc-olho { border: 1px solid var(--rel-borda); border-radius: 6px; overflow: hidden; }
  .presc-olho h3 {
    margin: 0; padding: 5px 8px; background: var(--rel-base); color: var(--rel-tinta);
    font-size: 9px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
  }
  table.presc { width: 100%; border-collapse: collapse; }
  table.presc th {
    background: var(--rel-suave); color: var(--rel-forte);
    font-size: 8px; font-weight: 700; letter-spacing: 0.05em; padding: 4px; text-align: center;
  }
  table.presc td {
    padding: 5px 4px; text-align: center; font-size: 10.5px; font-variant-numeric: tabular-nums;
    border-bottom: 1px solid var(--rel-linha);
  }
  table.presc td.rotulo { text-align: left; font-weight: 700; color: var(--rel-forte); padding-left: 8px; }
  .presc-extra { padding: 5px 8px 6px; font-size: 9.5px; color: var(--rel-ink-2, #43585f); }
  .presc-extra b { font-variant-numeric: tabular-nums; color: inherit; }
`

/** Grau com sinal e virgula; sem valor, um traco. */
const grau = (v: number | null): string => (v === null ? '—' : formatarDioptria(v))
/** Eixo em graus; sem valor, um traco. */
const eixo = (v: number | null): string => (v === null ? '—' : `${v}°`)
/** Medida em mm com virgula (31,5). */
const medida = (v: number | null): string => (v === null ? '—' : String(v).replace('.', ','))

function blocoOlho(r: ReceitaOptica, o: Olho): string {
  const adicao = o === 'Od' ? r.adicaoOd : r.adicaoOe
  const prisma = r[`longe${o}Prisma`]
  const alt = r[`longe${o}Alt`]

  const extras: string[] = []
  // No formato anterior nao ha adicao por olho: o perto impresso e o que foi gravado.
  if (!r.formatoAnterior && adicao !== null) extras.push(`Adição <b>${formatarDioptria(adicao, { signed: false })}</b>`)
  if (alt !== null) extras.push(`Altura <b>${medida(alt)} mm</b>`)
  if (prisma > 0) extras.push(`Prisma <b>${prisma.toFixed(2).replace('.', ',')} Δ</b>, base <b>${ROTULO_BASE_PRISMA[r[`longe${o}BasePrisma`]].toLowerCase()}</b>`)

  return `
    <div class="presc-olho">
      <h3>${ROTULO_OLHO[o]} (${o === 'Od' ? 'OD' : 'OE'})</h3>
      <table class="presc">
        <thead><tr><th></th><th>ESF</th><th>CIL</th><th>EIXO</th><th>DNP</th></tr></thead>
        <tbody>
          <tr><td class="rotulo">Longe</td><td>${grau(r[`longe${o}Esf`])}</td><td>${grau(r[`longe${o}Cil`])}</td><td>${eixo(r[`longe${o}Eixo`])}</td><td>${medida(r[`longe${o}Dnp`])}</td></tr>
          <tr><td class="rotulo">Perto</td><td>${grau(r[`perto${o}Esf`])}</td><td>${grau(r[`perto${o}Cil`])}</td><td>${eixo(r[`perto${o}Eixo`])}</td><td>${medida(r[`perto${o}Dnp`])}</td></tr>
        </tbody>
      </table>
      ${extras.length ? `<div class="presc-extra">${extras.join(' · ')}</div>` : ''}
    </div>`
}

/** Direito, Esquerdo e os dados da lente e da armacao - sem o cabecalho do documento. */
export function montarBlocoPrescricao(r: ReceitaOptica, { exibirDp = false }: OpcoesPrescricao = {}): string {
  const armacao = [r.armacaoTipo, r.armacaoModelo, r.armacaoMarca, r.armacaoCor].filter((p): p is string => Boolean(p && p.trim())).join(' · ') || r.armacao

  const dados: { rotulo: string; valor: string }[] = []
  const incluir = (rotulo: string, valor: string | null | undefined): void => {
    if (valor && valor.trim()) dados.push({ rotulo, valor: escapeHtml(valor) })
  }
  if (exibirDp && (r.dpLonge !== null || r.dpPerto !== null)) {
    incluir('DP Longe', r.dpLonge === null ? null : `${medida(r.dpLonge)} mm`)
    incluir('DP Perto', r.dpPerto === null ? null : `${medida(r.dpPerto)} mm`)
  }
  incluir('Tipo de lente', r.tipoLente)
  incluir('Índice de refração', r.indiceRefracao)
  incluir('Tratamentos', r.tratamentos)
  incluir('Armação', armacao)
  incluir('Medidas da armação', resumoMedidas(r))
  incluir('Responsável', r.profissionalNome)
  incluir('Data do exame', formatarDataBr(r.dataExame))

  return `
    <table class="presc-par"><tbody><tr><td>${blocoOlho(r, 'Od')}</td><td>${blocoOlho(r, 'Oe')}</td></tr></tbody></table>
    ${campos(dados)}
    ${r.observacao ? `<p class="nota"><strong>Observações:</strong> ${texto(r.observacao)}</p>` : ''}
    ${r.formatoAnterior ? `<p class="nota">${ROTULO_PRESCRICAO} registrada no formato anterior: o Perto é o que foi gravado na época.</p>` : ''}`
}

export function montarHtmlPrescricao(receita: ReceitaOptica, cliente: Pick<Cliente, 'nome'>, empresa: Empresa, opcoes: OpcoesPrescricao = {}): string {
  const corpo = [
    secao('Cliente', campos([{ rotulo: 'Nome', valor: texto(cliente.nome) }])),
    secao(ROTULO_PRESCRICAO, montarBlocoPrescricao(receita, opcoes)),
    assinatura('Assinatura do profissional')
  ].join('\n')

  return montarDocumento({
    titulo: `${ROTULO_PRESCRICAO} — ${cliente.nome}`,
    empresa,
    orientacao: 'retrato',
    estiloExtra: ESTILO_PRESCRICAO,
    corpo
  })
}
