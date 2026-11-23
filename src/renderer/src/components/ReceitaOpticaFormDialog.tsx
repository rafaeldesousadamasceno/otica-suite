import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { receitaOpticaInputSchema } from '@shared/ipc'
import { toast } from '@renderer/state/toastStore'
import { usePreferenciasStore } from '@renderer/state/preferenciasStore'
import { enterAvancaCampo } from '@renderer/lib/enterAvancaCampo'
import { cn } from '@renderer/lib/cn'
import { TratamentosCampo } from '@renderer/components/TratamentosCampo'
import { OlhoCard } from '@renderer/components/prescricao/OlhoCard'
import { EscolhaUnica } from '@renderer/components/prescricao/EscolhaUnica'
import { MedidasArmacao } from '@renderer/components/prescricao/MedidasArmacao'
import {
  campoDoOlho,
  estadoDaReceita,
  estadoVazio,
  normalizarOlho,
  paraEntrada,
  type EstadoOlho,
  type EstadoPrescricao
} from '@renderer/components/prescricao/estado'
import { formatarDioptria } from '@shared/dioptria'
import { calcularDp, normalizarPrescricao, validarPrescricao, ROTULO_PRESCRICAO, type Olho } from '@shared/prescricao'
import { juntarTratamentos } from '@shared/receitaCalculo'
import type { ReceitaOptica } from '@shared/types'

interface Props {
  open: boolean
  onClose: () => void
  clienteId: number
  /** Prescricao ja salva a corrigir. Sem ela, o formulario cria uma nova. */
  receita?: ReceitaOptica | null
}

const TRATAMENTOS_COM_COR = ['COLORAÇÃO', 'COLORAÇÃO DEGRADÊ']

/** 63.5 -> "63,5 mm"; sem valor, um traco. */
function mm(v: number | null): string {
  return v === null ? '—' : `${String(v).replace('.', ',')} mm`
}

/**
 * Valor ja gravado que nao esta (mais) na lista de opcoes - ex.: veio da
 * importacao ou a opcao foi desativada. Sem isto o campo apareceria vazio e
 * salvar apagaria o valor.
 */
function valorForaDaLista(atual: string, opcoes: { valor: string }[] | undefined): ReactNode {
  if (!atual || !opcoes || opcoes.some((o) => o.valor === atual)) return null
  return <option value={atual}>{atual}</option>
}

function useLista(tipo: 'tipo_lente' | 'tratamento_lente' | 'indice_refracao' | 'tipo_armacao', ativo: boolean) {
  return useQuery({
    queryKey: ['listaValor', tipo],
    queryFn: () => unwrap(window.api.listasValor.listByTipo({ tipo })),
    enabled: ativo
  })
}

