import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { useSettings } from './context/SettingsContext'
import { canAccess } from './utils/access'
import AppShell from './components/Layout/AppShell'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import LandingPage from './pages/LandingPage'

// Telas do SaaS Multi-Tenant
const RegisterStore = lazy(() => import('./pages/RegisterStore'))
const PendingActivation = lazy(() => import('./pages/PendingActivation'))
const SuspendedStore = lazy(() => import('./pages/SuspendedStore'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const PlatformAdmin = lazy(() => import('./pages/PlatformAdmin'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))

// Telas secundárias carregadas sob demanda para máxima velocidade inicial
const FinancialHistory = lazy(() => import('./pages/FinancialHistory'))
const Customers = lazy(() => import('./pages/Customers'))
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'))
const ServiceOrders = lazy(() => import('./pages/ServiceOrders'))
const ServiceOrderForm = lazy(() => import('./pages/ServiceOrderForm'))
const ServiceOrderDetail = lazy(() => import('./pages/ServiceOrderDetail'))
const ServiceOrderPrint = lazy(() => import('./pages/ServiceOrderPrint'))
const QrCodePrint = lazy(() => import('./pages/QrCodePrint'))
const Warranties = lazy(() => import('./pages/Warranties'))
const CreditAccounts = lazy(() => import('./pages/CreditAccounts'))
const PagbankCalculator = lazy(() => import('./pages/PagbankCalculator'))
const FrontalsCalculator = lazy(() => import('./pages/FrontalsCalculator'))
const DeviceSale = lazy(() => import('./pages/DeviceSale'))
const Sales = lazy(() => import('./pages/Sales'))
const InventoryControl = lazy(() => import('./pages/InventoryControl'))
const CompatibleScreenProtectors = lazy(() => import('./pages/CompatibleScreenProtectors'))
const CashWithdrawals = lazy(() => import('./pages/CashWithdrawals'))
const Settings = lazy(() => import('./pages/Settings'))
const Users = lazy(() => import('./pages/Users'))
const Notes = lazy(() => import('./pages/Notes'))
const VirusRemover = lazy(() => import('./pages/VirusRemover'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[40vh] p-8 text-slate-400">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-medium">Carregando...</span>
      </div>
    </div>
  )
}

function Protected({ children, adminOnly = false }) {
  const { user, isAdmin } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />
  return children
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('[APP_ERROR_BOUNDARY]', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6 text-center">
          <div className="max-w-md space-y-4">
            <h2 className="text-xl font-bold text-amber-400">Ops! Ocorreu um erro nesta página.</h2>
            <p className="text-xs text-slate-400 font-mono bg-slate-900 p-3 rounded-lg border border-slate-800 text-left overflow-auto max-h-40">
              {this.state.error?.message || 'Erro desconhecido'}
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <button type="button" onClick={() => window.location.reload()} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition">
                Recarregar Página
              </button>
              <a href="/login" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs rounded-xl transition">
                Ir para o Login
              </a>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const { user } = useAuth()
  const location = useLocation()
  const config = useSettings()

  if (user && user.role !== 'admin' && location.pathname !== '/login' && location.pathname !== '/' && !canAccess(user, location.pathname)) {
    const first = ['/ordens', '/clientes', '/garantias', '/anotacoes', '/estoque', '/vendas', '/venda-aparelho', '/fiados', '/removedor-virus'].find(path => canAccess(user, path))
    return first ? <Navigate to={first} replace /> : <AppShell><p className="p-6">Nenhuma área liberada. Solicite acesso ao administrador.</p></AppShell>
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to={config?.settings?.system.home || '/dashboard'} replace /> : <Login />} />
        <Route path="/cadastro" element={<RegisterStore />} />
        <Route path="/aguardando-ativacao" element={<PendingActivation />} />
        <Route path="/loja-suspensa" element={<SuspendedStore />} />
        <Route path="/recuperar-senha" element={<ForgotPassword />} />
        <Route path="/redefinir-senha" element={<ResetPassword />} />
        <Route path="/admin-plataforma" element={<PlatformAdmin />} />
        <Route path="/politica-privacidade" element={<PrivacyPolicy />} />

        <Route path="/ordens/:id/imprimir" element={
          <Protected><div className="min-h-screen bg-slate-100 dark:bg-[var(--bg-primary)] p-6"><ServiceOrderPrint /></div></Protected>
        } />

        <Route path="/ordens/:id/imprimir-qrcode" element={
          <Protected><div className="min-h-screen bg-slate-100 dark:bg-[var(--bg-primary)] p-4 sm:p-6 print:p-0 print:m-0 print:bg-white print:min-h-0"><QrCodePrint /></div></Protected>
        } />

        {/* Rota raiz: landing page pública ou dashboard para autenticados */}
        <Route path="/" element={user ? <Navigate to={config?.settings?.system.home || '/dashboard'} replace /> : <LandingPage />} />

        <Route path="/*" element={
          <Protected>
            <AppShell>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/historico-financeiro" element={<FinancialHistory />} />
                  <Route path="/clientes" element={<Customers />} />
                  <Route path="/clientes/:id" element={<CustomerDetail />} />
                  <Route path="/ordens" element={<ServiceOrders />} />
                  <Route path="/ordens/nova" element={<ServiceOrderForm />} />
                  <Route path="/ordens/:id" element={<ServiceOrderDetail />} />
                  <Route path="/ordens/:id/editar" element={<ServiceOrderForm />} />
                  <Route path="/garantias" element={<Warranties />} />
                  <Route path="/fiados" element={<CreditAccounts />} />
                  <Route path="/calculadora-maquininha" element={<PagbankCalculator />} />
                  <Route path="/pagbank-calculadora" element={<Navigate to="/calculadora-maquininha" replace />} />
                  <Route path="/calculo-peca" element={<Navigate to="/valor-frontais" replace />} />
                  <Route path="/valor-frontais" element={<FrontalsCalculator />} />
                  <Route path="/peliculas-compativeis" element={<CompatibleScreenProtectors />} />
                  <Route path="/venda-aparelho" element={<DeviceSale />} />
                  <Route path="/venda-aparelho/:id" element={<DeviceSale />} />
                  <Route path="/vendas" element={<Sales />} />
                  <Route path="/estoque" element={<InventoryControl />} />
                  <Route path="/anotacoes" element={<Notes />} />
                  <Route path="/removedor-virus" element={<VirusRemover />} />
                  <Route path="/caixa" element={<Protected adminOnly><CashWithdrawals /></Protected>} />
                  <Route path="/configuracoes" element={<Protected adminOnly><Settings /></Protected>} />
                  <Route path="/usuarios" element={<Protected adminOnly><Users /></Protected>} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </Suspense>
            </AppShell>
          </Protected>
        } />
      </Routes>
    </Suspense>
    </ErrorBoundary>
  )
}
