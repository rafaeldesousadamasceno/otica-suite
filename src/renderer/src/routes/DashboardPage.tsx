import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ShoppingCart,
  CircleDollarSign,
  Wallet,
  Boxes,
  ClipboardList,
  AlertTriangle,
  Cake,
  Trophy,
  UserPlus,
  Wallet as WalletComissao
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardBody } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { unwrap } from '@renderer/lib/ipc'
import { centavosParaBRL } from '@renderer/lib/dinheiro'
import { useAuthStore } from '@renderer/state/authStore'

interface TileProps {
  icon: ReactNode
  iconBg: string
  iconColor: string
  valor: ReactNode
  legenda: string
  extra?: ReactNode
  onClick?: () => void
}

function StatTile({ icon, iconBg, iconColor, valor, legenda, extra, onClick }: TileProps): ReactNode {
  return (
    <Card
      className={onClick ? 'cursor-pointer transition-colors hover:bg-[var(--surface-2)]' : undefined}
      onClick={onClick}
    >
      <CardBody className="flex items-center gap-4">
        <div className={`flex size-11 shrink-0 items-center justify-center rounded-full ${iconBg} ${iconColor}`}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-semibold font-mono-tab text-[var(--ink)]">{valor}</p>
          <p className="text-sm text-[var(--ink-3)]">{legenda}</p>
          {extra}
        </div>
      </CardBody>
    </Card>
  )
}

function calcularVariacaoPct(atual: number, anterior: number): string | null {
  if (anterior === 0) return null
  const pct = ((atual - anterior) / anterior) * 100
  const sinal = pct >= 0 ? '+' : ''
  return `${sinal}${pct.toFixed(0)}% vs mês anterior`
}

export function DashboardPage(): ReactNode {
  const sessao = useAuthStore((s) => s.sessao)
  const navigate = useNavigate()

  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => unwrap(window.api.dashboard.get())
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--ink)]">
          Olá, {sessao?.usuario.nome.split(' ')[0]}
        </h1>
        <p className="text-sm text-[var(--ink-3)]">
          {sessao?.usuario.perfil === 'admin' ? 'Painel do administrador' : 'Painel do vendedor'}
        </p>
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => navigate('/clientes')}>
          <UserPlus className="size-4" />
          Novo cliente
        </Button>
        <Button variant="secondary" onClick={() => navigate('/ordens-servico')}>
          <ClipboardList className="size-4" />
          Nova OS
        </Button>
      </div>

      {dashboard.data?.perfil === 'admin' && (
        <AdminDashboard dados={dashboard.data.dados} navigate={navigate} />
      )}

      {dashboard.data?.perfil === 'vendedor' && (
        <VendedorDashboard dados={dashboard.data.dados} navigate={navigate} />
      )}
    </div>
  )
}

