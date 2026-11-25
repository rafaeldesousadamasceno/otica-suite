import type { ComponentType } from 'react'
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Package,
  Boxes,
  ShoppingCart,
  ShoppingBag,
  Banknote,
  CreditCard,
  Truck,
  FlaskConical,
  CircleDollarSign,
  Wallet,
  Cake,
  UserCog,
  Settings,
  ScrollText,
  ArrowLeftRight,
  PiggyBank,
  DatabaseBackup,
  DatabaseZap,
  ListChecks,
  KeyRound,
  Landmark,
  FileText,
  MessageCircle,
  CircleHelp,
  ShieldCheck
} from 'lucide-react'
import type { Perfil } from '@shared/types'

export interface NavItem {
  label: string
  path: string
  icon: ComponentType<{ className?: string }>
  /** Mostra o ponto de alerta "nao lido" no item quando a licenca pede atencao. */
  alertaLicenca?: boolean
}

/** Grupo do menu: um titulo pequeno e as telas dele. Sem titulo so o primeiro grupo (o Inicio). */
export interface NavGrupo {
  titulo?: string
  /** Grupo que abre e fecha (de uso raro): comeca fechado e abre sozinho quando a tela atual e uma das dele. */
  recolhivel?: boolean
  /** Icone do grupo quando o menu esta recolhido (so icones): o botao que abre e fecha o grupo. */
  icone?: ComponentType<{ className?: string }>
  itens: NavItem[]
}

const INICIO: NavItem = { label: 'Início', path: '/', icon: LayoutDashboard }
const AJUDA: NavItem = { label: 'Ajuda', path: '/ajuda', icon: CircleHelp }

/**
 * Navegacao lateral por assunto (PRD secao 12.1) - a barra muda conforme
 * quem esta logado, nao so os botoes dentro da tela.
 *
 * So aparecem aqui os destinos que existem hoje. Mudar o agrupamento nao muda
 * nenhuma tela nem permissao: so a forma de achar cada uma.
 */
export const NAV_GRUPOS: Record<Perfil, NavGrupo[]> = {
  admin: [
    { itens: [INICIO] },
    {
      titulo: 'Atendimento',
      itens: [
        { label: 'Clientes', path: '/clientes', icon: Users },
        { label: 'Relacionamento', path: '/relacionamento', icon: MessageCircle },
        { label: 'Aniversariantes', path: '/aniversariantes', icon: Cake },
        { label: 'Ordens de Serviço', path: '/ordens-servico', icon: ClipboardList },
        { label: 'Vendas', path: '/vendas', icon: ShoppingCart }
      ]
    },
    {
      titulo: 'Estoque e compras',
      itens: [
        { label: 'Produtos', path: '/produtos', icon: Package },
        { label: 'Estoque', path: '/estoque', icon: Boxes },
        { label: 'Compras', path: '/compras', icon: ShoppingBag },
        { label: 'Fornecedores', path: '/fornecedores', icon: Truck },
        { label: 'Laboratórios', path: '/laboratorios', icon: FlaskConical }
      ]
    },
    {
      titulo: 'Financeiro',
      itens: [
        { label: 'Caixa', path: '/caixa', icon: Landmark },
        { label: 'Contas a Receber', path: '/contas-receber', icon: CircleDollarSign },
        { label: 'Contas a Pagar', path: '/contas-pagar', icon: Wallet }
      ]
    },
    {
      titulo: 'Gestão',
      itens: [
        { label: 'Fluxo de Caixa', path: '/fluxo-caixa', icon: ArrowLeftRight },
        { label: 'Lucro / Prejuízo', path: '/lucro-prejuizo', icon: PiggyBank },
        { label: 'Relatórios', path: '/relatorios', icon: FileText }
      ]
    },
    {
      titulo: 'Administração',
      recolhivel: true,
      icone: ShieldCheck,
      itens: [
        { label: 'Usuários', path: '/usuarios', icon: UserCog },
        { label: 'Formas de Pagamento', path: '/formas-pagamento', icon: Banknote },
        { label: 'Bandeiras', path: '/bandeiras', icon: CreditCard },
        { label: 'Auditoria', path: '/auditoria', icon: ScrollText },
        { label: 'Backup', path: '/backup', icon: DatabaseBackup },
        { label: 'Licença', path: '/licenca', icon: KeyRound, alertaLicenca: true },
        { label: 'Importar Dados', path: '/importar-dados', icon: DatabaseZap },
        { label: 'Pendências da Importação', path: '/pendencias-importacao', icon: ListChecks }
      ]
    }
  ],
  vendedor: [
    { itens: [INICIO] },
    {
      titulo: 'Atendimento',
      itens: [
        { label: 'Clientes', path: '/clientes', icon: Users },
        { label: 'Relacionamento', path: '/relacionamento', icon: MessageCircle },
        { label: 'Aniversariantes', path: '/aniversariantes', icon: Cake },
        { label: 'Ordens de Serviço', path: '/ordens-servico', icon: ClipboardList },
        { label: 'Vendas', path: '/vendas', icon: ShoppingCart }
      ]
    },
    {
      titulo: 'Estoque e compras',
      itens: [
        { label: 'Produtos', path: '/produtos', icon: Package },
        { label: 'Estoque', path: '/estoque', icon: Boxes }
      ]
    },
    {
      titulo: 'Financeiro',
      itens: [{ label: 'Contas a Receber', path: '/contas-receber', icon: CircleDollarSign }]
    }
  ]
}

/** Itens fixos no pe da barra, fora da rolagem: o que nao e rotina de atendimento. */
export const NAV_RODAPE: Record<Perfil, NavItem[]> = {
  admin: [{ label: 'Configurações', path: '/configuracoes', icon: Settings }, AJUDA],
  vendedor: [AJUDA]
}

/** Lista plana de todas as telas do menu de cada perfil (grupos + rodape): a ajuda confere cobertura por ela. */
export const NAV_ITEMS: Record<Perfil, NavItem[]> = {
  admin: [...NAV_GRUPOS.admin.flatMap((g) => g.itens), ...NAV_RODAPE.admin],
  vendedor: [...NAV_GRUPOS.vendedor.flatMap((g) => g.itens), ...NAV_RODAPE.vendedor]
}
