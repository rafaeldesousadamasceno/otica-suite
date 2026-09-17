import { type ReactNode, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, Trash2, FilePlus2, Phone, Mail, MapPin, ClipboardList, ShoppingCart } from 'lucide-react'
import { Card, CardBody } from '@renderer/components/ui/Card'
import { Badge } from '@renderer/components/ui/Badge'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { centavosParaBRL } from '@renderer/lib/dinheiro'
import { ClienteFormDialog } from '@renderer/components/ClienteFormDialog'
import { ReceitaOpticaFormDialog } from '@renderer/components/ReceitaOpticaFormDialog'
import { ReceitaOpticaCard } from '@renderer/components/ReceitaOpticaCard'
import { OrdemServicoFormDialog } from '@renderer/components/OrdemServicoFormDialog'
import { OrdemServicoDetailDialog } from '@renderer/components/OrdemServicoDetailDialog'
import { VendaFormDialog } from '@renderer/components/VendaFormDialog'
import { VendaDetailDialog } from '@renderer/components/VendaDetailDialog'
import { TOM_SITUACAO_OS } from '@renderer/lib/situacaoOSTone'
import { toast } from '@renderer/state/toastStore'

function formatarDataBr(iso: string | null): string {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

export function ClienteDetailPage(): ReactNode {
  const { id } = useParams<{ id: string }>()
  const clienteId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editarOpen, setEditarOpen] = useState(false)
  const [novaReceitaOpen, setNovaReceitaOpen] = useState(false)
  const [novaOsOpen, setNovaOsOpen] = useState(false)
  const [osSelecionada, setOsSelecionada] = useState<number | null>(null)
  const [novaVendaOpen, setNovaVendaOpen] = useState(false)
  const [vendaSelecionada, setVendaSelecionada] = useState<number | null>(null)

  const cliente = useQuery({
    queryKey: ['cliente', clienteId],
    queryFn: () => unwrap(window.api.clientes.get({ id: clienteId }))
  })

  const receitas = useQuery({
    queryKey: ['receitas', clienteId],
    queryFn: () => unwrap(window.api.receitas.listByCliente({ clienteId }))
  })

  const ordensServico = useQuery({
    queryKey: ['ordensServico', 'cliente', clienteId],
    queryFn: () => unwrap(window.api.ordensServico.listByCliente({ clienteId }))
  })

  const vendas = useQuery({
    queryKey: ['vendas', 'cliente', clienteId],
    queryFn: () => unwrap(window.api.vendas.listByCliente({ clienteId }))
  })

  const remover = useMutation({
    mutationFn: () => unwrap(window.api.clientes.inativar({ id: clienteId })),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] })
      toast.ok(r.modo === 'excluido' ? 'Cliente removido.' : 'Cliente inativado (possui histórico).')
      navigate('/clientes')
    },
    onError: (err) => {
      toast.error(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
    }
  })

  if (cliente.isLoading) return <p className="text-sm text-[var(--ink-3)]">Carregando…</p>
  if (!cliente.data) return <p className="text-sm text-[var(--ink-3)]">Cliente não encontrado.</p>

  const c = cliente.data
  const endereco = [c.logradouro, c.numero, c.bairro, c.cidade && `${c.cidade}/${c.uf}`]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/clientes')}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold text-[var(--ink)]">{c.nome}</h1>
            <p className="text-sm text-[var(--ink-3)]">Cliente desde {formatarDataBr(c.criadoEm.slice(0, 10))}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditarOpen(true)}>
            <Pencil className="size-4" /> Editar
          </Button>
          <Button
            variant="danger"
            loading={remover.isPending}
            onClick={() => {
              if (confirm(`Remover o cliente ${c.nome}?`)) remover.mutate()
            }}
          >
            <Trash2 className="size-4" /> Remover
          </Button>
        </div>
      </div>

      <Card>
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex items-start gap-2">
            <Phone className="mt-0.5 size-4 shrink-0 text-[var(--ink-3)]" />
            <div>
              <p className="text-xs text-[var(--ink-3)]">Contato</p>
              <p className="text-sm text-[var(--ink)]">{c.celular || c.telefone || '—'}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Mail className="mt-0.5 size-4 shrink-0 text-[var(--ink-3)]" />
            <div>
              <p className="text-xs text-[var(--ink-3)]">E-mail</p>
              <p className="text-sm text-[var(--ink)]">{c.email || '—'}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--ink-3)]" />
            <div>
              <p className="text-xs text-[var(--ink-3)]">Endereço</p>
              <p className="text-sm text-[var(--ink)]">{endereco || '—'}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-[var(--ink-3)]">CPF</p>
            <p className="font-mono-tab text-sm text-[var(--ink)]">{c.cpf || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--ink-3)]">Nascimento</p>
            <p className="font-mono-tab text-sm text-[var(--ink)]">{formatarDataBr(c.dataNasc)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--ink-3)]">Profissão</p>
            <p className="text-sm text-[var(--ink)]">{c.profissao || '—'}</p>
          </div>
        </CardBody>
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--ink)]">Receitas ópticas</h2>
          <Button onClick={() => setNovaReceitaOpen(true)}>
            <FilePlus2 className="size-4" /> Nova receita
          </Button>
        </div>

        {receitas.data?.length === 0 && (
          <Card>
            <CardBody className="text-center text-sm text-[var(--ink-3)]">
              Nenhuma receita registrada ainda.
            </CardBody>
          </Card>
        )}

        <div className="flex flex-col gap-3">
          {receitas.data?.map((r) => (
            <ReceitaOpticaCard key={r.id} receita={r} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--ink)]">Ordens de Serviço</h2>
          <Button onClick={() => setNovaOsOpen(true)}>
            <ClipboardList className="size-4" /> Nova OS
          </Button>
        </div>

        {ordensServico.data?.length === 0 && (
          <Card>
            <CardBody className="text-center text-sm text-[var(--ink-3)]">
              Nenhuma ordem de serviço aberta ainda.
            </CardBody>
          </Card>
        )}

        {ordensServico.data && ordensServico.data.length > 0 && (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {ordensServico.data.map((os) => (
                  <tr
                    key={os.id}
                    onClick={() => setOsSelecionada(os.id)}
                    className="cursor-pointer border-b border-[var(--rule)] last:border-0 hover:bg-[var(--surface-2)]"
                  >
                    <td className="px-4 py-2.5 font-mono-tab font-medium text-[var(--accent)]">{os.numero}</td>
                    <td className="px-4 py-2.5 text-[var(--ink-2)]">{os.laboratorio ?? '—'}</td>
                    <td className="px-4 py-2.5 font-mono-tab text-[var(--ink-2)]">
                      {formatarDataBr(os.dataAbertura)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={TOM_SITUACAO_OS[os.situacao]}>{os.situacao}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--ink)]">Vendas</h2>
          <Button onClick={() => setNovaVendaOpen(true)}>
            <ShoppingCart className="size-4" /> Nova venda
          </Button>
        </div>

        {vendas.data?.length === 0 && (
          <Card>
            <CardBody className="text-center text-sm text-[var(--ink-3)]">Nenhuma venda registrada ainda.</CardBody>
          </Card>
        )}

        {vendas.data && vendas.data.length > 0 && (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {vendas.data.map((v) => (
                  <tr
                    key={v.id}
                    onClick={() => setVendaSelecionada(v.id)}
                    className="cursor-pointer border-b border-[var(--rule)] last:border-0 hover:bg-[var(--surface-2)]"
                  >
                    <td className="px-4 py-2.5 font-mono-tab font-medium text-[var(--accent)]">{v.numero}</td>
                    <td className="px-4 py-2.5 font-mono-tab text-[var(--ink-2)]">{formatarDataBr(v.data)}</td>
                    <td className="px-4 py-2.5 text-right font-mono-tab font-medium text-[var(--ink)]">
                      {centavosParaBRL(v.totalCentavos)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={v.situacao === 'CANCELADA' ? 'danger' : 'ok'}>{v.situacao}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <ClienteFormDialog open={editarOpen} onClose={() => setEditarOpen(false)} clienteExistente={c} />
      <ReceitaOpticaFormDialog
        open={novaReceitaOpen}
        onClose={() => setNovaReceitaOpen(false)}
        clienteId={clienteId}
      />
      <OrdemServicoFormDialog
        open={novaOsOpen}
        onClose={() => setNovaOsOpen(false)}
        clienteFixo={{ id: c.id, nome: c.nome, celular: c.celular, cpf: c.cpf, dataNasc: c.dataNasc }}
        onCreated={(id) => setOsSelecionada(id)}
      />
      <OrdemServicoDetailDialog osId={osSelecionada} onClose={() => setOsSelecionada(null)} />
      <VendaFormDialog
        open={novaVendaOpen}
        onClose={() => setNovaVendaOpen(false)}
        clienteFixo={{ id: c.id, nome: c.nome, celular: c.celular, cpf: c.cpf, dataNasc: c.dataNasc }}
        onCreated={(id) => setVendaSelecionada(id)}
      />
      <VendaDetailDialog vendaId={vendaSelecionada} onClose={() => setVendaSelecionada(null)} />
    </div>
  )
}
