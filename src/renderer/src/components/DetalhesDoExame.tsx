import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { unwrap } from '@renderer/lib/ipc'
import { centavosParaBRL } from '@renderer/lib/dinheiro'
import { mascararCpf, mascararTelefone } from '@shared/mascaras'
import type { PendenciaDados } from '@shared/importacao'

/** "2025-11-03" -> "03/11/2025". Qualquer outra coisa (data que nao existe) aparece como veio, avisando. */
export function formatarDataOuAviso(valor: string | null | undefined): ReactNode {
  if (!valor) return <span className="text-[var(--ink-3)]">sem data</span>
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor)
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    if (d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])) {
      return <span className="font-mono-tab">{`${m[3]}/${m[2]}/${m[1]}`}</span>
    }
  }
  return (
    <span className="font-mono-tab text-[var(--danger)]">
      {valor} <span className="font-sans text-xs">(não é uma data válida)</span>
    </span>
  )
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }): ReactNode {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-[var(--ink-3)]">{rotulo}</dt>
      <dd className="text-sm text-[var(--ink)]">{children}</dd>
    </div>
  )
}

/**
 * Tudo o que ajuda a decidir a data certa de um exame importado: de quem e,
 * o que foi, as datas gravadas hoje e o que veio do sistema antigo.
 */
export function DetalhesDoExame({ pendenciaId, dados }: { pendenciaId: number; dados: PendenciaDados | null }): ReactNode {
  const detalhes = useQuery({
    queryKey: ['migracao', 'detalhes', pendenciaId],
    queryFn: () => unwrap(window.api.migracao.pendenciaDetalhes({ id: pendenciaId }))
  })

  if (detalhes.isLoading) return <p className="text-sm text-[var(--ink-3)]">Carregando detalhes…</p>
  if (detalhes.isError || !detalhes.data) return <p className="text-sm text-[var(--danger)]">Não foi possível carregar os detalhes deste exame.</p>
  const d = detalhes.data

  return (
    <div className="flex flex-col gap-3 rounded-md border border-[var(--rule)] bg-[var(--surface-2)] p-3">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Linha rotulo="Cliente">
          <Link to={`/clientes/${d.cliente.id}`} className="font-medium text-[var(--accent)] hover:underline">
            {d.cliente.nome || '(sem nome)'}
          </Link>
          {d.cliente.celular && <span className="text-[var(--ink-3)]"> · {mascararTelefone(d.cliente.celular)}</span>}
          {d.cliente.cpf && <span className="text-[var(--ink-3)]"> · CPF {mascararCpf(d.cliente.cpf)}</span>}
        </Linha>
        <Linha rotulo="Venda / OS">
          {d.numeroVenda}
          {d.numeroOS && d.numeroOS !== d.numeroVenda ? ` / ${d.numeroOS}` : ''}
          {d.situacaoOS ? <span className="text-[var(--ink-3)]"> · {d.situacaoOS}</span> : null}
        </Linha>
        <Linha rotulo="Item">{d.item ?? '—'}</Linha>
        <Linha rotulo="Valor">
          {centavosParaBRL(d.valorCentavos)}
          {d.formaPagamento ? <span className="text-[var(--ink-3)]"> · {d.formaPagamento}</span> : null}
        </Linha>
        <Linha rotulo="Laboratório">{d.laboratorio ?? '—'}</Linha>
        <Linha rotulo="Optometrista">{d.profissional ?? '—'}</Linha>
      </dl>

      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--ink-3)]">Datas gravadas hoje no sistema</p>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Linha rotulo="Exame">{formatarDataOuAviso(d.datas.exame)}</Linha>
          <Linha rotulo="Venda">{formatarDataOuAviso(d.datas.venda)}</Linha>
          <Linha rotulo="Abertura da OS">{formatarDataOuAviso(d.datas.abertura)}</Linha>
          <Linha rotulo="Envio ao laboratório">{formatarDataOuAviso(d.datas.envio)}</Linha>
          <Linha rotulo="Chegada">{formatarDataOuAviso(d.datas.chegada)}</Linha>
          <Linha rotulo="Entrega">{formatarDataOuAviso(d.datas.entrega)}</Linha>
        </dl>
      </div>

      {dados && (dados.origemExame || dados.origemVenda || dados.origemSaida || dados.origemChegada) && (
        <p className="text-xs text-[var(--ink-3)]">
          Como veio do sistema antigo: exame “{dados.origemExame ?? '—'}” · venda “{dados.origemVenda ?? '—'}” · envio “
          {dados.origemSaida ?? '—'}” · chegada “{dados.origemChegada ?? '—'}”.
        </p>
      )}

      {d.outros.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--ink-3)]">Outras compras deste cliente</p>
          <ul className="flex flex-col gap-0.5 text-sm text-[var(--ink-2)]">
            {d.outros.map((o) => (
              <li key={o.numero}>
                {o.numero} · exame {formatarDataOuAviso(o.dataExame)} · venda {formatarDataOuAviso(o.dataVenda)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