export function ReceitaOpticaFormDialog({ open, onClose, clienteId, receita }: Props): ReactNode {
  const editando = Boolean(receita)
  const queryClient = useQueryClient()
  const exibirDp = usePreferenciasStore((s) => s.exibirDp)
  const formatoNumero = usePreferenciasStore((s) => s.formatoNumero)
  const [estado, setEstado] = useState<EstadoPrescricao>(estadoVazio)
  const [tentouSalvar, setTentouSalvar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const tiposLente = useLista('tipo_lente', open)
  const tratamentosDisponiveis = useLista('tratamento_lente', open)
  const indices = useLista('indice_refracao', open)
  const tiposArmacao = useLista('tipo_armacao', open)

  // Ao abrir: preenche com a prescricao a corrigir, ou comeca em branco (esf, cil, adicao e prisma em 0,00).
  useEffect(() => {
    if (!open) return
    setEstado(receita ? estadoDaReceita(receita) : estadoVazio())
    setTentouSalvar(false)
    setErro(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, receita?.id])

  function set<K extends keyof EstadoPrescricao>(chave: K, valor: EstadoPrescricao[K]): void {
    setEstado((e) => ({ ...e, [chave]: valor }))
  }
  const setOlho = (olho: Olho, novo: EstadoOlho): void => set(olho === 'Od' ? 'od' : 'oe', normalizarOlho(novo))

  // Mesmas regras do servidor, com a mesma funcao: o que aparece em vermelho aqui e o que ele recusaria.
  const problemas = useMemo(() => validarPrescricao(normalizarPrescricao(paraEntrada(estado))), [estado])
  const invalidos = useMemo(() => {
    const porOlho: Record<Olho, Set<string>> = { Od: new Set(), Oe: new Set() }
    if (tentouSalvar) {
      for (const p of problemas) {
        const c = campoDoOlho(p.campo)
        if (c) porOlho[c.olho].add(c.campo)
      }
    }
    return porOlho
  }, [problemas, tentouSalvar])

  const dpLonge = calcularDp(estado.od.dnp, estado.oe.dnp)
  const dpPerto = calcularDp(estado.od.dnpPerto, estado.oe.dnpPerto)
  const pedeCor = estado.tratamentos.some((t) => TRATAMENTOS_COM_COR.includes(t))

  const mutation = useMutation({
    mutationFn: async () => {
      const dados = {
        clienteId,
        profissionalNome: estado.profissionalNome || null,
        dataExame: estado.dataExame,
        ...Object.fromEntries(
          (['Od', 'Oe'] as const).flatMap((o) => {
            const v = o === 'Od' ? estado.od : estado.oe
            return [
              [`longe${o}Esf`, v.esf], [`longe${o}Cil`, v.cil], [`longe${o}Eixo`, v.eixo], [`longe${o}Dnp`, v.dnp],
              [`longe${o}Alt`, v.alt], [`longe${o}Prisma`, v.prisma], [`longe${o}BasePrisma`, v.basePrisma],
              [`adicao${o}`, v.adicao], [`perto${o}Dnp`, v.dnpPerto]
            ]
          })
        ),
        tipoLente: estado.tipoLente || null,
        indiceRefracao: estado.indiceRefracao || null,
        tratamentos: juntarTratamentos(estado.tratamentos),
        armacaoTipo: estado.armacaoTipo || null,
        armacaoModelo: estado.armacaoModelo || null,
        armacaoMarca: estado.armacaoMarca || null,
        armacaoCor: estado.armacaoCor || null,
        ponte: estado.medidas.ponte,
        horizontal: estado.medidas.horizontal,
        vertical: estado.medidas.vertical,
        diagonalMaior: estado.medidas.diagonalMaior,
        observacao: estado.observacao || null
      }
      const validacao = receitaOpticaInputSchema.safeParse(dados)
      if (!validacao.success) throw new Error(validacao.error.issues[0]?.message ?? 'Dados inválidos.')
      return receita
        ? unwrap(window.api.receitas.update({ ...validacao.data, id: receita.id }))
        : unwrap(window.api.receitas.create(validacao.data))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receitas', clienteId] })
      queryClient.invalidateQueries({ queryKey: ['ordensServico'] })
      toast.ok(editando ? `${ROTULO_PRESCRICAO} corrigida.` : `${ROTULO_PRESCRICAO} registrada.`)
      onClose()
    },
    onError: (err) => {
      setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
    }
  })

  function salvar(): void {
    setErro(null)
    setTentouSalvar(true)
    if (problemas.length > 0) return
    mutation.mutate()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editando ? `Editar ${ROTULO_PRESCRICAO.toLowerCase()}` : `Nova ${ROTULO_PRESCRICAO.toLowerCase()}`}
      className="max-w-6xl"
    >
      <form
        className="flex flex-col gap-5"
        // Enter so passa para o proximo campo: a prescricao so salva pelo botao.
        onKeyDown={enterAvancaCampo}
        onSubmit={(e) => {
          e.preventDefault()
          salvar()
        }}
        noValidate
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Data do exame" required>
            <Input type="date" value={estado.dataExame} onChange={(e) => set('dataExame', e.target.value)} required autoFocus />
          </Field>
          <Field label="Profissional (optometrista)">
            <Input value={estado.profissionalNome} onChange={(e) => set('profissionalNome', e.target.value)} />
          </Field>
        </div>

        {receita?.formatoAnterior && (
          <div role="status" className="flex gap-3 rounded-md border border-[var(--warn)]/40 bg-[var(--warn-wash)] p-3 text-sm text-[var(--warn)]">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <div className="flex flex-col gap-0.5">
              <p className="font-semibold">{ROTULO_PRESCRICAO} registrada no formato anterior</p>
              <p className="text-xs">
                O Perto desta {ROTULO_PRESCRICAO.toLowerCase()} foi gravado à parte e não é Longe + Adição. Ele aparece em amarelo abaixo, só para consulta.
                Ao salvar, o Perto passa a ser calculado pela Adição de cada olho; os valores antigos continuam guardados.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <OlhoCard
            olho="Od"
            valor={estado.od}
            onChange={(v) => setOlho('Od', v)}
            invalidos={invalidos.Od}
            pertoOriginal={receita?.formatoAnterior ? { esf: receita.pertoOdEsf, cil: receita.pertoOdCil, eixo: receita.pertoOdEixo } : null}
          />
          <OlhoCard
            olho="Oe"
            valor={estado.oe}
            onChange={(v) => setOlho('Oe', v)}
            invalidos={invalidos.Oe}
            pertoOriginal={receita?.formatoAnterior ? { esf: receita.pertoOeEsf, cil: receita.pertoOeCil, eixo: receita.pertoOeEixo } : null}
          />
        </div>

        {exibirDp && (
          <p className="-mt-2 text-center text-sm text-[var(--ink-2)]">
            DP Longe: <b className="font-mono-tab text-[var(--ink)]">{mm(dpLonge)}</b> · DP Perto: <b className="font-mono-tab text-[var(--ink)]">{mm(dpPerto)}</b>
          </p>
        )}

        <fieldset className="flex flex-col gap-4 rounded-lg border border-[var(--rule)] p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">Lente</legend>
          <EscolhaUnica
            legenda="Tipo de lente"
            opcoes={tiposLente.data?.map((t) => t.valor) ?? []}
            valor={estado.tipoLente}
            onChange={(v) => set('tipoLente', v)}
            carregando={tiposLente.isPending}
          />
          <EscolhaUnica
            legenda="Índice de refração"
            opcoes={indices.data?.map((t) => t.valor) ?? []}
            valor={estado.indiceRefracao}
            onChange={(v) => set('indiceRefracao', v)}
            carregando={indices.isPending}
          />
          <TratamentosCampo
            opcoes={tratamentosDisponiveis.data?.map((t) => t.valor) ?? []}
            selecionados={estado.tratamentos}
            onChange={(v) => set('tratamentos', v)}
            carregando={tratamentosDisponiveis.isPending}
          />
          {pedeCor && (
            <p role="status" className="rounded-md bg-[var(--warn-wash)] px-3 py-2 text-sm text-[var(--warn)]">
              Informe a cor em Observações.
            </p>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-lg border border-[var(--rule)] p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">Armação</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Tipo">
              <Select value={estado.armacaoTipo} onChange={(e) => set('armacaoTipo', e.target.value)}>
                <option value="">-Selecione uma armação-</option>
                {valorForaDaLista(estado.armacaoTipo, tiposArmacao.data)}
                {tiposArmacao.data?.map((t) => (
                  <option key={t.id} value={t.valor}>
                    {t.valor}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Modelo">
              <Input value={estado.armacaoModelo} onChange={(e) => set('armacaoModelo', e.target.value)} />
            </Field>
            <Field label="Marca">
              <Input value={estado.armacaoMarca} onChange={(e) => set('armacaoMarca', e.target.value)} />
            </Field>
            <Field label="Cor">
              <Input value={estado.armacaoCor} onChange={(e) => set('armacaoCor', e.target.value)} />
            </Field>
          </div>
          <MedidasArmacao medidas={estado.medidas} onChange={(m) => set('medidas', m)} />
        </fieldset>

        <Field label="Observações" hint={pedeCor ? 'Escreva aqui a cor da coloração.' : undefined}>
          <textarea
            className={cn(
              'min-h-16 w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-[var(--accent)]',
              pedeCor ? 'border-[var(--warn)]! ring-2 ring-[var(--warn)]/30' : 'border-[var(--rule-strong)]'
            )}
            value={estado.observacao}
            onChange={(e) => set('observacao', e.target.value)}
          />
        </Field>

        {tentouSalvar && problemas.length > 0 && (
          <div role="alert" className="rounded-md border border-[var(--danger)]/40 bg-[var(--danger-wash)] p-3 text-sm text-[var(--danger)]">
            <p className="mb-1 font-semibold">Corrija antes de salvar:</p>
            <ul className="list-disc pl-5">
              {problemas.map((p, i) => (
                <li key={i}>{p.mensagem}</li>
              ))}
            </ul>
          </div>
        )}
        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex items-center justify-between gap-2 border-t border-[var(--rule)] pt-4">
          <p className="text-xs text-[var(--ink-3)]">
            <span className="text-[var(--danger)]">*</span> obrigatório · formato dos graus: {formatarDioptria(1.25, { formato: formatoNumero })}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {editando ? 'Salvar alterações' : `Salvar ${ROTULO_PRESCRICAO.toLowerCase()}`}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  )
}
