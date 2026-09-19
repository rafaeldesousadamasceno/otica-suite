import { useEffect, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Routes, Route, Navigate } from 'react-router-dom'
import { unwrap } from '@renderer/lib/ipc'
import { useAuthStore } from '@renderer/state/authStore'
import { Toaster } from '@renderer/components/ui/Toaster'
import { AppShell } from '@renderer/components/layout/AppShell'
import { SetupWizardPage } from '@renderer/routes/SetupWizardPage'
import { LoginPage } from '@renderer/routes/LoginPage'
import { DashboardPage } from '@renderer/routes/DashboardPage'
import { ClientesPage } from '@renderer/routes/shared/ClientesPage'
import { ClienteDetailPage } from '@renderer/routes/shared/ClienteDetailPage'
import { OrdensServicoPage } from '@renderer/routes/shared/OrdensServicoPage'
import { ProdutosPage } from '@renderer/routes/shared/ProdutosPage'
import { VendasPage } from '@renderer/routes/shared/VendasPage'
import { ContasReceberPage } from '@renderer/routes/shared/ContasReceberPage'
import { EstoquePage } from '@renderer/routes/shared/EstoquePage'
import { FornecedoresPage } from '@renderer/routes/admin/FornecedoresPage'
import { ComprasPage } from '@renderer/routes/admin/ComprasPage'
import { ContasPagarPage } from '@renderer/routes/admin/ContasPagarPage'
import { CaixaPage } from '@renderer/routes/admin/CaixaPage'
import { FluxoCaixaPage } from '@renderer/routes/admin/FluxoCaixaPage'
import { LucroPrejuizoPage } from '@renderer/routes/admin/LucroPrejuizoPage'
import { UsuariosPage } from '@renderer/routes/admin/UsuariosPage'
import { ConfiguracoesPage } from '@renderer/routes/admin/ConfiguracoesPage'
import { AuditoriaPage } from '@renderer/routes/admin/AuditoriaPage'
import { BackupPage } from '@renderer/routes/admin/BackupPage'
import { ImportarDadosPage } from '@renderer/routes/admin/ImportarDadosPage'
import { LicencaPage } from '@renderer/routes/admin/LicencaPage'
import { AniversariantesPage } from '@renderer/routes/shared/AniversariantesPage'
import { RelatoriosPage } from '@renderer/routes/admin/RelatoriosPage'
import { RelacionamentoPage } from '@renderer/routes/shared/RelacionamentoPage'

function aplicarTemaEAcento(cor: string, tema: 'claro' | 'escuro' | 'sistema'): void {
  document.documentElement.style.setProperty('--accent', cor)
  if (tema === 'sistema') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', tema)
  }
}

export default function App(): ReactNode {
  const { sessao, setSessao } = useAuthStore()
  const queryClient = useQueryClient()

  const bootstrap = useQuery({
    queryKey: ['bootstrap'],
    queryFn: () => unwrap(window.api.bootstrap.get())
  })

  const sessaoQuery = useQuery({
    queryKey: ['sessao'],
    queryFn: () => unwrap(window.api.auth.getSession()),
    enabled: bootstrap.data?.configurado === true
  })

  const empresa = useQuery({
    queryKey: ['empresa'],
    queryFn: () => unwrap(window.api.empresa.get()),
    enabled: bootstrap.data?.configurado === true,
    staleTime: Infinity
  })

  useEffect(() => {
    if (sessaoQuery.data !== undefined) setSessao(sessaoQuery.data)
  }, [sessaoQuery.data, setSessao])

  useEffect(() => {
    if (empresa.data) aplicarTemaEAcento(empresa.data.corDestaque, empresa.data.tema)
  }, [empresa.data])

  if (bootstrap.isLoading) return <SplashScreen />

  // Nunca cair silenciosamente na tela de login por falta de dado: se a
  // primeira chamada ao processo main falhar (preload nao carregou, IPC
  // nao respondeu), isso precisa aparecer como erro, nao como uma tela
  // de login vazia e confusa.
  if (bootstrap.isError || !bootstrap.data) {
    return (
      <ErrorScreen
        detail={bootstrap.error instanceof Error ? bootstrap.error.message : String(bootstrap.error)}
      />
    )
  }

  if (!bootstrap.data.configurado) {
    return (
      <>
        <SetupWizardPage
          onDone={() => {
            queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
            queryClient.invalidateQueries({ queryKey: ['empresa'] })
          }}
        />
        <Toaster />
      </>
    )
  }

  if (sessaoQuery.isLoading) return <SplashScreen />

  if (!sessao) {
    return (
      <>
        <LoginPage
          empresa={empresa.data ?? null}
          onLogin={(s) => {
            setSessao(s)
            queryClient.invalidateQueries()
          }}
        />
        <Toaster />
      </>
    )
  }

  const perfil = sessao.usuario.perfil

  return (
    <>
      <AppShell>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/clientes" element={<ClientesPage />} />
          <Route path="/clientes/:id" element={<ClienteDetailPage />} />
          <Route path="/ordens-servico" element={<OrdensServicoPage />} />
          <Route path="/produtos" element={<ProdutosPage />} />
          <Route path="/vendas" element={<VendasPage />} />
          <Route path="/contas-receber" element={<ContasReceberPage />} />
          <Route path="/estoque" element={<EstoquePage />} />
          <Route path="/aniversariantes" element={<AniversariantesPage />} />
          <Route path="/relacionamento" element={<RelacionamentoPage />} />
          {perfil === 'admin' && (
            <>
              <Route path="/contas-pagar" element={<ContasPagarPage />} />
              <Route path="/caixa" element={<CaixaPage />} />
              <Route path="/fluxo-caixa" element={<FluxoCaixaPage />} />
              <Route path="/lucro-prejuizo" element={<LucroPrejuizoPage />} />
              <Route path="/relatorios" element={<RelatoriosPage />} />
              <Route path="/fornecedores" element={<FornecedoresPage />} />
              <Route path="/compras" element={<ComprasPage />} />
              <Route path="/usuarios" element={<UsuariosPage />} />
              <Route path="/configuracoes" element={<ConfiguracoesPage />} />
              <Route path="/auditoria" element={<AuditoriaPage />} />
              <Route path="/backup" element={<BackupPage />} />
              <Route path="/importar-dados" element={<ImportarDadosPage />} />
              <Route path="/licenca" element={<LicencaPage />} />
            </>
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
      <Toaster />
    </>
  )
}

function SplashScreen(): ReactNode {
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--bg)]">
      <div className="size-8 animate-spin rounded-full border-2 border-[var(--rule-strong)] border-t-[var(--accent)]" />
    </div>
  )
}

function ErrorScreen({ detail }: { detail: string }): ReactNode {
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--bg)] p-6">
      <div className="max-w-md rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-wash)] p-6 text-center">
        <p className="font-semibold text-[var(--danger)]">Não foi possível conectar ao sistema.</p>
        <p className="mt-2 text-sm text-[var(--ink-2)]">
          O aplicativo não conseguiu falar com o processo interno. Feche e abra o programa novamente.
          Se persistir, isso é um bug — reporte com a mensagem abaixo.
        </p>
        <p className="mt-3 rounded bg-black/5 p-2 font-mono-tab text-xs text-[var(--ink-3)]">{detail}</p>
      </div>
    </div>
  )
}