function AdminDashboard({
  dados,
  navigate
}: {
  dados: import('@shared/types').DashboardAdmin
  navigate: ReturnType<typeof useNavigate>
}): ReactNode {
  const variacaoMes = calcularVariacaoPct(dados.vendasMesCentavos, dados.vendasMesAnteriorCentavos)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          icon={<ShoppingCart className="size-5" />}
          iconBg="bg-[var(--accent)]/12"
          iconColor="text-[var(--accent)]"
          valor={centavosParaBRL(dados.vendasHojeCentavos)}
          legenda="Vendas hoje"
        />

        <StatTile
          icon={<ShoppingCart className="size-5" />}
          iconBg="bg-[var(--accent)]/12"
          iconColor="text-[var(--accent)]"
          valor={centavosParaBRL(dados.vendasMesCentavos)}
          legenda="Vendas do mês"
          extra={
            variacaoMes && (
              <p
                className={`text-xs font-medium ${
                  dados.vendasMesCentavos >= dados.vendasMesAnteriorCentavos
                    ? 'text-[var(--ok)]'
                    : 'text-[var(--danger)]'
                }`}
              >
                {variacaoMes}
              </p>
            )
          }
        />

        <StatTile
          icon={<CircleDollarSign className="size-5" />}
          iconBg={dados.saldoMesCentavos >= 0 ? 'bg-[var(--ok-wash)]' : 'bg-[var(--danger-wash)]'}
          iconColor={dados.saldoMesCentavos >= 0 ? 'text-[var(--ok)]' : 'text-[var(--danger)]'}
          valor={
            <span className={dados.saldoMesCentavos >= 0 ? 'text-[var(--ok)]' : 'text-[var(--danger)]'}>
              {centavosParaBRL(dados.saldoMesCentavos)}
            </span>
          }
          legenda="Saldo do mês"
        />

        <StatTile
          icon={<CircleDollarSign className="size-5" />}
          iconBg="bg-[var(--warn-wash)]"
          iconColor="text-[var(--warn)]"
          valor={`${dados.contasReceberVencendoQtd} · ${centavosParaBRL(dados.contasReceberVencendoCentavos)}`}
          legenda="Contas a receber vencendo"
          onClick={() => navigate('/contas-receber')}
        />

        <StatTile
          icon={<AlertTriangle className="size-5" />}
          iconBg={dados.contasReceberVencidasQtd > 0 ? 'bg-[var(--danger-wash)]' : 'bg-[var(--surface-2)]'}
          iconColor={dados.contasReceberVencidasQtd > 0 ? 'text-[var(--danger)]' : 'text-[var(--ink-3)]'}
          valor={dados.contasReceberVencidasQtd}
          legenda="Contas a receber vencidas"
          onClick={() => navigate('/contas-receber')}
        />

        <StatTile
          icon={<Wallet className="size-5" />}
          iconBg="bg-[var(--warn-wash)]"
          iconColor="text-[var(--warn)]"
          valor={`${dados.contasPagarVencendoQtd} · ${centavosParaBRL(dados.contasPagarVencendoCentavos)}`}
          legenda="Contas a pagar do dia"
          onClick={() => navigate('/contas-pagar')}
        />

        <StatTile
          icon={<Boxes className="size-5" />}
          iconBg="bg-[var(--warn-wash)]"
          iconColor="text-[var(--warn)]"
          valor={dados.produtosAbaixoMinimo}
          legenda="Produtos abaixo do mínimo"
          onClick={() => navigate('/estoque')}
        />

        <StatTile
          icon={<AlertTriangle className="size-5" />}
          iconBg="bg-[var(--danger-wash)]"
          iconColor="text-[var(--danger)]"
          valor={dados.osAtrasadas}
          legenda="OS atrasadas"
          onClick={() => navigate('/ordens-servico')}
        />

        <StatTile
          icon={<Cake className="size-5" />}
          iconBg="bg-[var(--warn-wash)]"
          iconColor="text-[var(--warn)]"
          valor={dados.aniversariantesSemana}
          legenda="Aniversariantes na semana"
          onClick={() => navigate('/aniversariantes')}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="size-4 text-[var(--warn)]" />
            Ranking de vendedores
          </CardTitle>
        </CardHeader>
        <CardBody>
          {dados.rankingVendedores.length === 0 ? (
            <p className="text-sm text-[var(--ink-3)]">Nenhuma venda este mês ainda.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {dados.rankingVendedores.slice(0, 5).map((v, i) => (
                <li key={v.vendedorId} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--ink)]">
                    {i + 1}. {v.vendedorNome}
                  </span>
                  <span className="font-mono-tab font-medium text-[var(--ink)]">
                    {centavosParaBRL(v.totalCentavos)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function VendedorDashboard({
  dados,
  navigate
}: {
  dados: import('@shared/types').DashboardVendedor
  navigate: ReturnType<typeof useNavigate>
}): ReactNode {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatTile
        icon={<ShoppingCart className="size-5" />}
        iconBg="bg-[var(--accent)]/12"
        iconColor="text-[var(--accent)]"
        valor={centavosParaBRL(dados.vendasHojeCentavos)}
        legenda="Vendas hoje"
      />

      <StatTile
        icon={<ShoppingCart className="size-5" />}
        iconBg="bg-[var(--accent)]/12"
        iconColor="text-[var(--accent)]"
        valor={centavosParaBRL(dados.vendasMesCentavos)}
        legenda="Vendas do mês"
      />

      <StatTile
        icon={<WalletComissao className="size-5" />}
        iconBg="bg-[var(--ok-wash)]"
        iconColor="text-[var(--ok)]"
        valor={centavosParaBRL(dados.comissaoAcumuladaCentavos)}
        legenda="Comissão acumulada"
      />

      <StatTile
        icon={<ClipboardList className="size-5" />}
        iconBg="bg-[var(--accent)]/12"
        iconColor="text-[var(--accent)]"
        valor={dados.osResponsavel}
        legenda="OSs sob sua responsabilidade"
        onClick={() => navigate('/ordens-servico')}
      />

      <StatTile
        icon={<ClipboardList className="size-5" />}
        iconBg="bg-[var(--warn-wash)]"
        iconColor="text-[var(--warn)]"
        valor={dados.osAguardandoRetirada}
        legenda="OSs aguardando retirada"
      />

      <StatTile
        icon={<Cake className="size-5" />}
        iconBg="bg-[var(--warn-wash)]"
        iconColor="text-[var(--warn)]"
        valor={dados.aniversariantesSemana}
        legenda="Aniversariantes na semana"
        onClick={() => navigate('/aniversariantes')}
      />
    </div>
  )
}
