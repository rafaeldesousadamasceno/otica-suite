import type { ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Printer, Trash2, TriangleAlert } from 'lucide-react'
import { Card } from '@renderer/components/ui/Card'
import { Badge } from '@renderer/components/ui/Badge'
import { Button } from '@renderer/components/ui/Button'
import { IconeOlho } from '@renderer/components/prescricao/IconeOlho'
import { unwrap, ApiCallError } from '@renderer/lib/ipc'
import { useConfirm } from '@renderer/lib/confirmar'
import { useGerarPdf } from '@renderer/lib/useGerarPdf'
import { usePreferenciasStore } from '@renderer/state/preferenciasStore'
import { toast } from '@renderer/state/toastStore'
import { formatarDioptria } from '@shared/dioptria'
import { ROTULO_BASE_PRISMA, ROTULO_OLHO, ROTULO_PRESCRICAO, resumoMedidas, type Olho } from '@shared/prescricao'
import type { ReceitaOptica } from '@shared/types'

function formatarDataBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

const mm = (v: number | null): string => (v === null ? '—' : `${String(v).replace('.', ',')}`)

interface Props {
  receita: ReceitaOptica
  /** Para a pergunta de exclusao ("Prescricao de Maria Silva - 12/03/2026"). */
  clienteNome?: string
  onEditar?: () => void
  /** Mostra o botao Excluir (so quem tem permissao). */
  podeExcluir?: boolean
}

function BlocoOlho({ r, olho }: { r: ReceitaOptica; olho: Olho }): ReactNode {
  const formato = usePreferenciasStore((s) => s.formatoNumero)
  const grau = (v: number | null): string => formatarDioptria(v, { formato }) || '—'
  const adicao = olho === 'Od' ? r.adicaoOd : r.adicaoOe
  const prisma = r[`longe${olho}Prisma`]
  const base = r[`longe${olho}BasePrisma`]
  const alt = r[`longe${olho}Alt`]

  const linha = (titulo: string, esf: number | null, cil: number | null, eixo: number | null, dnp: number | null, destaque: boolean): ReactNode => (
    <tr>
      <td className={destaque ? 'py-0.5 text-left font-semibold text-[var(--accent)]' : 'py-0.5 text-left text-[var(--ink-2)]'}>{titulo}</td>
      <td className="text-center">{grau(esf)}</td>
      <td className="text-center">{grau(cil)}</td>
      <td className="text-center">{eixo === null ? '—' : `${eixo}°`}</td>
      <td className="text-center">{mm(dnp)}</td>
    </tr>
  )

  return (
    <div className="flex flex-col gap-2 bg-[var(--surface)] p-3">
      <div className="flex items-center gap-2">
        <IconeOlho olho={olho} className="h-6 w-11 shrink-0" />
        <p className="text-sm font-semibold text-[var(--ink)]">{ROTULO_OLHO[olho]}</p>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[var(--ink-3)]">
            <th className="w-14 text-left font-normal"></th>
            <th className="font-normal">Esf</th>
            <th className="font-normal">Cil</th>
            <th className="font-normal">Eixo</th>
            <th className="font-normal">DNP</th>
          </tr>
        </thead>
        <tbody className="font-mono-tab text-[var(--ink)]">
          {linha('Longe', r[`longe${olho}Esf`], r[`longe${olho}Cil`], r[`longe${olho}Eixo`], r[`longe${olho}Dnp`], true)}
          {linha('Perto', r[`perto${olho}Esf`], r[`perto${olho}Cil`], r[`perto${olho}Eixo`], r[`perto${olho}Dnp`], true)}
        </tbody>
      </table>
      <p className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--ink-2)]">
        {!r.formatoAnterior && (
          <span>
            Adição: <b className="font-mono-tab text-[var(--ink)]">{formatarDioptria(adicao ?? 0, { signed: false, formato })}</b>
          </span>
        )}
        {alt !== null && (
          <span>
            Altura: <b className="font-mono-tab text-[var(--ink)]">{mm(alt)} mm</b>
          </span>
        )}
        {prisma > 0 && (
          <span>
            Prisma: <b className="font-mono-tab text-[var(--ink)]">{String(prisma.toFixed(2)).replace('.', ',')} Δ</b> · base {ROTULO_BASE_PRISMA[base].toLowerCase()}
          </span>
        )}
      </p>
    </div>
  )
}

