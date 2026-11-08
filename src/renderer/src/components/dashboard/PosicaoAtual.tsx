import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Boxes, Cake, CircleDollarSign, ClipboardList, PackageCheck, Wallet } from 'lucide-react'
import { Card, CardBody } from '@renderer/components/ui/Card'
import { centavosParaBRL } from '@renderer/lib/dinheiro'
import type { DashboardPosicao } from '@shared/types'

interface Item {
  icone: ReactNode
  rotulo: string
  valor: ReactNode
  detalhe?: string
  /** Vermelho/amarelo quando ha algo a resolver; neutro quando esta em dia. */
  alerta?: 'perigo' | 'atencao' | null
  rota?: string
}

const COR_ALERTA = {
  perigo: 'bg-[var(--danger-wash)] text-[var(--danger)]',
  atencao: 'bg-[var(--warn-wash)] text-[var(--warn)]',
  nenhum: 'bg-[var(--surface-2)] text-[var(--ink-3)]'
}

function Cartao({ item }: { item: Item }): ReactNode {
  const navigate = useNavigate()
  return (
    <Card
      className={item.rota ? 'cursor-pointer transition-colors hover:bg-[var(--surface-2)]' : undefined}
      onClick={item.rota ? () => navigate(item.rota!) : undefined}
      role={item.rota ? 'link' : undefined}
      tabIndex={item.rota ? 0 : undefined}
      onKeyDown={item.rota ? (e) => (e.key === 'Enter' ? navigate(item.rota!) : undefined) : undefined}
    >
      <CardBody className="flex items-center gap-3.5 py-4">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-full ${COR_ALERTA[item.alerta ?? 'nenhum']}`}>{item.icone}</div>
        <div className="min-w-0">
          <p className="font-mono-tab text-xl font-semibold text-[var(--ink)]">{item.valor}</p>
          <p className="text-sm text-[var(--ink-3)]">{item.rotulo}</p>
          {item.detalhe && <p className="text-xs text-[var(--ink-3)]">{item.detalhe}</p>}
        </div>
      </CardBody>
    </Card>
  )
}

/**
 * Foto de agora: contas, estoque e ordens de servico. Fica separada dos
 * indicadores do periodo de proposito - o filtro de periodo nao muda nada aqui.
 */
export function PosicaoAtual({ posicao }: { posicao: DashboardPosicao }): ReactNode {
  const itens: Item[] = []

  if (posicao.receber) {
    itens.push({
      icone: <CircleDollarSign className="size-5" />,
      rotulo: 'Contas a receber em aberto',
      valor: centavosParaBRL(posicao.receber.abertoCentavos),
      detalhe: `${posicao.receber.abertoQtd} parcela(s)`,
      rota: '/contas-receber'
    })
    itens.push({
      icone: <AlertTriangle className="size-5" />,
      rotulo: 'Contas a receber vencidas',
      valor: centavosParaBRL(posicao.receber.vencidasCentavos),
      detalhe: `${posicao.receber.vencidasQtd} parcela(s)`,
      alerta: posicao.receber.vencidasQtd > 0 ? 'perigo' : null,
      rota: '/contas-receber?vencidas=1'
    })
  }
  if (posicao.pagar) {
    itens.push({
      icone: <Wallet className="size-5" />,
      rotulo: 'Contas a pagar vencidas',
      valor: centavosParaBRL(posicao.pagar.vencidasCentavos),
      detalhe: `${posicao.pagar.vencidasQtd} conta(s)`,
      alerta: posicao.pagar.vencidasQtd > 0 ? 'perigo' : null,
      rota: '/contas-pagar?vencidas=1'
    })
    itens.push({
      icone: <Wallet className="size-5" />,
      rotulo: 'Contas a pagar hoje',
      valor: centavosParaBRL(posicao.pagar.hojeCentavos),
      detalhe: `${posicao.pagar.hojeQtd} conta(s)`,
      alerta: posicao.pagar.hojeQtd > 0 ? 'atencao' : null,
      rota: '/contas-pagar'
    })
  }
  itens.push(
    {
      icone: <Boxes className="size-5" />,
      rotulo: 'Produtos abaixo do mínimo',
      valor: posicao.produtosAbaixoMinimo,
      alerta: posicao.produtosAbaixoMinimo > 0 ? 'atencao' : null,
      rota: '/estoque?situacao=abaixo_minimo'
    },
    {
      icone: <ClipboardList className="size-5" />,
      rotulo: 'OS atrasadas',
      valor: posicao.osAtrasadas,
      alerta: posicao.osAtrasadas > 0 ? 'perigo' : null,
      rota: '/ordens-servico?atrasadas=1'
    },
    {
      icone: <PackageCheck className="size-5" />,
      rotulo: 'Prontas para retirada',
      valor: posicao.osProntas,
      detalhe: posicao.osProntasHaMuito > 0 ? `${posicao.osProntasHaMuito} há mais de 7 dias` : undefined,
      alerta: posicao.osProntasHaMuito > 0 ? 'atencao' : null,
      rota: '/ordens-servico?situacao=CHEGOU'
    },
    {
      icone: <Cake className="size-5" />,
      rotulo: 'Aniversariantes na semana',
      valor: posicao.aniversariantesSemana,
      rota: '/aniversariantes'
    }
  )

  return (
    <section className="flex flex-col gap-3" aria-labelledby="posicao-atual">
      <div>
        <h2 id="posicao-atual" className="text-base font-semibold text-[var(--ink)]">
          Posição atual
        </h2>
        <p className="text-xs text-[var(--ink-3)]">A situação de hoje — não muda com o período escolhido acima.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {itens.map((item) => (
          <Cartao key={item.rotulo} item={item} />
        ))}
      </div>
    </section>
  )
}
