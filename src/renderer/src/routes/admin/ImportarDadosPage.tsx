import { type ReactNode, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardBody, CardHeader, CardTitle } from '@renderer/components/ui/Card'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { Badge } from '@renderer/components/ui/Badge'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { toast } from '@renderer/state/toastStore'
import {
  ROTULO_TIPO_PENDENCIA,
  type MigracaoAnalise,
  type MigracaoAprovacoes,
  type MigracaoResultado,
  type PendenciaPrevista,
  type TipoPendencia
} from '@shared/importacao'

interface FormState {
  host: string
  porta: string
  usuario: string
  senha: string
  banco: string
}

// A senha nunca vem preenchida: ela e de quem administra o sistema antigo.
const VALORES_PADRAO: FormState = {
  host: 'localhost',
  porta: '3306',
  usuario: 'dba',
  senha: '',
  banco: 'mdoculos'
}

const TOM_DO_TIPO: Partial<Record<TipoPendencia, 'danger' | 'warn' | 'neutral'>> = {
  CPF_DUPLICADO: 'danger',
  EXAME_SEM_CLIENTE: 'danger',
  CLIENTE_INEXISTENTE_NA_ORIGEM: 'danger',
  CLIENTE_FALHOU: 'danger',
  ERRO_IMPORTACAO: 'danger',
  CPF_MESCLADO: 'neutral',
  REGISTRO_VAZIO: 'neutral'
}

function mensagem(err: unknown): string {
  return err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.'
}

export function ImportarDadosPage(): ReactNode {
  const [form, setForm] = useState<FormState>(VALORES_PADRAO)
  const [analise, setAnalise] = useState<MigracaoAnalise | null>(null)
  const [resultado, setResultado] = useState<MigracaoResultado | null>(null)
  const [aprovacoes, setAprovacoes] = useState<MigracaoAprovacoes>({ mesclarDuplicados: true, removerCpfConflitante: true, removerRegistrosVazios: true })

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function conexao(): { host: string; porta: number; usuario: string; senha: string; banco: string } {
    return {
      host: form.host,
      porta: Number(form.porta),
      usuario: form.usuario,
      senha: form.senha,
      banco: form.banco
    }
  }

  const testar = useMutation({
    mutationFn: () => unwrap(window.api.migracao.testarConexao(conexao())),
    onSuccess: () => toast.ok('Conexão bem-sucedida.'),
    onError: (err) => toast.error(mensagem(err))
  })

  const analisar = useMutation({
    mutationFn: () => unwrap(window.api.migracao.analisar(conexao())),
    onSuccess: (dados) => {
      setResultado(null)
      setAnalise(dados)
    },
    onError: (err) => toast.error(mensagem(err))
  })

  const importar = useMutation({
    mutationFn: () => unwrap(window.api.migracao.importar({ conexao: conexao(), aprovacoes })),
    onSuccess: (dados) => {
      setAnalise(null)
      setResultado(dados)
      toast.ok('Importação concluída.')
    },
    onError: (err) => toast.error(mensagem(err))
  })

  function onImportarClick(): void {
    const confirmado = window.confirm(
      'Vou tirar um backup do sistema e importar os dados do sistema antigo. O que for duvidoso fica na tela de Pendências para você conferir. Continuar?'
    )
    if (confirmado) importar.mutate()
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-[var(--ink)]">Importar Dados do MD Óculos</h1>

      <p className="text-sm text-[var(--ink-3)]">
        Conecta ao banco MySQL do sistema antigo pela rede e grava cópias convertidas neste sistema. O banco antigo
        nunca é alterado (acesso somente leitura) e a importação pode ser repetida sem duplicar registros. O caminho
        seguro tem dois passos: primeiro <strong>Analisar</strong> (nada é gravado e você vê os problemas), depois{' '}
        <strong>Importar</strong>.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>1. Conexão com o banco antigo</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Host" htmlFor="migracao-host">
              <Input id="migracao-host" value={form.host} onChange={(e) => set('host', e.target.value)} />
            </Field>
            <Field label="Porta" htmlFor="migracao-porta">
              <Input id="migracao-porta" className="font-mono-tab" value={form.porta} onChange={(e) => set('porta', e.target.value)} />
            </Field>
            <Field label="Usuário" htmlFor="migracao-usuario">
              <Input id="migracao-usuario" value={form.usuario} onChange={(e) => set('usuario', e.target.value)} />
            </Field>
            <Field label="Senha" htmlFor="migracao-senha">
              <Input id="migracao-senha" type="password" value={form.senha} onChange={(e) => set('senha', e.target.value)} />
            </Field>
            <Field label="Banco" htmlFor="migracao-banco">
              <Input id="migracao-banco" value={form.banco} onChange={(e) => set('banco', e.target.value)} />
            </Field>
          </div>

          <div className="flex justify-end gap-2 border-t border-[var(--rule)] pt-4">
            <Button variant="secondary" loading={testar.isPending} onClick={() => testar.mutate()}>
              Testar conexão
            </Button>
            <Button loading={analisar.isPending} onClick={() => analisar.mutate()}>
              Analisar
            </Button>
          </div>
        </CardBody>
      </Card>

      {analise && (
        <AnaliseCard
          analise={analise}
          aprovacoes={aprovacoes}
          onAprovacoes={setAprovacoes}
          importando={importar.isPending}
          onImportar={onImportarClick}
        />
      )}

      {resultado && <ResultadoCard resultado={resultado} />}

      <OsAntigasCard />
    </div>
  )
}

