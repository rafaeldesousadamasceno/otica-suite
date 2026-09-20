import { ehDataIso } from './chave'
import { maiorData } from './estado'

/**
 * O que o app lembra localmente: quando o teste começou e a maior data que já
 * viu no relógio. Guardado em DOIS lugares (arquivo em userData + linha no
 * banco) e mesclado — apagar um só não reinicia o teste, e apagar o outro
 * significa perder os dados do cliente.
 */
export interface EstadoLocal {
  inicioTeste: string | null
  maiorDataVista: string | null
}

/** Mescla fontes: o teste começou na data MAIS ANTIGA; a maior data vista é a MAIS RECENTE. Lixo é ignorado. */
export function mesclarEstadoLocal(fontes: Array<Partial<EstadoLocal> | null | undefined>): EstadoLocal {
  let inicio: string | null = null
  let maior: string | null = null
  for (const f of fontes) {
    if (!f) continue
    if (ehDataIso(f.inicioTeste) && (inicio === null || f.inicioTeste < inicio)) inicio = f.inicioTeste
    if (ehDataIso(f.maiorDataVista) && (maior === null || f.maiorDataVista > maior)) maior = f.maiorDataVista
  }
  return { inicioTeste: inicio, maiorDataVista: maior }
}

/**
 * "Hoje" efetivo: nunca anterior à maior data já vista, para que voltar o
 * relógio do Windows não estenda teste nem licença. O início do teste nunca
 * fica no futuro (senão bastaria gravar uma data futura para reiniciá-lo) e,
 * na primeira abertura, é hoje.
 */
export function resolverHoje(
  hojeReal: string,
  local: EstadoLocal
): { hoje: string; inicioTeste: string; maiorDataVista: string } {
  const hoje = maiorData(hojeReal, local.maiorDataVista)
  const inicioTeste = local.inicioTeste && local.inicioTeste < hoje ? local.inicioTeste : hoje
  return { hoje, inicioTeste, maiorDataVista: hoje }
}

/**
 * Nova marca do relógio ao instalar uma chave MAIS NOVA que a atual: ancora em
 * `max(emitidoEm, hoje real)`. É a saída para quem teve o relógio adiantado por
 * engano (bateria da placa, data errada) e ficou preso numa data futura — uma
 * renovação de verdade o destrava sem chamar o suporte. Só vale para chave
 * estritamente mais nova: reinstalar a mesma chave ou uma antiga não reancora,
 * senão daria para "resetar" a marca voltando o relógio.
 */
export function reancorarMarca(emitidoEm: string, hojeReal: string): string {
  return maiorData(emitidoEm, hojeReal)
}
