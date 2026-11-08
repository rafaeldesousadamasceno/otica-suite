import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardBody } from '@renderer/components/ui/Card'
import { Badge } from '@renderer/components/ui/Badge'
import { Button } from '@renderer/components/ui/Button'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { ClienteFormDialog } from '@renderer/components/ClienteFormDialog'
import { DetalhesDoExame, formatarDataOuAviso } from '@renderer/components/DetalhesDoExame'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { toast } from '@renderer/state/toastStore'
import type { Cliente } from '@shared/types'
import { contemBusca } from '@shared/texto'
import {
  CAMPOS_DATA_EXAME,
  ROTULO_CAMPO_DATA,
  ROTULO_TIPO_PENDENCIA,
  TIPOS_PENDENCIA,
  type CampoDataExame,
  type Pendencia,
  type StatusPendencia,
  type TipoPendencia
} from '@shared/importacao'

const POR_PAGINA = 25

const TOM_GRAVIDADE: Record<Pendencia['gravidade'], 'danger' | 'warn' | 'neutral'> = {
  erro: 'danger',
  atencao: 'warn',
  info: 'neutral'
}

const ROTULO_STATUS: Record<StatusPendencia, string> = {
  ABERTA: 'Abertas',
  RESOLVIDA: 'Resolvidas',
  IGNORADA: 'Ignoradas'
}

/** Tipos em que nao ha o que corrigir dentro do sistema: o exame nem chegou a ser importado. */
const SEM_CORRECAO_AQUI: TipoPendencia[] = ['EXAME_SEM_CLIENTE', 'CLIENTE_INEXISTENTE_NA_ORIGEM']

function mensagem(err: unknown): string {
  return err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.'
}

const TIPOS_DE_DATA: TipoPendencia[] = ['DATA_INCOERENTE', 'DATA_AUSENTE', 'DATA_INVALIDA']

function temSugestaoDeData(p: Pendencia): boolean {
  return p.status === 'ABERTA' && TIPOS_DE_DATA.includes(p.tipo) && !!p.dados?.sugerido && p.destinoId !== null
}

/** Palpite (ex.: usar a data da venda): so se aplica um a um, depois de conferir. Nao entra nas acoes em lote. */
function ehEstimativa(p: Pendencia): boolean {
  return p.dados?.estimativa === 'sim'
}

