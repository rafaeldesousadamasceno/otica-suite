import { type ReactNode, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog } from '@renderer/components/ui/Dialog'
import { Field } from '@renderer/components/ui/Field'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { Button } from '@renderer/components/ui/Button'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { receitaOpticaInputSchema } from '@shared/ipc'
import { toast } from '@renderer/state/toastStore'

interface GrauForm {
  esf: string
  cil: string
  eixo: string
  dnp: string
}

const GRAU_VAZIO: GrauForm = { esf: '', cil: '', eixo: '', dnp: '' }

/** Uma linha OD/OE de um bloco (Longe ou Perto) - o padrao real da receita optica. */
function LinhaGrau({
  titulo,
  od,
  oe,
  setOd,
  setOe
}: {
  titulo: string
  od: GrauForm
  oe: GrauForm
  setOd: (g: GrauForm) => void
  setOe: (g: GrauForm) => void
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
            <th className="px-2 py-1.5">Esférico</th>
            <th className="px-2 py-1.5">Cilíndrico</th>
            <th className="px-2 py-1.5">Eixo</th>
            <th className="px-2 py-1.5">DNP</th>
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
              <td className="px-1 py-1">
                <Input
                  className="font-mono-tab text-center"
                  value={valor.esf}
                  onChange={(e) => setValor({ ...valor, esf: e.target.value })}
                  placeholder="0,00"
                />
              </td>
              <td className="px-1 py-1">
                <Input
                  className="font-mono-tab text-center"
                  value={valor.cil}
                  onChange={(e) => setValor({ ...valor, cil: e.target.value })}
                  placeholder="0,00"
                />
              </td>
              <td className="px-1 py-1">
                <Input
                  className="font-mono-tab text-center"
                  value={valor.eixo}
                  onChange={(e) => setValor({ ...valor, eixo: e.target.value })}
                  placeholder="0°"
                />
              </td>
              <td className="px-1 py-1">
                <Input
                  className="font-mono-tab text-center"
                  value={valor.dnp}
                  onChange={(e) => setValor({ ...valor, dnp: e.target.value })}
                  placeholder="mm"
                />
              </td>
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
}

export function ReceitaOpticaFormDialog({ open, onClose, clienteId }: Props): ReactNode {
  const queryClient = useQueryClient()
  const [dataExame, setDataExame] = useState('')
  const [profissionalNome, setProfissionalNome] = useState('')
  const [longeOd, setLongeOd] = useState<GrauForm>(GRAU_VAZIO)
  const [longeOe, setLongeOe] = useState<GrauForm>(GRAU_VAZIO)
  const [pertoOd, setPertoOd] = useState<GrauForm>(GRAU_VAZIO)
  const [pertoOe, setPertoOe] = useState<GrauForm>(GRAU_VAZIO)
  const [adicao, setAdicao] = useState('')
  const [altura, setAltura] = useState('')
  const [tipoLente, setTipoLente] = useState('')
  const [tratamentos, setTratamentos] = useState('')
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
    setAltura('')
    setTipoLente('')
    setTratamentos('')
    setArmacao('')
    setObservacao('')
    setErro(null)
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const dados = receitaOpticaInputSchema.parse({
        clienteId,
        profissionalNome: profissionalNome || null,
        dataExame,
        longeOdEsf: longeOd.esf,
        longeOdCil: longeOd.cil,
        longeOdEixo: longeOd.eixo,
        longeOdDnp: longeOd.dnp,
        longeOeEsf: longeOe.esf,
        longeOeCil: longeOe.cil,
        longeOeEixo: longeOe.eixo,
        longeOeDnp: longeOe.dnp,
        pertoOdEsf: pertoOd.esf,
        pertoOdCil: pertoOd.cil,
        pertoOdEixo: pertoOd.eixo,
        pertoOdDnp: pertoOd.dnp,
        pertoOeEsf: pertoOe.esf,
        pertoOeCil: pertoOe.cil,
        pertoOeEixo: pertoOe.eixo,
        pertoOeDnp: pertoOe.dnp,
        adicao,
        altura,
        tipoLente: tipoLente || null,
        tratamentos: tratamentos || null,
        armacao: armacao || null,
        observacao: observacao || null
      })
      return unwrap(window.api.receitas.create(dados))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receitas', clienteId] })
      toast.ok('Receita óptica registrada.')
      limpar()
      onClose()
    },
    onError: (err) => {
      setErro(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
    }
  })

  return (
    <Dialog open={open} onClose={onClose} title="Nova receita óptica" className="max-w-3xl">
      <form
        className="flex flex-col gap-4"
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
          <LinhaGrau titulo="Longe" od={longeOd} oe={longeOe} setOd={setLongeOd} setOe={setLongeOe} />
          <LinhaGrau titulo="Perto" od={pertoOd} oe={pertoOe} setOd={setPertoOd} setOe={setPertoOe} />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Adição">
            <Input
              className="font-mono-tab"
              value={adicao}
              onChange={(e) => setAdicao(e.target.value)}
              placeholder="0,00"
            />
          </Field>
          <Field label="Altura (mm)">
            <Input className="font-mono-tab" value={altura} onChange={(e) => setAltura(e.target.value)} />
          </Field>
          <Field label="Tipo de lente" className="col-span-2 sm:col-span-1">
            <Select value={tipoLente} onChange={(e) => setTipoLente(e.target.value)}>
              <option value="">—</option>
              {tiposLente.data?.map((t) => (
                <option key={t.id} value={t.valor}>
                  {t.valor}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tratamentos" className="col-span-2 sm:col-span-1">
            <Select value={tratamentos} onChange={(e) => setTratamentos(e.target.value)}>
              <option value="">—</option>
              {tratamentosDisponiveis.data?.map((t) => (
                <option key={t.id} value={t.valor}>
                  {t.valor}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="-mt-2 text-xs text-[var(--ink-3)]">
          A adição soma automaticamente no Perto de cada olho, se você deixar esse campo em branco.
        </p>

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
            Salvar receita
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
