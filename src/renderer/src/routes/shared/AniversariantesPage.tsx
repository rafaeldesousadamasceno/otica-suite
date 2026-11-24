import { type ReactNode, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, Printer } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { Select } from '@renderer/components/ui/Select'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { toast } from '@renderer/state/toastStore'
import { normalizarCelularBR } from '@shared/whatsapp'
import { useGerarPdf } from '@renderer/lib/useGerarPdf'
import { MESES } from '@shared/types'

function formatarDataBr(iso: string | null): string {
  if (!iso) return '—'
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

export function AniversariantesPage(): ReactNode {
  const [mes, setMes] = useState<number | null>(new Date().getMonth() + 1)
  const navigate = useNavigate()

  const aniversariantes = useQuery({
    queryKey: ['aniversariantes', mes],
    queryFn: () => unwrap(window.api.clientes.aniversariantes({ mes }))
  })

  const imprimir = useGerarPdf(() => window.api.relatorios.aniversariantes({ mes }))

  // Abre a conversa no WhatsApp com a mensagem de aniversario ja pronta (a mesma do Relacionamento); o link e montado no servidor.
  const whatsapp = useMutation({
    mutationFn: (clienteId: number) => unwrap(window.api.relacionamento.abrirWhatsappAniversario({ id: clienteId })),
    onSuccess: () => toast.ok('WhatsApp aberto com a mensagem de aniversário.'),
    onError: (err) => toast.error(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[var(--ink)]">Aniversariantes</h1>
        <div className="flex items-center gap-2">
          <Select
            className="w-48"
            value={mes ?? ''}
            onChange={(e) => setMes(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Todos os meses</option>
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
          <Button variant="secondary" loading={imprimir.isPending} onClick={() => imprimir.mutate()}>
            <Printer className="size-4" /> Imprimir
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
              <th className="px-4 py-2.5">Nome</th>
              <th className="px-4 py-2.5">Nascimento</th>
              <th className="px-4 py-2.5">Celular</th>
              <th className="w-36 px-4 py-2.5 text-right">WhatsApp</th>
            </tr>
          </thead>
          <tbody>
            {aniversariantes.data?.map((c) => (
              <tr
                key={c.id}
                onClick={() => navigate(`/clientes/${c.id}`)}
                className="cursor-pointer border-b border-[var(--rule)] last:border-0 hover:bg-[var(--surface-2)]"
              >
                <td className="px-4 py-2.5 font-medium text-[var(--ink)]">{c.nome}</td>
                <td className="px-4 py-2.5 font-mono-tab text-[var(--ink-2)]">{formatarDataBr(c.dataNasc)}</td>
                <td className="px-4 py-2.5 text-[var(--ink-2)]">{c.celular ?? '—'}</td>
                <td className="px-4 py-2 text-right">
                  {normalizarCelularBR(c.celular) ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={whatsapp.isPending && whatsapp.variables === c.id}
                      aria-label={`Enviar mensagem de aniversário para ${c.nome} no WhatsApp`}
                      title="Abre o WhatsApp com a mensagem de aniversário pronta"
                      onClick={(e) => {
                        e.stopPropagation() // a linha abre a ficha do cliente
                        whatsapp.mutate(c.id)
                      }}
                    >
                      <MessageCircle className="size-4" /> WhatsApp
                    </Button>
                  ) : (
                    <span className="text-xs text-[var(--ink-3)]" title="Sem celular válido cadastrado">
                      sem celular
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {aniversariantes.data?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[var(--ink-3)]">
                  Nenhum aniversariante neste período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
