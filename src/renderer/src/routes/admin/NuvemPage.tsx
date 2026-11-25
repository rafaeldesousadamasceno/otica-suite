import { type ReactNode, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardBody, CardHeader, CardTitle } from '@renderer/components/ui/Card'
import { Badge } from '@renderer/components/ui/Badge'
import { Button } from '@renderer/components/ui/Button'
import { Dialog } from '@renderer/components/ui/Dialog'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { toast } from '@renderer/state/toastStore'
import { TERMO_NUVEM_TEXTO, TERMO_NUVEM_VERSAO } from '@shared/termoNuvem'
import type { NuvemEstado } from '@shared/types'

type Tom = 'neutral' | 'ok' | 'warn' | 'danger' | 'accent'

const ESTADOS: Record<NuvemEstado, { rotulo: string; tom: Tom; frase: string }> = {
  ok: { rotulo: 'Em dia', tom: 'ok', frase: 'Tudo enviado. A nuvem está em dia com este computador.' },
  sincronizando: { rotulo: 'Enviando', tom: 'accent', frase: 'Enviando as alterações para a nuvem agora.' },
  aguardando: { rotulo: 'Aguardando', tom: 'accent', frase: 'Aguardando a hora do próximo envio.' },
  sem_internet: {
    rotulo: 'Sem internet',
    tom: 'warn',
    frase: 'Sem internet. O sistema continua funcionando e tenta de novo sozinho.'
  },
  aguardando_aprovacao: {
    rotulo: 'Aguardando aprovação',
    tom: 'warn',
    frase: 'Este computador precisa ser aprovado pelo Administrador no celular.'
  },
  sem_licenca: {
    rotulo: 'Sem licença',
    tom: 'warn',
    frase: 'A licença deste computador não permite o envio no momento. Veja a tela Licença.'
  },
  nao_configurada: {
    rotulo: 'Não configurada',
    tom: 'warn',
    frase: 'A nuvem ainda não está configurada nesta instalação.'
  },
  revogado: {
    rotulo: 'Acesso revogado',
    tom: 'danger',
    frase: 'O acesso deste computador à nuvem foi revogado. Os envios automáticos estão parados.'
  },
  erro: { rotulo: 'Erro', tom: 'danger', frase: 'Não foi possível enviar. O sistema tenta de novo sozinho.' },
  desligada: { rotulo: 'Desligada', tom: 'neutral', frase: 'A nuvem está desligada. Nada é enviado.' }
}

function formatarDataHoraBr(iso: string): string {
  const d = new Date(iso)
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const hora = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dia}/${mes}/${d.getFullYear()} ${hora}:${min}`
}

function mensagemErro(err: unknown): string {
  return err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.'
}

export function NuvemPage(): ReactNode {
  const queryClient = useQueryClient()
  const [ligando, setLigando] = useState(false)
  const [desligando, setDesligando] = useState(false)

  const status = useQuery({
    queryKey: ['nuvemStatus'],
    queryFn: () => unwrap(window.api.nuvem.status()),
    refetchInterval: 15000
  })

  const atualizar = (): Promise<void> => queryClient.invalidateQueries({ queryKey: ['nuvemStatus'] })

  const desligar = useMutation({
    mutationFn: () => unwrap(window.api.nuvem.desligar()),
    onSuccess: () => {
      setDesligando(false)
      void atualizar()
      toast.ok('Nuvem desligada.')
    },
    onError: (err) => toast.error(mensagemErro(err))
  })

  const sincronizar = useMutation({
    mutationFn: () => unwrap(window.api.nuvem.sincronizarAgora()),
    onSuccess: () => {
      void atualizar()
      toast.ok('Envio solicitado.')
    },
    onError: (err) => toast.error(mensagemErro(err))
  })

  const s = status.data
  const info = s ? ESTADOS[s.estado] : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[var(--ink)]">Nuvem e celular</h1>
        <div className="flex gap-2">
          {s?.ligada && (
            <Button variant="secondary" onClick={() => sincronizar.mutate()} loading={sincronizar.isPending}>
              Sincronizar agora
            </Button>
          )}
          {s &&
            (s.ligada ? (
              <Button variant="secondary" onClick={() => setDesligando(true)}>
                Desligar
              </Button>
            ) : (
              <Button onClick={() => setLigando(true)}>Ligar</Button>
            ))}
        </div>
      </div>

      <p className="text-sm text-[var(--ink-2)]">
        O acesso pelo celular ainda não está disponível nesta versão. Por enquanto, a nuvem só guarda uma cópia dos dados.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Estado</CardTitle>
        </CardHeader>
        <CardBody>
          {status.isError && <p className="text-sm text-[var(--danger)]">{mensagemErro(status.error)}</p>}
          {s && info && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Badge tone={info.tom}>{info.rotulo}</Badge>
                <p className="text-sm text-[var(--ink)]">{info.frase}</p>
              </div>
              {s.ligada && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-[var(--ink-2)]">
                  <dt>Último envio</dt>
                  <dd>{s.ultimoEnvioEm ? formatarDataHoraBr(s.ultimoEnvioEm) : 'Ainda não houve envio.'}</dd>
                  <dt>Alterações pendentes</dt>
                  <dd className="font-mono-tab">{s.pendentes}</dd>
                  {s.ultimoErro && (
                    <>
                      <dt>Último erro</dt>
                      <dd className="text-[var(--danger)]">{s.ultimoErro}</dd>
                    </>
                  )}
                </dl>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <LigarDialog
        open={ligando}
        onClose={() => setLigando(false)}
        onLigada={() => {
          setLigando(false)
          void atualizar()
          toast.ok('Nuvem ligada.')
        }}
      />

      <Dialog open={desligando} onClose={() => setDesligando(false)} title="Desligar a nuvem" className="max-w-md">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--ink)]">
            Depois de desligar, nada novo é enviado. Os dados já enviados continuam na nuvem.
          </p>
          <div className="flex justify-end gap-2 border-t border-[var(--rule)] pt-4">
            <Button type="button" variant="ghost" onClick={() => setDesligando(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="danger" loading={desligar.isPending} onClick={() => desligar.mutate()}>
              Desligar
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

interface LigarProps {
  open: boolean
  onClose: () => void
  onLigada: () => void
}

function LigarDialog({ open, onClose, onLigada }: LigarProps): ReactNode {
  const [concordo, setConcordo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const ligar = useMutation({
    mutationFn: () => unwrap(window.api.nuvem.ligar({ versaoTermo: TERMO_NUVEM_VERSAO })),
    onSuccess: () => {
      fechar()
      onLigada()
    },
    onError: (err) => setErro(mensagemErro(err))
  })

  function fechar(): void {
    setConcordo(false)
    setErro(null)
    onClose()
  }

  if (!open) return null

  return (
    <Dialog open={open} onClose={fechar} title="Ligar a nuvem" className="max-w-lg">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 text-sm text-[var(--ink)]">
          {TERMO_NUVEM_TEXTO.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-[var(--ink)]">
          <input type="checkbox" checked={concordo} onChange={(e) => setConcordo(e.target.checked)} />
          Li e concordo
        </label>

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex justify-end gap-2 border-t border-[var(--rule)] pt-4">
          <Button type="button" variant="ghost" onClick={fechar}>
            Cancelar
          </Button>
          <Button type="button" disabled={!concordo} loading={ligar.isPending} onClick={() => ligar.mutate()}>
            Ligar a nuvem
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