export function ReceitaOpticaCard({ receita, clienteNome, onEditar, podeExcluir }: Props): ReactNode {
  const exibirDp = usePreferenciasStore((s) => s.exibirDp)
  const confirmar = useConfirm()
  const queryClient = useQueryClient()
  const data = formatarDataBr(receita.dataExame)

  const imprimir = useGerarPdf(() => window.api.relatorios.prescricao({ id: receita.id, exibirDp }))
  const excluir = useMutation({
    mutationFn: () => unwrap(window.api.receitas.excluir({ id: receita.id })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receitas', receita.clienteId] })
      toast.ok(`${ROTULO_PRESCRICAO} excluída.`)
    },
    onError: (err) => toast.error(err instanceof ApiCallError || err instanceof Error ? err.message : 'Erro inesperado.')
  })

  async function pedirExclusao(): Promise<void> {
    const ok = await confirmar({
      variante: 'excluir',
      entidade: ROTULO_PRESCRICAO.toLowerCase(),
      item: `${ROTULO_PRESCRICAO}${clienteNome ? ` de ${clienteNome}` : ''} — ${data}`
    })
    if (ok) excluir.mutate()
  }

  const medidas = resumoMedidas(receita)
  const armacao = [receita.armacaoTipo, receita.armacaoModelo, receita.armacaoMarca, receita.armacaoCor].filter(Boolean).join(' · ') || receita.armacao

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule)] bg-[var(--surface-2)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--ink)]">{data}</span>
          <Badge tone="accent">versão {receita.versao}</Badge>
          {receita.profissionalNome && <span className="text-xs text-[var(--ink-3)]">Dr(a). {receita.profissionalNome}</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" loading={imprimir.isPending} onClick={() => imprimir.mutate()} aria-label={`Imprimir a ${ROTULO_PRESCRICAO.toLowerCase()} de ${data}`}>
            <Printer className="size-3.5" /> Imprimir
          </Button>
          {onEditar && (
            <Button variant="ghost" size="sm" onClick={onEditar} aria-label={`Editar a ${ROTULO_PRESCRICAO.toLowerCase()} de ${data}`}>
              <Pencil className="size-3.5" /> Editar
            </Button>
          )}
          {podeExcluir && (
            <Button variant="ghost" size="sm" loading={excluir.isPending} onClick={pedirExclusao} aria-label={`Excluir a ${ROTULO_PRESCRICAO.toLowerCase()} de ${data}`}>
              <Trash2 className="size-3.5" /> Excluir
            </Button>
          )}
        </div>
      </div>

      {receita.formatoAnterior && (
        <p className="flex items-center gap-2 border-b border-[var(--rule)] bg-[var(--warn-wash)] px-4 py-2 text-xs text-[var(--warn)]">
          <TriangleAlert className="size-3.5 shrink-0" /> {ROTULO_PRESCRICAO} registrada no formato anterior: o Perto é o que foi gravado na época.
        </p>
      )}

      <div className="grid grid-cols-1 gap-px bg-[var(--rule)] sm:grid-cols-2">
        <BlocoOlho r={receita} olho="Od" />
        <BlocoOlho r={receita} olho="Oe" />
      </div>

      <div className="flex flex-col gap-1 border-t border-[var(--rule)] px-4 py-2.5 text-xs text-[var(--ink-2)]">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          {exibirDp && (
            <span>
              DP Longe: <b className="font-mono-tab text-[var(--ink)]">{receita.dpLonge === null ? '—' : `${mm(receita.dpLonge)} mm`}</b> · DP Perto:{' '}
              <b className="font-mono-tab text-[var(--ink)]">{receita.dpPerto === null ? '—' : `${mm(receita.dpPerto)} mm`}</b>
            </span>
          )}
          {receita.tipoLente && (
            <span>
              Lente: <b className="text-[var(--ink)]">{receita.tipoLente}</b>
            </span>
          )}
          {receita.indiceRefracao && (
            <span>
              Índice: <b className="font-mono-tab text-[var(--ink)]">{receita.indiceRefracao}</b>
            </span>
          )}
          {receita.tratamentos && (
            <span>
              Tratamentos: <b className="text-[var(--ink)]">{receita.tratamentos}</b>
            </span>
          )}
          {armacao && (
            <span>
              Armação: <b className="text-[var(--ink)]">{armacao}</b>
            </span>
          )}
          {medidas && (
            <span>
              Medidas: <b className="font-mono-tab text-[var(--ink)]">{medidas}</b>
            </span>
          )}
        </div>
      </div>
      {receita.observacao && <p className="border-t border-[var(--rule)] px-4 py-2.5 text-xs text-[var(--ink-2)]">{receita.observacao}</p>}
    </Card>
  )
}
