import { type ReactNode, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, MessageCircle, ShoppingCart, UserCheck, Wallet } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { KpiCard } from '@renderer/components/dashboard/KpiCard'
import { unwrap } from '@renderer/lib/ipc'
import { centavosParaBRL } from '@renderer/lib/dinheiro'
import { ROTULO_MOTIVO } from '@renderer/lib/motivosContato'
import { PERIODOS_RESULTADOS } from '@shared/types'
import type { MotivoContato, PeriodoResultados } from '@shared/types'

/** O que "voltar" quer dizer em cada motivo (a mesma regra que o main aplica). */
const O_QUE_CONTA: Record<MotivoContato, string> = {
  RETIRADA: 'Retirou o óculos',
  COBRANCA: 'Pagou parcela vencida',
  ANIVERSARIO: 'Comprou',
  POS_VENDA: 'Comprou',
  RENOVACAO: 'Comprou'
}

const pct = (v: number | null): string => (v === null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`)

function pctDe(voltaram: number, contatos: number): string {
  return contatos === 0 ? '—' : pct(Math.round((voltaram / contatos) * 1000) / 10)
}

/**
 * Resultados do Relacionamento (so Administrador, porque traz R$): o que aconteceu
 * DEPOIS dos contatos marcados como feitos. Mostra associacao, nao prova que o contato
 * causou a compra - por isso o aviso na tela.
 */
export function ResultadosRelacionamento(): ReactNode {
  const [dias, setDias] = useState<PeriodoResultados>(30)
  const [detalhe, setDetalhe] = useState(false)

  const resultados = useQuery({
    queryKey: ['relacionamentoResultados', dias],
    queryFn: () => unwrap(window.api.relacionamento.resultados({ dias }))
  })
  const r = resultados.data

  return (
    <section aria-labelledby="titulo-resultados" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="titulo-resultados" className="text-base font-semibold text-[var(--ink)]">
            Resultados
          </h2>
          <p className="text-sm text-[var(--ink-3)]">O que aconteceu depois dos contatos que você marcou como feitos.</p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Período dos resultados">
          {PERIODOS_RESULTADOS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={dias === p}
              onClick={() => setDias(p)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                dias === p
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'border-[var(--rule-strong)] text-[var(--ink-2)] hover:bg-[var(--surface-2)]'
              }`}
            >
              Últimos {p} dias
            </button>
          ))}
        </div>
      </div>

      {resultados.isLoading || !r ? (
        <Card className="px-4 py-6 text-center text-sm text-[var(--ink-3)]">Carregando…</Card>
      ) : r.contatos === 0 ? (
        <Card className="px-4 py-6 text-center text-sm text-[var(--ink-3)]">
          Nenhum contato registrado nos últimos {dias} dias. Quando você clicar em "Contatado", os resultados aparecem aqui.
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              icone={<MessageCircle className="size-5" />}
              rotulo="Contatos feitos"
              valor={r.contatos}
              explicacao={`Quantas vezes você marcou "Contatado" nos últimos ${dias} dias.`}
            />
            <KpiCard
              icone={<UserCheck className="size-5" />}
              rotulo="Voltaram"
              valor={r.voltaram}
              tom={r.voltaram > 0 ? 'ok' : 'neutro'}
              explicacao={`Contatos em que o cliente comprou, retirou o óculos ou pagou a parcela vencida até ${r.janelaDias} dias depois.`}
              extra={<p className="text-xs text-[var(--ink-3)]">{pct(r.percentualVoltaram)} dos contatos</p>}
            />
            <KpiCard
              icone={<ShoppingCart className="size-5" />}
              rotulo="Vendido após contato"
              valor={centavosParaBRL(r.vendidoCentavos)}
              explicacao={`Vendas feitas até ${r.janelaDias} dias depois de um contato de aniversário, pós-venda ou renovação. Cada venda conta uma vez.`}
              extra={
                <p className="text-xs text-[var(--ink-3)]">
                  {r.vendasAposContato} {r.vendasAposContato === 1 ? 'venda' : 'vendas'}
                </p>
              }
            />
            <KpiCard
              icone={<Wallet className="size-5" />}
              rotulo="Parcelas recuperadas"
              valor={r.parcelasRecuperadas}
              explicacao={`Parcelas que já estavam vencidas no dia da cobrança e receberam pagamento até ${r.janelaDias} dias depois. Cada parcela conta uma vez.`}
              extra={<p className="text-xs text-[var(--ink-3)]">{centavosParaBRL(r.recuperadoCentavos)} recebidos</p>}
            />
          </div>

          <div>
            <button
              type="button"
              aria-expanded={detalhe}
              onClick={() => setDetalhe((v) => !v)}
              className="flex items-center gap-1 text-sm text-[var(--ink-2)] hover:text-[var(--ink)]"
            >
              {detalhe ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              Ver por motivo
            </button>
            {detalhe && (
              <Card className="mt-2 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-left text-xs uppercase tracking-wide text-[var(--ink-3)]">
                      <th className="px-4 py-2 font-medium">Motivo</th>
                      <th className="px-4 py-2 font-medium">O que conta como voltar</th>
                      <th className="px-4 py-2 text-right font-medium">Contatos</th>
                      <th className="px-4 py-2 text-right font-medium">Voltaram</th>
                      <th className="px-4 py-2 text-right font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.porMotivo.map((l) => (
                      <tr key={l.motivo} className="border-b border-[var(--rule)] last:border-0">
                        <td className="px-4 py-2 font-medium text-[var(--ink)]">{ROTULO_MOTIVO[l.motivo]}</td>
                        <td className="px-4 py-2 text-[var(--ink-2)]">{O_QUE_CONTA[l.motivo]}</td>
                        <td className="font-mono-tab px-4 py-2 text-right">{l.contatos}</td>
                        <td className="font-mono-tab px-4 py-2 text-right">{l.voltaram}</td>
                        <td className="font-mono-tab px-4 py-2 text-right">{pctDe(l.voltaram, l.contatos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        </>
      )}

      <p className="text-xs text-[var(--ink-3)]">
        Conta o que aconteceu até {r?.janelaDias ?? 30} dias depois de cada contato. Mostra o que veio depois, não prova que foi por causa
        do contato: o cliente também poderia voltar sozinho. Contatos recentes ainda podem render retorno.
      </p>
    </section>
  )
}
