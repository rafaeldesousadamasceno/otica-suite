import type { ComponentType } from 'react'
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Package,
  Boxes,
  ShoppingCart,
  ShoppingBag,
  Truck,
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
  KeyRound,
  Landmark,
  FileText,
  MessageCircle
} from 'lucide-react'
import type { Perfil } from '@shared/types'

export interface NavItem {
  label: string
  path: string
  icon: ComponentType<{ className?: string }>
}

/**
 * Navegacao lateral por modulo (PRD secao 12.1) - a barra muda conforme
 * quem esta logado, nao so os botoes dentro da tela.
 *
 * So aparecem aqui os destinos que existem hoje.
 */
export const NAV_ITEMS: Record<Perfil, NavItem[]> = {
  admin: [
    { label: 'Início', path: '/', icon: LayoutDashboard },
    { label: 'Clientes', path: '/clientes', icon: Users },
    { label: 'Relacionamento', path: '/relacionamento', icon: MessageCircle },
    { label: 'Ordens de Serviço', path: '/ordens-servico', icon: ClipboardList },
    { label: 'Vendas', path: '/vendas', icon: ShoppingCart },
    { label: 'Contas a Receber', path: '/contas-receber', icon: CircleDollarSign },
    { label: 'Contas a Pagar', path: '/contas-pagar', icon: Wallet },
    { label: 'Caixa', path: '/caixa', icon: Landmark },
    { label: 'Fluxo de Caixa', path: '/fluxo-caixa', icon: ArrowLeftRight },
    { label: 'Lucro / Prejuízo', path: '/lucro-prejuizo', icon: PiggyBank },
    { label: 'Relatórios', path: '/relatorios', icon: FileText },
    { label: 'Produtos', path: '/produtos', icon: Package },
    { label: 'Estoque', path: '/estoque', icon: Boxes },
    { label: 'Fornecedores', path: '/fornecedores', icon: Truck },
    { label: 'Compras', path: '/compras', icon: ShoppingBag },
    { label: 'Aniversariantes', path: '/aniversariantes', icon: Cake },
    { label: 'Usuários', path: '/usuarios', icon: UserCog },
    { label: 'Configurações', path: '/configuracoes', icon: Settings },
    { label: 'Auditoria', path: '/auditoria', icon: ScrollText },
    { label: 'Backup', path: '/backup', icon: DatabaseBackup },
    { label: 'Importar Dados', path: '/importar-dados', icon: DatabaseZap },
    { label: 'Licença', path: '/licenca', icon: KeyRound }
  ],
  vendedor: [
    { label: 'Início', path: '/', icon: LayoutDashboard },
    { label: 'Clientes', path: '/clientes', icon: Users },
    { label: 'Relacionamento', path: '/relacionamento', icon: MessageCircle },
    { label: 'Ordens de Serviço', path: '/ordens-servico', icon: ClipboardList },
    { label: 'Vendas', path: '/vendas', icon: ShoppingCart },
    { label: 'Contas a Receber', path: '/contas-receber', icon: CircleDollarSign },
    { label: 'Produtos', path: '/produtos', icon: Package },
    { label: 'Estoque', path: '/estoque', icon: Boxes },
    { label: 'Aniversariantes', path: '/aniversariantes', icon: Cake }
  ]
}
