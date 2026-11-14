import { type ReactNode, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { receitaOpticaInputSchema } from '@shared/ipc'
import { toast } from '@renderer/state/toastStore'
import { enterAvancaCampo } from '@renderer/lib/enterAvancaCampo'
import { cn } from '@renderer/lib/cn'
import { TratamentosCampo } from '@renderer/components/TratamentosCampo'
import {
  calcularPertoEsf,
  formatarGrau,
  juntarTratamentos,
  paraNumeroGrau,
  separarTratamentos
} from '@shared/receitaCalculo'
import type { ReceitaOptica } from '@shared/types'

interface GrauForm {
  esf: string
  cil: string
  eixo: string
  dnp: string
  dp: string
}

const GRAU_VAZIO: GrauForm = { esf: '', cil: '', eixo: '', dnp: '', dp: '' }

type Olho = 'OD' | 'OE'

/** Colunas de cada linha OD/OE, na ordem da receita: o DP vem logo depois do DNP. */
const COLUNAS_GRAU: { campo: keyof GrauForm; titulo: string; placeholder: string }[] = [
  { campo: 'esf', titulo: 'Esférico', placeholder: '0,00' },
  { campo: 'cil', titulo: 'Cilíndrico', placeholder: '0,00' },
  { campo: 'eixo', titulo: 'Eixo', placeholder: '0°' },
  { campo: 'dnp', titulo: 'DNP', placeholder: 'mm' },
  { campo: 'dp', titulo: 'DP', placeholder: 'mm' }
]

const ROTULO_MEDIDA: Record<string, string> = {
  Esf: 'esférico',
  Cil: 'cilíndrico',
  Eixo: 'eixo',
  Dnp: 'DNP',
  Dp: 'DP'
}

/** "longeOdDnp" -> "Longe OD (DNP)", para a mensagem de erro dizer qual campo corrigir. */
function rotuloCampo(campo: string): string | null {
  const m = /^(longe|perto)(Od|Oe)(Esf|Cil|Eixo|Dnp|Dp)$/.exec(campo)
  if (m) return `${m[1] === 'longe' ? 'Longe' : 'Perto'} ${m[2].toUpperCase()} (${ROTULO_MEDIDA[m[3]]})`
  if (campo === 'adicao') return 'Adição'
  if (campo === 'dataExame') return 'Data do exame'
  return null
}

/** Uma linha OD/OE de um bloco (Longe ou Perto) - o padrao real da receita optica. */
function LinhaGrau({
  titulo,
  od,
  oe,
  setOd,
  setOe,
  esfCalculado
}: {
  titulo: string
  od: GrauForm
  oe: GrauForm
  setOd: (g: GrauForm) => void
  setOe: (g: GrauForm) => void
  /** Olhos cujo esferico esta preenchido pelo calculo (Longe + Adicao), e nao digitado. */
  esfCalculado?: { OD: boolean; OE: boolean }
}): ReactNode {
  return (
    <div className="overflow-hidden rounded-md border border-[var(--rule-strong)]">
      <div className="bg-[var(--accent)]/8 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
        {titulo}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--rule)] text-xs text-[var(--ink-3)]">
            <th className="w-12 px-2 py-1.5 text-left"></th>
            {COLUNAS_GRAU.map((c) => (
              <th key={c.campo} className="px-2 py-1.5">
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(
            [
              ['OD', od, setOd],
              ['OE', oe, setOe]
            ] as const
          ).map(([label, valor, setValor]) => (
            <tr key={label} className="border-b border-[var(--rule)] last:border-0">
              <td className="px-2 py-1 font-medium text-[var(--ink-2)]">{label}</td>
              {COLUNAS_GRAU.map((c) => {
                const calculado = c.campo === 'esf' && esfCalculado?.[label] === true && valor.esf !== ''
                return (
                  <td key={c.campo} className="px-1 py-1">
                    <Input
                      className={cn('font-mono-tab px-1.5 text-center', calculado && 'bg-[var(--accent)]/8')}
                      inputMode="decimal"
                      aria-label={`${titulo} ${label} ${c.titulo}`}
                      title={calculado ? 'Calculado: Longe + Adição. Digite outro valor para trocar.' : undefined}
                      value={valor[c.campo]}
                      onChange={(e) => setValor({ ...valor, [c.campo]: e.target.value })}
                      placeholder={c.placeholder}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface Props {
  open: boolean
  onClose: () => void
  clienteId: number
  /** Receita ja salva a corrigir. Sem ela, o formulario cria uma receita nova. */
  receita?: ReceitaOptica | null
}

/** 31.5 -> "31,5"; vazio quando nao ha valor. */
function paraCampo(v: number | null): string {
  return v === null ? '' : String(v).replace('.', ',')
}

function grauDe(esf: number | null, cil: number | null, eixo: number | null, dnp: number | null, dp: number | null): GrauForm {
  return { esf: paraCampo(esf), cil: paraCampo(cil), eixo: paraCampo(eixo), dnp: paraCampo(dnp), dp: paraCampo(dp) }
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

export function ReceitaOpticaFormDialog({ open, onClose, clienteId, receita }: Props): ReactNode {
  const editando = Boolean(receita)
  const queryClient = useQueryClient()
  const [dataExame, setDataExame] = useState('')
  const [profissionalNome, setProfissionalNome] = useState('')
  const [longeOd, setLongeOd] = useState<GrauForm>(GRAU_VAZIO)
  const [longeOe, setLongeOe] = useState<GrauForm>(GRAU_VAZIO)
  const [pertoOd, setPertoOd] = useState<GrauForm>(GRAU_VAZIO)
  const [pertoOe, setPertoOe] = useState<GrauForm>(GRAU_VAZIO)
  const [adicao, setAdicao] = useState('')
  const [tipoLente, setTipoLente] = useState('')
  const [tratamentos, setTratamentos] = useState<string[]>([])
  // Perto: o esferico sai de Longe + Adicao enquanto o profissional nao digitar o dele.
  // `true` = ele digitou (nao mexer); `false` = vale o calculo.
  const [pertoEsfManual, setPertoEsfManual] = useState<Record<Olho, boolean>>({ OD: false, OE: false })
  const [armacao, setArmacao] = useState('')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const tiposLente = useQuery({
    queryKey: ['listaValor', 'tipo_lente'],
    queryFn: () => unwrap(window.api.listasValor.listByTipo({ tipo: 'tipo_lente' })),
    enabled: open
  })
  const tratamentosDisponiveis = useQuery({
    queryKey: ['listaValor', 'tratamento_lente'],
    queryFn: () => unwrap(window.api.listasValor.listByTipo({ tipo: 'tratamento_lente' })),
    enabled: open
  })

  function limpar(): void {
    setDataExame('')
    setProfissionalNome('')
    setLongeOd(GRAU_VAZIO)
    setLongeOe(GRAU_VAZIO)
    setPertoOd(GRAU_VAZIO)
    setPertoOe(GRAU_VAZIO)
    setAdicao('')
    setTipoLente('')
    setTratamentos([])
    setPertoEsfManual({ OD: false, OE: false })
    setArmacao('')
    setObservacao('')
    setErro(null)
  }

  /** Esferico de Perto de um olho a partir do que esta na tela (Longe + Adicao); '' se faltar algum dos dois. */
  function pertoCalculado(longeEsf: string, adicaoTexto: string): string {
    return formatarGrau(calcularPertoEsf(paraNumeroGrau(longeEsf), paraNumeroGrau(adicaoTexto)))
  }

  /** Refaz o esferico de Perto dos olhos que ainda nao foram digitados a mao. */
  function recalcularPerto(adicaoTexto: string, longeOdEsf: string, longeOeEsf: string): void {
    if (!pertoEsfManual.OD) setPertoOd((g) => ({ ...g, esf: pertoCalculado(longeOdEsf, adicaoTexto) }))
    if (!pertoEsfManual.OE) setPertoOe((g) => ({ ...g, esf: pertoCalculado(longeOeEsf, adicaoTexto) }))
  }

  function alterarAdicao(texto: string): void {
    setAdicao(texto)
    recalcularPerto(texto, longeOd.esf, longeOe.esf)
  }

  function alterarLonge(olho: Olho, novo: GrauForm): void {
    const atual = olho === 'OD' ? longeOd : longeOe
    ;(olho === 'OD' ? setLongeOd : setLongeOe)(novo)
    if (novo.esf !== atual.esf) {
      recalcularPerto(adicao, olho === 'OD' ? novo.esf : longeOd.esf, olho === 'OE' ? novo.esf : longeOe.esf)
    }
  }

  /**
   * Digitar no esferico de Perto assume o valor: o calculo para de mexer nele. Apagar o
   * campo devolve o controle ao calculo (que volta a preencher quando a Adicao ou o Longe
   * mudarem; ao salvar, o sistema tambem completa um Perto em branco).
   */
  function alterarPerto(olho: Olho, novo: GrauForm): void {
    const atual = olho === 'OD' ? pertoOd : pertoOe
    ;(olho === 'OD' ? setPertoOd : setPertoOe)(novo)
    if (novo.esf !== atual.esf) setPertoEsfManual((m) => ({ ...m, [olho]: novo.esf.trim() !== '' }))
  }

  // Ao abrir: preenche com a receita a corrigir, ou comeca em branco para uma nova.
  useEffect(() => {
    if (!open) return
    if (!receita) {
      limpar()
      return
    }
    setDataExame(receita.dataExame)
    setProfissionalNome(receita.profissionalNome ?? '')
    setLongeOd(grauDe(receita.longeOdEsf, receita.longeOdCil, receita.longeOdEixo, receita.longeOdDnp, receita.longeOdDp))
    setLongeOe(grauDe(receita.longeOeEsf, receita.longeOeCil, receita.longeOeEixo, receita.longeOeDnp, receita.longeOeDp))
    setPertoOd(grauDe(receita.pertoOdEsf, receita.pertoOdCil, receita.pertoOdEixo, receita.pertoOdDnp, receita.pertoOdDp))
    setPertoOe(grauDe(receita.pertoOeEsf, receita.pertoOeCil, receita.pertoOeEixo, receita.pertoOeDnp, receita.pertoOeDp))
    setAdicao(paraCampo(receita.adicao))
    setTipoLente(receita.tipoLente ?? '')
    setTratamentos(separarTratamentos(receita.tratamentos))
    // Um Perto gravado diferente de Longe + Adicao foi digitado pelo profissional: nao sobrescrever.
    setPertoEsfManual({
      OD: receita.pertoOdEsf !== null && receita.pertoOdEsf !== calcularPertoEsf(receita.longeOdEsf, receita.adicao),
      OE: receita.pertoOeEsf !== null && receita.pertoOeEsf !== calcularPertoEsf(receita.longeOeEsf, receita.adicao)
    })
    setArmacao(receita.armacao ?? '')
    setObservacao(receita.observacao ?? '')
    setErro(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, receita?.id])

  const mutation = useMutation({
    mutationFn: async () => {
      const validacao = receitaOpticaInputSchema.safeParse({
        clienteId,
        profissionalNome: profissionalNome || null,
        dataExame,
        longeOdEsf: longeOd.esf,
        longeOdCil: longeOd.cil,
        longeOdEixo: longeOd.eixo,
        longeOdDnp: longeOd.dnp,
        longeOdDp: longeOd.dp,
        longeOeEsf: longeOe.esf,
        longeOeCil: longeOe.cil,
        longeOeEixo: longeOe.eixo,
        longeOeDnp: longeOe.dnp,
        longeOeDp: longeOe.dp,
        pertoOdEsf: pertoOd.esf,
        pertoOdCil: pertoOd.cil,
        pertoOdEixo: pertoOd.eixo,
        pertoOdDnp: pertoOd.dnp,
        pertoOdDp: pertoOd.dp,
        pertoOeEsf: pertoOe.esf,
        pertoOeCil: pertoOe.cil,
        pertoOeEixo: pertoOe.eixo,
        pertoOeDnp: pertoOe.dnp,
        pertoOeDp: pertoOe.dp,
        adicao,
        tipoLente: tipoLente || null,
        tratamentos: juntarTratamentos(tratamentos),
        armacao: armacao || null,
        observacao: observacao || null
      })
      if (!validacao.success) {
        // Mostra so o primeiro problema, em portugues e com o campo - nunca o JSON cru do Zod.
        const problema = validacao.error.issues[0]
        const rotulo = rotuloCampo(String(problema?.path[0] ?? ''))
        throw new Error(rotulo ? `${rotulo}: ${problema.message}` : (problema?.message ?? 'Dados inválidos.'))
      }
      return receita
        ? unwrap(window.api.receitas.update({ ...validacao.data, id: receita.id }))
        : unwrap(window.api.receitas.create(validacao.data))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receitas', clienteId] })
      queryClient.invalidateQueries({ queryKey: ['ordensServico'] })
      toast.ok(editando ? 'Receita corrigida.' : 'Receita óptica registrada.')
      limpar()
      onClose()
    },
    onError: (err) => {
      setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
    }
  })

  return (
    <Dialog open={open} onClose={onClose} title={editando ? 'Editar receita óptica' : 'Nova receita óptica'} className="max-w-4xl">
      <form
        className="flex flex-col gap-4"
        // Enter so passa para o proximo campo: a receita so salva pelo botao.
        onKeyDown={enterAvancaCampo}
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Data do exame" required>
            <Input type="date" value={dataExame} onChange={(e) => setDataExame(e.target.value)} required autoFocus />
          </Field>
          <Field label="Profissional (optometrista)">
            <Input value={profissionalNome} onChange={(e) => setProfissionalNome(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LinhaGrau
            titulo="Longe"
            od={longeOd}
            oe={longeOe}
            setOd={(g) => alterarLonge('OD', g)}
            setOe={(g) => alterarLonge('OE', g)}
          />
          <LinhaGrau
            titulo="Perto"
            od={pertoOd}
            oe={pertoOe}
            setOd={(g) => alterarPerto('OD', g)}
            setOe={(g) => alterarPerto('OE', g)}
            esfCalculado={{ OD: !pertoEsfManual.OD, OE: !pertoEsfManual.OE }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Adição" hint="Ao digitar, o esférico do Perto de cada olho é calculado (Longe + Adição).">
            <Input
              className="font-mono-tab"
              value={adicao}
              onChange={(e) => alterarAdicao(e.target.value)}
              placeholder="0,00"
            />
          </Field>
          <Field label="Tipo de lente">
            <Select value={tipoLente} onChange={(e) => setTipoLente(e.target.value)}>
              <option value="">—</option>
              {valorForaDaLista(tipoLente, tiposLente.data)}
              {tiposLente.data?.map((t) => (
                <option key={t.id} value={t.valor}>
                  {t.valor}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <TratamentosCampo
          opcoes={tratamentosDisponiveis.data?.map((t) => t.valor) ?? []}
          selecionados={tratamentos}
          onChange={setTratamentos}
          carregando={tratamentosDisponiveis.isPending}
        />

        <Field label="Armação">
          <Input value={armacao} onChange={(e) => setArmacao(e.target.value)} />
        </Field>
        <Field label="Observações">
          <textarea
            className="min-h-16 w-full rounded-md border border-[var(--rule-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-[var(--accent)]"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </Field>

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex justify-end gap-2 border-t border-[var(--rule)] pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {editando ? 'Salvar alterações' : 'Salvar receita'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
