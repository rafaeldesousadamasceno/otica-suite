import { type ReactNode, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardBody } from '@renderer/components/ui/Card'
import { Badge } from '@renderer/components/ui/Badge'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { toast } from '@renderer/state/toastStore'
import { Copy } from 'lucide-react'
import type { EstadoLicenca } from '@shared/types'

async function copiarFingerprint(fingerprint: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(fingerprint)
    toast.ok('Código da máquina copiado. Agora é só colar e enviar.')
  } catch {
    toast.error('Não foi possível copiar. Selecione o código e copie com Ctrl+C.')
  }
}

function formatarDataBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

const TOM_ESTADO: Record<EstadoLicenca, 'neutral' | 'ok' | 'warn' | 'danger'> = {
  teste: 'neutral',
  teste_encerrado: 'danger',
  ativa: 'ok',
  proxima_vencimento: 'warn',
  carencia: 'warn',
  vencida: 'danger'
}

const ROTULO_ESTADO: Record<EstadoLicenca, string> = {
  teste: 'Período de teste',
  teste_encerrado: 'Teste encerrado',
  ativa: 'Licença ativa',
  proxima_vencimento: 'Próxima do vencimento',
  carencia: 'Em carência',
  vencida: 'Licença vencida'
}

export function LicencaPage(): ReactNode {
  const queryClient = useQueryClient()
  const [chave, setChave] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [notasAbertas, setNotasAbertas] = useState(false)

  const status = useQuery({
    queryKey: ['licencaStatus'],
    queryFn: () => unwrap(window.api.licenca.status())
  })

  const sistema = useQuery({
    queryKey: ['sistemaInfo'],
    queryFn: () => unwrap(window.api.sistema.info())
  })

  const ativar = useMutation({
    mutationFn: () => unwrap(window.api.licenca.ativar({ chave })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['licencaStatus'] })
      toast.ok('Licença ativada.')
      setChave('')
      setErro(null)
    },
    onError: (err) => setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  const info = status.data

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-[var(--ink)]">Licença</h1>

      {sistema.data && (
        <Card>
          <CardBody className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--ink-2)]">
                Versão instalada: <span className="font-mono-tab text-[var(--ink)]">{sistema.data.versao}</span>
              </p>
              <Button variant="ghost" onClick={() => setNotasAbertas((v) => !v)}>
                {notasAbertas ? 'Ocultar notas de versão' : 'Ver notas de versão'}
              </Button>
            </div>
            {notasAbertas && (
              <pre className="whitespace-pre-wrap rounded-md bg-[var(--surface-2)] p-3 text-xs text-[var(--ink-2)]">
                {sistema.data.notas}
              </pre>
            )}
            <p className="text-xs text-[var(--ink-3)]">
              Verificação automática de atualização ainda não está disponível — quando houver uma versão nova, ela
              será distribuída como um novo instalador para você executar manualmente. A migração do banco de dados
              acontece sozinha na primeira abertura após a atualização, com backup automático antes de migrar.
            </p>
          </CardBody>
        </Card>
      )}

      {info && (
        <Card>
          <CardBody className="flex flex-col gap-2">
            <Badge tone={TOM_ESTADO[info.estado]}>{ROTULO_ESTADO[info.estado]}</Badge>
            <DescricaoEstado
              estado={info.estado}
              cliente={info.cliente}
              validade={info.validade}
              diasParaVencer={info.diasParaVencer}
            />
          </CardBody>
        </Card>
      )}

      {info && (
        <div className="flex flex-col gap-1.5">
          <ol className="list-decimal pl-5 text-sm text-[var(--ink-2)]">
            <li>Copie o código desta máquina abaixo e envie a quem forneceu o sistema.</li>
            <li>Você receberá uma chave de licença: cole no campo abaixo e clique em Ativar.</li>
            <li>
              Pode cadastrar a chave da renovação <strong>antes do vencimento</strong>: o tempo que ainda restar é
              somado, você não perde nenhum dia.
            </li>
          </ol>
          {info.chaveRecusada && (
            <p className="text-sm text-[var(--danger)]">
              {info.chaveRecusada === 'outra_maquina'
                ? 'A chave instalada foi emitida para outra máquina e está sendo ignorada. Use o código abaixo para pedir uma chave para este computador.'
                : 'A chave instalada está corrompida ou não é uma chave válida deste sistema e está sendo ignorada.'}
            </p>
          )}
          <div className="flex items-start gap-3 rounded-md bg-[var(--surface-2)] p-3">
            <p className="min-w-0 flex-1 break-all font-mono-tab text-sm text-[var(--ink)]">{info.fingerprint}</p>
            <Button variant="secondary" size="sm" onClick={() => copiarFingerprint(info.fingerprint)}>
              <Copy className="size-4" /> Copiar
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardBody className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="chave-licenca" className="text-sm font-medium text-[var(--ink-2)]">
              Chave de licença
            </label>
            <textarea
              id="chave-licenca"
              className="min-h-24 w-full rounded-md border border-[var(--rule-strong)] bg-[var(--surface)] px-3 py-2 font-mono-tab text-xs text-[var(--ink)] focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-[var(--accent)]"
              value={chave}
              onChange={(e) => setChave(e.target.value)}
              placeholder="Cole aqui a chave recebida"
              rows={4}
            />
            {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => ativar.mutate()} loading={ativar.isPending} disabled={chave.trim().length === 0}>
              Ativar
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

function DescricaoEstado({
  estado,
  cliente,
  validade,
  diasParaVencer
}: {
  estado: EstadoLicenca
  cliente: string | null
  validade: string | null
  diasParaVencer: number | null
}): ReactNode {
  switch (estado) {
    case 'teste':
      return (
        <p className="text-sm text-[var(--ink-2)]">
          Período de teste: {diasParaVencer === 1 ? 'resta 1 dia' : `restam ${diasParaVencer ?? 0} dias`}. Depois disso o
          sistema passa a ser somente leitura até ativar uma licença.
        </p>
      )
    case 'teste_encerrado':
      return (
        <p className="text-sm text-[var(--ink-2)]">
          O período de teste terminou — o sistema está em somente leitura e seus dados estão preservados. Ative uma
          licença para voltar a editar.
        </p>
      )
    case 'ativa':
      return (
        <p className="text-sm text-[var(--ink-2)]">
          {cliente ?? '—'} · {validade ? formatarDataBr(validade) : 'Licença perpétua, sem vencimento'}
        </p>
      )
    case 'proxima_vencimento':
      return <p className="text-sm text-[var(--ink-2)]">Vence em {diasParaVencer} dias.</p>
    case 'carencia':
      return (
        <p className="text-sm text-[var(--ink-2)]">
          Licença vencida há {Math.abs(diasParaVencer ?? 0)} dias — período de carência. Em breve o sistema entrará em
          modo somente leitura caso a licença não seja renovada.
        </p>
      )
    case 'vencida':
      return (
        <p className="text-sm text-[var(--ink-2)]">
          Licença vencida — o sistema está em modo somente leitura. Cadastros e vendas estão bloqueados até renovar
          (backups continuam funcionando normalmente).
        </p>
      )
    default:
      return null
  }
}
