import { type ReactNode, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardBody, CardHeader, CardTitle } from '@renderer/components/ui/Card'
import { Badge } from '@renderer/components/ui/Badge'
import { Button } from '@renderer/components/ui/Button'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { centavosParaBRL, centavosParaTexto, textoParaCentavos } from '@renderer/lib/dinheiro'
import { toast } from '@renderer/state/toastStore'
import type { CaixaAberto, CaixaResumo } from '@shared/types'

function formatarDataHoraBr(iso: string | null): string {
  if (!iso) return '—'
  // `datetime('now')` do SQLite volta 'YYYY-MM-DD HH:MM:SS' (UTC, sem 'Z') -
  // troca o espaco por 'T' pra o Date entender como ISO valido.
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`)
  if (Number.isNaN(d.getTime())) return iso
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const ano = d.getFullYear()
  const hora = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dia}/${mes}/${ano} ${hora}:${min}`
}

export function CaixaPage(): ReactNode {
  const queryClient = useQueryClient()
  const [movimentoAberto, setMovimentoAberto] = useState<'sangria' | 'suprimento' | null>(null)
  const [fecharAberto, setFecharAberto] = useState(false)

  const atual = useQuery({
    queryKey: ['caixa', 'atual'],
    queryFn: () => unwrap(window.api.caixa.atual())
  })

  const historico = useQuery({
    queryKey: ['caixa', 'historico'],
    queryFn: () => unwrap(window.api.caixa.listar())
  })

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-[var(--ink)]">Caixa</h1>

      {atual.data ? (
        <CaixaAbertoCard
          caixa={atual.data}
          onSangria={() => setMovimentoAberto('sangria')}
          onSuprimento={() => setMovimentoAberto('suprimento')}
          onFechar={() => setFecharAberto(true)}
        />
      ) : (
        <AbrirCaixaCard />
      )}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--rule)] bg-[var(--surface-2)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                <th className="px-4 py-2.5">Abertura</th>
                <th className="px-4 py-2.5">Fechamento</th>
                <th className="px-4 py-2.5 text-right">Saldo inicial</th>
                <th className="px-4 py-2.5 text-right">Saldo esperado</th>
                <th className="px-4 py-2.5 text-right">Saldo contado</th>
                <th className="px-4 py-2.5">Abriu</th>
                <th className="px-4 py-2.5">Fechou</th>
              </tr>
            </thead>
            <tbody>
              {historico.data?.map((c) => (
                <tr key={c.id} className="border-b border-[var(--rule)] last:border-0">
                  <td className="px-4 py-2.5 font-mono-tab text-[var(--ink-2)]">{formatarDataHoraBr(c.dataAbertura)}</td>
                  <td className="px-4 py-2.5 font-mono-tab text-[var(--ink-2)]">
                    {c.dataFechamento ? formatarDataHoraBr(c.dataFechamento) : <Badge tone="warn">Em aberto</Badge>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono-tab text-[var(--ink)]">
                    {centavosParaBRL(c.saldoInicialCentavos)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono-tab text-[var(--ink)]">
                    {centavosParaBRL(c.saldoEsperadoCentavos)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono-tab text-[var(--ink)]">
                    {centavosParaBRL(c.saldoFinalCentavos)}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--ink-2)]">{c.usuarioAberturaNome}</td>
                  <td className="px-4 py-2.5 text-[var(--ink-2)]">{c.usuarioFechamentoNome ?? '—'}</td>
                </tr>
              ))}

              {historico.data?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[var(--ink-3)]">
                    Nenhum caixa registrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <MovimentoDialog
        tipo={movimentoAberto}
        onClose={() => setMovimentoAberto(null)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['caixa', 'atual'] })
        }}
      />

      {atual.data && (
        <FecharCaixaDialog
          open={fecharAberto}
          caixa={atual.data}
          onClose={() => setFecharAberto(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['caixa', 'atual'] })
            queryClient.invalidateQueries({ queryKey: ['caixa', 'historico'] })
          }}
        />
      )}
    </div>
  )
}

function AbrirCaixaCard(): ReactNode {
  const queryClient = useQueryClient()
  const [saldoTexto, setSaldoTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const abrir = useMutation({
    mutationFn: () => unwrap(window.api.caixa.abrir({ saldoInicialCentavos: textoParaCentavos(saldoTexto) })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caixa', 'atual'] })
      queryClient.invalidateQueries({ queryKey: ['caixa', 'historico'] })
      toast.ok('Caixa aberto.')
      setSaldoTexto('')
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <p className="text-sm text-[var(--ink-2)]">Nenhum caixa aberto.</p>
        <form
          className="flex items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            setErro(null)
            abrir.mutate()
          }}
        >
          <Field label="Saldo inicial (R$)" className="w-48">
            <Input
              className="font-mono-tab"
              value={saldoTexto}
              onChange={(e) => setSaldoTexto(e.target.value)}
              placeholder="0,00"
              autoFocus
            />
          </Field>
          <Button type="submit" loading={abrir.isPending}>
            Abrir caixa
          </Button>
        </form>
        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}
      </CardBody>
    </Card>
  )
}