export function PendenciasImportacaoPage(): ReactNode {
  const [status, setStatus] = useState<StatusPendencia>('ABERTA')
  const [tipo, setTipo] = useState<TipoPendencia | ''>('')
  const [busca, setBusca] = useState('')
  const [visiveis, setVisiveis] = useState(POR_PAGINA)
  const [editando, setEditando] = useState<{ cliente: Cliente; pendenciaId: number } | null>(null)
  const [dataDialog, setDataDialog] = useState<Pendencia | null>(null)
  const queryClient = useQueryClient()

  // Voltar ao inicio da lista sempre que o filtro muda.
  useEffect(() => setVisiveis(POR_PAGINA), [status, tipo, busca])

  const resumo = useQuery({
    queryKey: ['migracao', 'pendencias-resumo', status],
    queryFn: () => unwrap(window.api.migracao.pendenciasResumo({ status }))
  })
  const pendencias = useQuery({
    queryKey: ['migracao', 'pendencias', status, tipo],
    queryFn: () => unwrap(window.api.migracao.pendenciasListar({ status, tipo: tipo || undefined }))
  })

  function aoMudar(): void {
    void queryClient.invalidateQueries({ queryKey: ['migracao'] })
    // O que foi corrigido aparece nas telas de cliente, vendas e OS.
    for (const chave of ['receitas', 'vendas', 'venda', 'ordensServico', 'ordemServico', 'clientes']) {
      void queryClient.invalidateQueries({ queryKey: [chave] })
    }
  }

  const aplicar = useMutation({
    mutationFn: (id: number) => unwrap(window.api.migracao.pendenciaAplicar({ id })),
    onSuccess: () => {
      toast.ok('Data corrigida.')
      aoMudar()
    },
    onError: (err) => toast.error(mensagem(err))
  })
  const resolver = useMutation({
    mutationFn: (id: number) => unwrap(window.api.migracao.pendenciaResolver({ id })),
    onSuccess: aoMudar,
    onError: (err) => toast.error(mensagem(err))
  })
  const ignorar = useMutation({
    mutationFn: (id: number) => unwrap(window.api.migracao.pendenciaIgnorar({ id })),
    onSuccess: aoMudar,
    onError: (err) => toast.error(mensagem(err))
  })
  const reabrir = useMutation({
    mutationFn: (id: number) => unwrap(window.api.migracao.pendenciaReabrir({ id })),
    onSuccess: () => {
      toast.ok('Pendência reaberta: ela voltou para a lista de abertas.')
      aoMudar()
    },
    onError: (err) => toast.error(mensagem(err))
  })
  const aplicarVarias = useMutation({
    mutationFn: (ids: number[]) => unwrap(window.api.migracao.pendenciasAplicarVarias({ ids })),
    onSuccess: (r) => {
      toast.ok(`${r.aplicadas} data(s) corrigida(s)${r.puladas > 0 ? `; ${r.puladas} não deu (já alteradas)` : ''}.`)
      aoMudar()
    },
    onError: (err) => toast.error(mensagem(err))
  })
  const ignorarVarias = useMutation({
    mutationFn: (ids: number[]) => unwrap(window.api.migracao.pendenciasIgnorarVarias({ ids })),
    onSuccess: (r) => {
      toast.ok(`${r.ignoradas} pendência(s) ignorada(s).`)
      aoMudar()
    },
    onError: (err) => toast.error(mensagem(err))
  })

  const abrirCadastro = useMutation({
    mutationFn: async (p: Pendencia) => ({ cliente: await unwrap(window.api.clientes.get({ id: p.destinoId as number })), pendenciaId: p.id }),
    onSuccess: setEditando,
    onError: (err) => toast.error(mensagem(err))
  })

  const filtradas = useMemo(() => {
    const termo = busca.trim()
    const todas = pendencias.data ?? []
    if (!termo) return todas
    return todas.filter((p) => contemBusca(p.motivo, termo) || String(p.origemId) === termo)
  }, [pendencias.data, busca])

  const totalGeral = Object.values(resumo.data ?? {}).reduce((soma, n) => soma + (n ?? 0), 0)
  const tiposComPendencia = TIPOS_PENDENCIA.filter((t) => (resumo.data?.[t] ?? 0) > 0).sort(
    (a, b) => (resumo.data?.[b] ?? 0) - (resumo.data?.[a] ?? 0)
  )
  const comSugestao = filtradas.filter((p) => temSugestaoDeData(p) && !ehEstimativa(p))
  const abertasNoFiltro = status === 'ABERTA' ? filtradas : []

  function confirmarIgnorarTodas(): void {
    const onde = tipo ? `do tipo “${ROTULO_TIPO_PENDENCIA[tipo]}”` : 'listadas'
    if (window.confirm(`Ignorar as ${abertasNoFiltro.length} pendências ${onde}? Elas saem da lista de abertas e não voltam numa nova importação.`)) {
      ignorarVarias.mutate(abertasNoFiltro.map((p) => p.id))
    }
  }
  function confirmarAplicarSugestoes(): void {
    if (window.confirm(`Aplicar a data sugerida em ${comSugestao.length} exame(s)? Cada correção fica registrada na Auditoria.`)) {
      aplicarVarias.mutate(comSugestao.map((p) => p.id))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-[var(--ink)]">Pendências da Importação</h1>
      <p className="text-sm text-[var(--ink-3)]">
        Tudo o que a importação do sistema antigo encontrou de errado ou mudou, com a explicação e o que fazer. Corrija
        direto aqui, aplique a correção sugerida (nas datas) ou ignore o que não importa. Importar de novo não reabre o
        que você já tratou.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-44">
          <Select value={status} onChange={(e) => { setStatus(e.target.value as StatusPendencia); setTipo('') }} aria-label="Situação">
            {(Object.keys(ROTULO_STATUS) as StatusPendencia[]).map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-64 flex-1">
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pelo nome, CPF ou código do registro…" aria-label="Buscar" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo de problema">
        <ChipTipo ativo={tipo === ''} onClick={() => setTipo('')} rotulo="Todos" quantidade={totalGeral} />
        {tiposComPendencia.map((t) => (
          <ChipTipo key={t} ativo={tipo === t} onClick={() => setTipo(t)} rotulo={ROTULO_TIPO_PENDENCIA[t]} quantidade={resumo.data?.[t] ?? 0} />
        ))}
      </div>

      {(comSugestao.length > 0 || abertasNoFiltro.length > 1) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--rule)] bg-[var(--surface-2)] px-3 py-2">
          <span className="text-sm text-[var(--ink-2)]">
            {filtradas.length} nesta lista{busca ? ' (com a busca)' : ''}. Ações para todas elas:
          </span>
          <div className="flex flex-wrap gap-2">
            {comSugestao.length > 0 && (
              <Button size="sm" loading={aplicarVarias.isPending} onClick={confirmarAplicarSugestoes}>
                Aplicar as {comSugestao.length} datas sugeridas
              </Button>
            )}
            {abertasNoFiltro.length > 1 && (
              <Button size="sm" variant="secondary" loading={ignorarVarias.isPending} onClick={confirmarIgnorarTodas}>
                Ignorar as {abertasNoFiltro.length}
              </Button>
            )}
          </div>
        </div>
      )}

      {pendencias.isLoading ? (
        <p className="text-sm text-[var(--ink-3)]">Carregando…</p>
      ) : filtradas.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-[var(--ink-3)]">Nenhuma pendência {ROTULO_STATUS[status].toLowerCase()} neste filtro.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtradas.slice(0, visiveis).map((p) => (
            <CartaoPendencia
              key={p.id}
              p={p}
              aplicando={aplicar.isPending && aplicar.variables === p.id}
              abrindoCadastro={abrirCadastro.isPending && abrirCadastro.variables?.id === p.id}
              onAplicar={() => aplicar.mutate(p.id)}
              onResolver={() => resolver.mutate(p.id)}
              onIgnorar={() => ignorar.mutate(p.id)}
              reabrindo={reabrir.isPending && reabrir.variables === p.id}
              onReabrir={() => reabrir.mutate(p.id)}
              onCorrigirCadastro={() => abrirCadastro.mutate(p)}
              onInformarData={() => setDataDialog(p)}
            />
          ))}
          {filtradas.length > visiveis && (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={() => setVisiveis((v) => v + POR_PAGINA)}>
                Mostrar mais ({filtradas.length - visiveis} restantes)
              </Button>
            </div>
          )}
        </div>
      )}

      {editando && (
        <ClienteFormDialog
          open
          clienteExistente={editando.cliente}
          onClose={() => setEditando(null)}
          // O administrador salvou o cadastro (o sistema so aceita CPF valido e nao repetido): o problema acabou.
          onSaved={() => resolver.mutate(editando.pendenciaId)}
        />
      )}

      {dataDialog && (
        <InformarDataDialog
          pendencia={dataDialog}
          onFechar={() => {
            setDataDialog(null)
            aoMudar()
          }}
        />
      )}
    </div>
  )
}