// ---------------------------------------------------------------------
// Passo 2: analise (nada foi gravado)
// ---------------------------------------------------------------------

function AnaliseCard(props: {
  analise: MigracaoAnalise
  aprovacoes: MigracaoAprovacoes
  onAprovacoes: (a: MigracaoAprovacoes) => void
  importando: boolean
  onImportar: () => void
}): ReactNode {
  const { analise, aprovacoes, onAprovacoes } = props
  const tipos = Object.keys(analise.porTipo) as TipoPendencia[]
  const temCpfRepetido = (analise.porTipo.CPF_MESCLADO ?? 0) + (analise.porTipo.CPF_REMOVIDO ?? 0) + (analise.porTipo.CPF_DUPLICADO ?? 0) > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>2. O que a análise encontrou</CardTitle>
        <Badge tone="ok">Nada foi gravado ainda</Badge>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <ResumoItem label="Clientes no sistema antigo" valor={analise.clientesLidos} />
          <ResumoItem label="Clientes a importar" valor={analise.clientesAImportar} />
          <ResumoItem label="Clientes já importados" valor={analise.clientesJaImportados} />
          <ResumoItem label="Exames no sistema antigo" valor={analise.examesLidos} />
          <ResumoItem label="Exames a importar" valor={analise.examesAImportar} />
          <ResumoItem label="Exames já importados" valor={analise.examesJaImportados} />
        </div>

        {tipos.length === 0 ? (
          <p className="rounded-md bg-[var(--ok-wash)] px-3 py-2 text-sm text-[var(--ok)]">
            Nenhum problema encontrado. Pode importar.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-[var(--ink)]">
              {analise.pendencias.length} ponto(s) para conferir. Eles ficam salvos na tela de Pendências, com a explicação e
              a sugestão de cada um.
            </p>
            {tipos.map((tipo) => (
              <GrupoPendencias key={tipo} tipo={tipo} itens={analise.pendencias.filter((p) => p.tipo === tipo)} />
            ))}
          </div>
        )}

        {temCpfRepetido && (
          <div className="flex flex-col gap-2 rounded-md border border-[var(--rule)] bg-[var(--surface-2)] p-3">
            <p className="text-sm font-medium text-[var(--ink)]">Como tratar CPF repetido</p>
            <label className="flex items-start gap-2 text-sm text-[var(--ink-2)]">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={aprovacoes.mesclarDuplicados}
                onChange={(e) => onAprovacoes({ ...aprovacoes, mesclarDuplicados: e.target.checked })}
              />
              <span>
                <strong>Unir cadastros da mesma pessoa</strong> (mesmo CPF, nome e nascimento). Os exames dos dois ficam num
                só cliente.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-[var(--ink-2)]">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={aprovacoes.removerCpfConflitante}
                onChange={(e) => onAprovacoes({ ...aprovacoes, removerCpfConflitante: e.target.checked })}
              />
              <span>
                <strong>Importar sem o CPF quem repete</strong> o de outra pessoa. O CPF original fica na observação do
                cadastro. Se desmarcar, esse cliente (e os exames dele) não é importado e fica como pendência.
              </span>
            </label>
          </div>
        )}

        {analise.registrosVazios > 0 && (
          <div className="flex flex-col gap-2 rounded-md border border-[var(--rule)] bg-[var(--surface-2)] p-3">
            <p className="text-sm font-medium text-[var(--ink)]">Registros em branco</p>
            <label className="flex items-start gap-2 text-sm text-[var(--ink-2)]">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={aprovacoes.removerRegistrosVazios}
                onChange={(e) => onAprovacoes({ ...aprovacoes, removerRegistrosVazios: e.target.checked })}
              />
              <span>
                <strong>Não importar (e remover, se já entrou) os {analise.registrosVazios} cliente(s) em branco</strong>: só
                o nome, sem CPF, telefone, endereço nem nascimento, e com exames sem nenhum dado (graus zerados, sem item,
                valor zero). Só remove do sistema o que ninguém usou depois da importação; o que foi alterado fica.
              </span>
            </label>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-[var(--rule)] pt-4">
          <p className="text-xs text-[var(--ink-3)]">Um backup do sistema é feito automaticamente antes de gravar. Sem backup, a importação não começa.</p>
          <Button loading={props.importando} onClick={props.onImportar}>
            Importar agora
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}

function GrupoPendencias({ tipo, itens }: { tipo: TipoPendencia; itens: PendenciaPrevista[] }): ReactNode {
  const [aberto, setAberto] = useState(false)
  const mostrados = aberto ? itens : itens.slice(0, 3)
  return (
    <div className="rounded-md border border-[var(--rule)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--rule)] bg-[var(--surface-2)] px-3 py-2">
        <Badge tone={TOM_DO_TIPO[tipo] ?? 'warn'}>{ROTULO_TIPO_PENDENCIA[tipo]}</Badge>
        <span className="text-xs text-[var(--ink-3)]">{itens.length}</span>
      </div>
      <ul className="divide-y divide-[var(--rule)]">
        {mostrados.map((p, i) => (
          <li key={`${p.origemTabela}-${p.origemId}-${i}`} className="flex flex-col gap-1 px-3 py-2 text-sm">
            <span className="text-[var(--ink)]">{p.motivo}</span>
            {p.sugestao && <span className="text-xs text-[var(--ink-3)]">O que fazer: {p.sugestao}</span>}
          </li>
        ))}
      </ul>
      {itens.length > 3 && (
        <button
          type="button"
          className="w-full border-t border-[var(--rule)] px-3 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--surface-2)]"
          onClick={() => setAberto((v) => !v)}
        >
          {aberto ? 'Mostrar menos' : `Mostrar todos os ${itens.length}`}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Passo 3: resultado
// ---------------------------------------------------------------------

function ResultadoCard({ resultado }: { resultado: MigracaoResultado }): ReactNode {
  const abertas = Object.entries(resultado.pendenciasAbertas) as [TipoPendencia, number][]
  const totalAbertas = abertas.reduce((soma, [, n]) => soma + n, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>3. Resultado da importação</CardTitle>
        {totalAbertas > 0 ? <Badge tone="warn">⚠ {totalAbertas} pendência(s) abertas</Badge> : <Badge tone="ok">Sem pendências</Badge>}
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <p className="text-xs text-[var(--ink-3)]">
          Cada exame antigo vira uma receita óptica, uma venda e uma ordem de serviço no novo sistema. Backup feito antes:{' '}
          <span className="font-mono-tab">{resultado.backupArquivo}</span>
        </p>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <ResumoItem label="Clientes importados" valor={resultado.clientesImportados} />
          <ResumoItem label="Clientes unidos a outro cadastro" valor={resultado.clientesMesclados} />
          <ResumoItem label="Clientes que já estavam importados" valor={resultado.clientesJaImportados} />
          <ResumoItem label="Clientes com falha" valor={resultado.clientesComFalha} destaque={resultado.clientesComFalha > 0} />
          <ResumoItem label="Clientes sem nome e sem receita (não importados)" valor={resultado.clientesSemNomeIgnorados} />
          <ResumoItem label="Clientes sem nome e sem receita removidos" valor={resultado.clientesSemNomeRemovidos} />
          <ResumoItem label="Registros em branco não importados" valor={resultado.registrosVaziosIgnorados} />
          <ResumoItem label="Registros em branco removidos" valor={resultado.registrosVaziosRemovidos} />
          <ResumoItem label="Receitas ópticas e vendas importadas" valor={resultado.examesImportados} />
          <ResumoItem label="Exames que já estavam importados" valor={resultado.examesJaImportados} />
          <ResumoItem label="Exames com falha" valor={resultado.examesComFalha} destaque={resultado.examesComFalha > 0} />
          <ResumoItem label="Despesas importadas" valor={resultado.despesasImportadas} />
          <ResumoItem label="Despesas que já estavam importadas" valor={resultado.despesasJaImportadas} />
          <ResumoItem label="Despesas com falha" valor={resultado.despesasComFalha} destaque={resultado.despesasComFalha > 0} />
          <ResumoItem label="Registros com acentos corrigidos" valor={resultado.textosCorrigidos} />
        </div>

        {totalAbertas > 0 && (
          <div className="flex flex-col gap-2 rounded-md border border-[var(--rule)] bg-[var(--surface-2)] p-3">
            <p className="text-sm font-medium text-[var(--ink)]">Pendências abertas</p>
            <div className="flex flex-wrap gap-2">
              {abertas.map(([tipo, n]) => (
                <Badge key={tipo} tone={TOM_DO_TIPO[tipo] ?? 'warn'}>
                  {ROTULO_TIPO_PENDENCIA[tipo]}: {n}
                </Badge>
              ))}
            </div>
            <div>
              <Link
                to="/pendencias-importacao"
                className="inline-flex h-9 items-center rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-ink)] hover:brightness-110"
              >
                Ver e resolver pendências
              </Link>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function ResumoItem({ label, valor, destaque }: { label: string; valor: number; destaque?: boolean }): ReactNode {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-[var(--ink-3)]">{label}</span>
      <span className={destaque ? 'text-lg font-semibold text-[var(--danger)]' : 'text-lg font-semibold text-[var(--ink)]'}>{valor}</span>
    </div>
  )
}

// ---------------------------------------------------------------------
// Entregas antigas em aberto
// ---------------------------------------------------------------------

function OsAntigasCard(): ReactNode {
  const queryClient = useQueryClient()
  const resumo = useQuery({
    queryKey: ['migracao', 'os-antigas'],
    queryFn: () => unwrap(window.api.migracao.osAntigasAbertas())
  })
  const [data, setData] = useState('')
  const dataEscolhida = data || resumo.data?.sugestaoData || ''

  const encerrar = useMutation({
    mutationFn: () => unwrap(window.api.migracao.encerrarOsAntigas({ data: dataEscolhida })),
    onSuccess: (r) => {
      toast.ok(`${r.encerradas} ordem(ns) de serviço marcada(s) como entregue(s). Backup: ${r.backupArquivo}`)
      for (const chave of ['migracao', 'ordensServico', 'ordemServico', 'dashboard', 'relacionamento', 'vendas']) {
        void queryClient.invalidateQueries({ queryKey: [chave] })
      }
    },
    onError: (err) => toast.error(mensagem(err))
  })

  const total = resumo.data?.total ?? 0

  function confirmar(): void {
    const br = `${dataEscolhida.slice(8, 10)}/${dataEscolhida.slice(5, 7)}/${dataEscolhida.slice(0, 4)}`
    if (
      window.confirm(
        `Marcar as ${total} ordens de serviço antigas em aberto como ENTREGUES em ${br}? Elas deixam as telas de pesquisa, o painel e o Relacionamento. Um backup é feito antes e tudo fica na Auditoria.`
      )
    ) {
      encerrar.mutate()
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entregas antigas em aberto</CardTitle>
        {total > 0 ? <Badge tone="warn">{total} em aberto</Badge> : <Badge tone="ok">Nenhuma</Badge>}
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        {resumo.isLoading ? (
          <p className="text-sm text-[var(--ink-3)]">Carregando…</p>
        ) : total === 0 ? (
          <p className="text-sm text-[var(--ink-3)]">Não há ordens de serviço do sistema antigo sem entrega.</p>
        ) : (
          <>
            <p className="text-sm text-[var(--ink-2)]">
              Ordens de serviço que vieram do sistema antigo e nunca foram entregues ficam para sempre nas telas de pesquisa, no
              painel (“OS atrasadas”, “prontas para retirada”) e no Relacionamento. Escolha uma data e todas serão marcadas
              como entregues de uma vez.
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(resumo.data?.porSituacao ?? {}).map(([situacao, n]) => (
                <Badge key={situacao}>
                  {situacao}: {n}
                </Badge>
              ))}
              {resumo.data?.maisAntiga && <Badge>a mais antiga é de {resumo.data.maisAntiga.split('-').reverse().join('/')}</Badge>}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-48">
                <Field label="Data de entrega" htmlFor="os-antigas-data">
                  <Input id="os-antigas-data" type="date" value={dataEscolhida} onChange={(e) => setData(e.target.value)} />
                </Field>
              </div>
              <Button loading={encerrar.isPending} disabled={!dataEscolhida} onClick={confirmar}>
                Marcar as {total} como entregues
              </Button>
            </div>
            <p className="text-xs text-[var(--ink-3)]">
              A data sugerida é o último dia de movimento que aparece nos dados antigos. Se uma OS já tem chegada ou envio
              depois da data escolhida, ela fica com a data dela (a entrega nunca antes do que a OS já registra). OS novas, feitas
              neste sistema, não são mexidas.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  )
}