interface CaixaAbertoCardProps {
  caixa: CaixaAberto
  onSangria: () => void
  onSuprimento: () => void
  onFechar: () => void
}

function CaixaAbertoCard({ caixa, onSangria, onSuprimento, onFechar }: CaixaAbertoCardProps): ReactNode {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Caixa aberto</CardTitle>
        <Badge tone="ok">Aberto</Badge>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-[var(--ink-3)]">Abertura</p>
            <p className="font-mono-tab text-sm text-[var(--ink)]">{formatarDataHoraBr(caixa.dataAbertura)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--ink-3)]">Aberto por</p>
            <p className="text-sm text-[var(--ink)]">{caixa.usuarioAberturaNome}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--ink-3)]">Saldo inicial</p>
            <p className="font-mono-tab text-sm text-[var(--ink)]">{centavosParaBRL(caixa.saldoInicialCentavos)}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--ink-3)]">Saldo esperado</p>
            <p className="font-mono-tab text-lg font-semibold text-[var(--ink)]">
              {centavosParaBRL(caixa.saldoEsperadoCentavos)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[var(--rule)] pt-4">
          <Button type="button" variant="secondary" onClick={onSangria}>
            Sangria
          </Button>
          <Button type="button" variant="secondary" onClick={onSuprimento}>
            Suprimento
          </Button>
          <Button type="button" variant="danger" onClick={onFechar}>
            Fechar caixa
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}

interface MovimentoDialogProps {
  tipo: 'sangria' | 'suprimento' | null
  onClose: () => void
  onSuccess: () => void
}

function MovimentoDialog({ tipo, onClose, onSuccess }: MovimentoDialogProps): ReactNode {
  const [valorTexto, setValorTexto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (tipo) {
      setValorTexto('')
      setMotivo('')
      setErro(null)
    }
  }, [tipo])

  const mutation = useMutation({
    mutationFn: () => {
      const input = { valorCentavos: textoParaCentavos(valorTexto), motivo }
      return tipo === 'sangria' ? unwrap(window.api.caixa.sangria(input)) : unwrap(window.api.caixa.suprimento(input))
    },
    onSuccess: () => {
      toast.ok(tipo === 'sangria' ? 'Sangria registrada.' : 'Suprimento registrado.')
      onSuccess()
      onClose()
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  return (
    <Dialog open={tipo !== null} onClose={onClose} title={tipo === 'sangria' ? 'Sangria' : 'Suprimento'} className="max-w-md">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          setErro(null)
          mutation.mutate()
        }}
      >
        <Field label="Valor (R$)" required>
          <Input
            className="font-mono-tab"
            value={valorTexto}
            onChange={(e) => setValorTexto(e.target.value)}
            placeholder="0,00"
            autoFocus
          />
        </Field>
        <Field label="Motivo" required>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Field>

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex justify-end gap-2 border-t border-[var(--rule)] pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={!valorTexto || !motivo.trim()}>
            Confirmar
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

interface FecharCaixaDialogProps {
  open: boolean
  caixa: CaixaAberto
  onClose: () => void
  onSuccess: () => void
}

function FecharCaixaDialog({ open, caixa, onClose, onSuccess }: FecharCaixaDialogProps): ReactNode {
  const [saldoContadoTexto, setSaldoContadoTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSaldoContadoTexto(centavosParaTexto(caixa.saldoEsperadoCentavos))
      setErro(null)
    }
  }, [open, caixa.saldoEsperadoCentavos])

  const fechar = useMutation({
    mutationFn: () => unwrap(window.api.caixa.fechar({ saldoContadoCentavos: textoParaCentavos(saldoContadoTexto) })),
    onSuccess: (resumo: CaixaResumo) => {
      const diferenca = (resumo.saldoFinalCentavos ?? 0) - resumo.saldoEsperadoCentavos
      if (diferenca !== 0) {
        toast.ok(
          `Caixa fechado. Diferença de ${centavosParaBRL(Math.abs(diferenca))} ${diferenca > 0 ? 'a mais' : 'a menos'} em relação ao esperado.`
        )
      } else {
        toast.ok('Caixa fechado.')
      }
      onSuccess()
      onClose()
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  return (
    <Dialog open={open} onClose={onClose} title="Fechar caixa" className="max-w-md">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          setErro(null)
          fechar.mutate()
        }}
      >
        <p className="text-sm text-[var(--ink-2)]">
          Saldo esperado: <span className="font-mono-tab font-semibold text-[var(--ink)]">{centavosParaBRL(caixa.saldoEsperadoCentavos)}</span>
        </p>
        <Field label="Saldo contado (R$)" required>
          <Input
            className="font-mono-tab"
            value={saldoContadoTexto}
            onChange={(e) => setSaldoContadoTexto(e.target.value)}
            placeholder="0,00"
            autoFocus
          />
        </Field>

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex justify-end gap-2 border-t border-[var(--rule)] pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="danger" loading={fechar.isPending} disabled={!saldoContadoTexto}>
            Confirmar fechamento
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