function ChipTipo(props: { ativo: boolean; onClick: () => void; rotulo: string; quantidade: number }): ReactNode {
  return (
    <button
      type="button"
      aria-pressed={props.ativo}
      onClick={props.onClick}
      className={
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium transition-colors ' +
        (props.ativo
          ? 'border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--accent)]'
          : 'border-[var(--rule-strong)] bg-[var(--surface)] text-[var(--ink-2)] hover:bg-[var(--surface-2)]')
      }
    >
      {props.rotulo}
      <span className="rounded-full bg-[var(--surface-2)] px-1.5 text-xs text-[var(--ink-3)]">{props.quantidade}</span>
    </button>
  )
}

function CartaoPendencia(props: {
  p: Pendencia
  aplicando: boolean
  abrindoCadastro: boolean
  onAplicar: () => void
  onResolver: () => void
  onIgnorar: () => void
  reabrindo: boolean
  onReabrir: () => void
  onCorrigirCadastro: () => void
  onInformarData: () => void
}): ReactNode {
  const { p } = props
  const aberta = p.status === 'ABERTA'
  const podeCorrigirCadastro = aberta && p.destinoTabela === 'cliente' && p.destinoId !== null && p.tipo.startsWith('CPF_') && p.tipo !== 'CPF_MESCLADO'
  const podeInformarData = aberta && p.tipo.startsWith('DATA_') && p.destinoId !== null
  const podeVerDetalhes = p.tipo.startsWith('DATA_') && p.destinoTabela === 'venda' && p.destinoId !== null
  const [detalhesAbertos, setDetalhesAbertos] = useState(false)

  return (
    <Card>
      <CardBody className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={TOM_GRAVIDADE[p.gravidade]}>{ROTULO_TIPO_PENDENCIA[p.tipo]}</Badge>
          <span className="text-xs text-[var(--ink-3)]">
            {p.origemTabela} · código {p.origemId} no sistema antigo
          </span>
        </div>
        <p className="text-sm text-[var(--ink)]">{p.motivo}</p>
        {p.sugestao && <p className="text-sm text-[var(--ink-2)]">O que fazer: {p.sugestao}</p>}
        {SEM_CORRECAO_AQUI.includes(p.tipo) && aberta && (
          <p className="text-xs text-[var(--ink-3)]">
            Este exame não foi importado, então não há o que corrigir aqui. Acerte no sistema antigo e importe de novo, ou ignore.
          </p>
        )}

        {p.dados?.campo && p.dados.sugerido && (
          <p className="text-sm text-[var(--ink-2)]">
            {ehEstimativa(p) ? 'Ponto de partida (palpite)' : 'Sugestão'}: {ROTULO_CAMPO_DATA[p.dados.campo]}{' '}
            {p.dados.atual && (
              <>
                <span className="line-through">{formatarDataOuAviso(p.dados.atual)}</span> →{' '}
              </>
            )}
            <span className="font-semibold text-[var(--ok)]">{formatarDataOuAviso(p.dados.sugerido)}</span>
          </p>
        )}

        {podeVerDetalhes && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="self-start text-xs font-medium text-[var(--accent)] hover:underline"
              onClick={() => setDetalhesAbertos((v) => !v)}
            >
              {detalhesAbertos ? 'Esconder detalhes do exame' : 'Ver detalhes do exame (cliente, item, datas)'}
            </button>
            {detalhesAbertos && <DetalhesDoExame pendenciaId={p.id} dados={p.dados} />}
          </div>
        )}

        {aberta && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--rule)] pt-2">
            {temSugestaoDeData(p) && (
              <Button size="sm" variant={ehEstimativa(p) ? 'secondary' : 'primary'} loading={props.aplicando} onClick={props.onAplicar}>
                {ehEstimativa(p) ? 'Usar esta data (palpite)' : 'Aplicar data sugerida'}
              </Button>
            )}
            {podeInformarData && (
              <Button size="sm" variant="secondary" onClick={props.onInformarData}>
                Corrigir as datas
              </Button>
            )}
            {podeCorrigirCadastro && (
              <Button size="sm" loading={props.abrindoCadastro} onClick={props.onCorrigirCadastro}>
                Corrigir cadastro
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={props.onResolver}>
              Já resolvi
            </Button>
            <Button size="sm" variant="ghost" onClick={props.onIgnorar}>
              Ignorar
            </Button>
          </div>
        )}

        {!aberta && (
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--rule)] pt-2">
            <span className="text-xs text-[var(--ink-3)]">
              {p.status === 'IGNORADA' ? 'Ignorada' : 'Resolvida'}
              {p.resolvidoEm ? ` em ${new Date(p.resolvidoEm.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR')}` : ''}
            </span>
            <Button size="sm" variant="secondary" loading={props.reabrindo} onClick={props.onReabrir}>
              Reabrir
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function dataIsoValida(v: string | null | undefined): v is string {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null
  if (!m) return false
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

/**
 * Corrige as datas do exame. Salvar NAO fecha a pendencia: o administrador pode
 * salvar uma data, ver o que ainda parece errado e corrigir as outras. So fecha em
 * "Salvar e concluir".
 */
function InformarDataDialog(props: { pendencia: Pendencia; onFechar: () => void }): ReactNode {
  const { pendencia } = props
  const queryClient = useQueryClient()
  const [valores, setValores] = useState<Partial<Record<CampoDataExame, string>>>({})
  const [iniciado, setIniciado] = useState(false)
  const [avisos, setAvisos] = useState<string[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const atuais = useQuery({
    queryKey: ['migracao', 'datas-atuais', pendencia.id],
    queryFn: () => unwrap(window.api.migracao.pendenciaDatasAtuais({ id: pendencia.id }))
  })

  // Abre com o que esta gravado (quando e uma data de verdade) e a sugestao ja no campo sugerido, para so conferir.
  useEffect(() => {
    if (!atuais.data || iniciado) return
    const inicial: Partial<Record<CampoDataExame, string>> = {}
    for (const c of CAMPOS_DATA_EXAME) {
      const a = atuais.data[c]
      if (dataIsoValida(a)) inicial[c] = a
    }
    const { campo, sugerido } = pendencia.dados ?? {}
    if (campo && sugerido) inicial[campo] = sugerido
    setValores(inicial)
    setIniciado(true)
  }, [atuais.data, iniciado, pendencia.dados])

  const alteracoes = CAMPOS_DATA_EXAME.flatMap((campo) => {
    const nova = valores[campo]
    return nova && nova !== atuais.data?.[campo] ? [{ campo, data: nova }] : []
  })

  const salvar = useMutation({
    mutationFn: (concluir: boolean) => unwrap(window.api.migracao.pendenciaCorrigirDatas({ id: pendencia.id, alteracoes, concluir })),
    onSuccess: (r) => {
      if (r.aplicadas > 0) toast.ok(`${r.aplicadas} data(s) salva(s).`)
      void queryClient.invalidateQueries({ queryKey: ['migracao', 'datas-atuais', pendencia.id] })
      void queryClient.invalidateQueries({ queryKey: ['migracao', 'detalhes', pendencia.id] })
      if (r.resolvida) {
        toast.ok('Pendência concluída.')
        props.onFechar()
      } else {
        setAvisos(r.avisos)
        setErro(null)
      }
    },
    onError: (err) => setErro(mensagem(err))
  })

  function mudar(campo: CampoDataExame, valor: string): void {
    setValores((v) => ({ ...v, [campo]: valor }))
    setErro(null)
  }

  return (
    <Dialog open onClose={props.onFechar} title="Corrigir as datas do exame" description={pendencia.motivo} className="max-w-2xl">
      <div className="flex flex-col gap-4">
        <DetalhesDoExame pendenciaId={pendencia.id} dados={pendencia.dados} />

        {pendencia.dados?.sugerido && pendencia.dados.campo && (
          <p className="text-sm text-[var(--ink-2)]">
            {ehEstimativa(pendencia) ? 'Já preenchi um ponto de partida (palpite)' : 'Já preenchi a data sugerida'} na{' '}
            {ROTULO_CAMPO_DATA[pendencia.dados.campo]}
            {pendencia.dados.base ? ` (base: ${pendencia.dados.base})` : ''}. Confira antes de salvar.
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CAMPOS_DATA_EXAME.map((campo) => (
            <Field key={campo} label={ROTULO_CAMPO_DATA[campo].replace(/^./, (c) => c.toUpperCase())} htmlFor={`pend-${campo}`}>
              <Input id={`pend-${campo}`} type="date" value={valores[campo] ?? ''} onChange={(e) => mudar(campo, e.target.value)} />
              <span className="mt-0.5 block text-xs text-[var(--ink-3)]">
                Hoje no sistema: {atuais.isLoading ? 'carregando…' : formatarDataOuAviso(atuais.data?.[campo])}
              </span>
            </Field>
          ))}
        </div>

        <p className="text-xs text-[var(--ink-3)]">
          Altere quantas datas precisar. A data da venda e o lançamento financeiro não mudam quando você corrige a data do exame.
          A pendência só fecha em “Salvar e concluir”.
        </p>

        {avisos !== null &&
          (avisos.length === 0 ? (
            <p className="rounded-md bg-[var(--ok-wash)] px-3 py-2 text-sm text-[var(--ok)]">As datas deste exame estão em ordem.</p>
          ) : (
            <div className="rounded-md bg-[var(--warn-wash)] px-3 py-2 text-sm text-[var(--warn)]">
              <p className="font-medium">Ainda parece errado:</p>
              <ul className="list-disc pl-5">
                {avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          ))}

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--rule)] pt-4">
          <Button variant="ghost" onClick={props.onFechar}>
            Fechar
          </Button>
          <Button
            variant="secondary"
            loading={salvar.isPending && salvar.variables === false}
            disabled={alteracoes.length === 0}
            onClick={() => salvar.mutate(false)}
          >
            Salvar e continuar corrigindo
          </Button>
          <Button loading={salvar.isPending && salvar.variables === true} onClick={() => salvar.mutate(true)}>
            Salvar e concluir
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
