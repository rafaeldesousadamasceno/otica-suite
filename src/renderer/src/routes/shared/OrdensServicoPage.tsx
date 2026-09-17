import { type ReactNode, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Search, FilePlus2, AlertTriangle, Printer } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { Button } from '@renderer/components/ui/Button'
import { Badge } from '@renderer/components/ui/Badge'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { toast } from '@renderer/state/toastStore'
import { useDebouncedValue } from '@renderer/lib/useDebouncedValue'
import { TOM_SITUACAO_OS } from '@renderer/lib/situacaoOSTone'
import { FLUXO_SITUACAO_OS } from '@shared/types'
import { OrdemServicoFormDialog } from '@renderer/components/OrdemServicoFormDialog'
import { OrdemServicoDetailDialog } from '@renderer/components/OrdemServicoDetailDialog'

function formatarDataBr(iso: string | null): string {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

/**
 * RF-06: gestao da OS e, ao mesmo tempo, o "Protocolo de saida" do sistema
 * anterior - os mesmos filtros (busca, situacao, periodo) sobre os mesmos
 * dados. So falta a versao impressa em PDF, que chega com o modulo de
 * Relatórios (RF-12, fase F5).
 */
export function OrdensServicoPage(): ReactNode {
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState('')
  const [apenasAtrasadas, setApenasAtrasadas] = useState(false)
  const [novaOpen, setNovaOpen] = useState(false)
  const [osSelecionada, setOsSelecionada] = useState<number | null>(null)
  const buscaDebounced = useDebouncedValue(busca)

  const query = { busca: buscaDebounced, situacao, apenasAtrasadas }
  const ordens = useQuery({
    queryKey: ['ordensServico', query],
    queryFn: () => unwrap(window.api.ordensServico.list(query))
  })

  const imprimirProtocolo = useMutation({
    mutationFn: () => unwrap(window.api.relatorios.protocoloSaida(query)),
    onSuccess: (resultado) => {
      if (resultado) toast.ok(`PDF salvo em ${resultado.caminho}`)
    },
    onError: (err) => toast.error(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[var(--ink)]">Ordens de Serviço</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            loading={imprimirProtocolo.isPending}
            onClick={() => imprimirProtocolo.mutate()}
          >
            <Printer className="size-4" /> Imprimir protocolo
          </Button>
          <Button onClick={() => setNovaOpen(true)}>
            <FilePlus2 className="size-4" /> Nova OS
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-3)]" />
          <Input
            className="pl-9"
            placeholder="Cliente ou nº da OS…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Select className="w-48" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
          <option value="">Todas as situações</option>
          {FLUXO_SITUACAO_OS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          <option value="CANCELADA">CANCELADA</option>
        </Select>
        <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
          <input
            type="checkbox"
            checked={apenasAtrasadas}
            onChange={(e) => setApenasAtrasadas(e.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          Só atrasadas
        </label>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                <th className="px-4 py-2.5">Nº OS</th>
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Laboratório</th>
                <th className="px-4 py-2.5">Abertura</th>
                <th className="px-4 py-2.5">Previsão</th>
                <th className="px-4 py-2.5">Situação</th>
              </tr>
            </thead>
            <tbody>
              {ordens.data?.map((os) => (
                <tr
                  key={os.id}
                  onClick={() => setOsSelecionada(os.id)}
                  className="cursor-pointer border-b border-[var(--rule)] last:border-0 hover:bg-[var(--surface-2)]"
                >
                  <td className="px-4 py-2.5 font-mono-tab font-medium text-[var(--accent)]">{os.numero}</td>
                  <td className="px-4 py-2.5 text-[var(--ink)]">{os.clienteNome}</td>
                  <td className="px-4 py-2.5 text-[var(--ink-2)]">{os.laboratorio ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono-tab text-[var(--ink-2)]">{formatarDataBr(os.dataAbertura)}</td>
                  <td className="px-4 py-2.5 font-mono-tab text-[var(--ink-2)]">{formatarDataBr(os.dataPrevisao)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {os.atrasada && <AlertTriangle className="size-3.5 text-[var(--danger)]" />}
                      <Badge tone={TOM_SITUACAO_OS[os.situacao]}>{os.situacao}</Badge>
                    </div>
                  </td>
                </tr>
              ))}

              {ordens.data?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[var(--ink-3)]">
                    Nenhuma ordem de serviço encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <OrdemServicoFormDialog
        open={novaOpen}
        onClose={() => setNovaOpen(false)}
        onCreated={(id) => setOsSelecionada(id)}
      />
      <OrdemServicoDetailDialog osId={osSelecionada} onClose={() => setOsSelecionada(null)} />
    </div>
  )
}
