import { useSettings } from '../context/SettingsContext'
import React, { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Wallet, Clock, TrendingUp, Banknote, HandCoins, Wrench,
  CheckCircle2, PackageCheck, XCircle, Eye, EyeOff, Pencil, Printer,
  ArrowUpRight, ShoppingCart, AlertCircle, RefreshCw, Calendar
} from 'lucide-react'
import { Line, Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Tooltip, Legend, Filler
} from 'chart.js'
import api, { getApiBaseUrl } from '../api/client'
import { useAuth } from '../context/AuthContext'
import {
  STATUS_LABELS, STATUS_BADGE, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_BADGE,
  formatCurrency, formatDate
} from '../utils/format'
import DashboardDetailModal from '../components/Dashboard/DashboardDetailModal'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler)

const toneStyles = {
  blue: 'dashboard-tone-blue',
  green: 'dashboard-tone-green',
  amber: 'dashboard-tone-amber',
  red: 'dashboard-tone-red',
  slate: 'dashboard-tone-slate',
  violet: 'dashboard-tone-violet',
}

export default function Dashboard() {
  const { settings } = useSettings()
  const { isAdmin, user } = useAuth()
  const [valuesVisible, setValuesVisible] = useState(() => {
    try {
      return localStorage.getItem('dashboardValuesVisible') !== 'false'
    } catch {
      return true
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('dashboardValuesVisible', String(valuesVisible))
    } catch {
      // Mantém o botão funcional quando o armazenamento está indisponível.
    }
  }, [valuesVisible])

  const displayCurrency = value => valuesVisible ? formatCurrency(value) : 'R$ ••••••'
  const [stats, setStats] = useState(null)
  const [daily, setDaily] = useState([])
  const [monthly, setMonthly] = useState([])
  const [statusDist, setStatusDist] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedIndicator, setSelectedIndicator] = useState(null)

  // Filtros de período: 'today' | '7d' | 'this_month' | 'last_month' | 'custom'
  const [period, setPeriod] = useState('this_month')
  const [customRange, setCustomRange] = useState({
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
  })
  const [customDraft, setCustomDraft] = useState({
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
  })
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [customError, setCustomError] = useState('')

  // Saudação e Data formatada no fuso de Brasília
  const greetingInfo = useMemo(() => {
    try {
      const now = new Date()
      const hourStr = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }).format(now)
      const hour = Number(hourStr)
      const greeting = hour >= 5 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite'

      const dateStr = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      }).format(now)
      const capitalizedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1)
      const displayName = user?.full_name?.trim() || user?.username || 'usuário'

      return {
        line1: `${capitalizedDate} - ${greeting}, ${displayName}`,
      }
    } catch {
      return {
        line1: `Hoje - Olá, ${user?.full_name || 'usuário'}`,
      }
    }
  }, [user])

  const periodParams = useMemo(() => {
    if (period === 'custom') {
      return { period: 'custom', startDate: customRange.startDate, endDate: customRange.endDate }
    }
    return { period }
  }, [period, customRange])

  async function loadDashboardData() {
    setLoading(true)
    setError(null)
    try {
      const params = periodParams
      const ordersPromise = (user?.role === 'admin' || user?.permissions?.orders)
        ? api.get('/service-orders').catch(err => {
            console.warn('Não foi possível carregar ordens de serviço no painel:', err)
            return { data: [] }
          })
        : Promise.resolve({ data: [] })

      const [statsRes, dailyRes, monthlyRes, statusRes, ordersRes] = await Promise.all([
        api.get('/dashboard/stats', { params }),
        api.get('/dashboard/charts/daily-revenue', { params }),
        api.get('/dashboard/charts/monthly-revenue', { params }),
        api.get('/dashboard/charts/status-distribution', { params }),
        ordersPromise,
      ])

      setStats(statsRes.data)
      setDaily(dailyRes.data)
      setMonthly(monthlyRes.data)
      setStatusDist(statusRes.data)
      setOrders(ordersRes.data.slice(0, 15))
    } catch (err) {
      console.error('Erro ao carregar dados do painel:', err)
      setError(err?.response?.data?.message || err.message || 'Falha ao carregar informações do painel.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboardData()
  }, [periodParams])

  useEffect(() => {
    loadDashboardData()

    if (!settings.system.dashboard_refresh) return
    const token = localStorage.getItem('itech_token')
    if (!token) return undefined

    const base = getApiBaseUrl()
    const eventSource = new EventSource(`${base}/api/events/dashboard?token=${encodeURIComponent(token)}`)

    const refreshHandler = () => {
      loadDashboardData().catch(() => {
        // Evita quebrar a tela em caso de falha transitória de rede.
      })
    }

    eventSource.addEventListener('dashboard-refresh', refreshHandler)

    return () => {
      eventSource.removeEventListener('dashboard-refresh', refreshHandler)
      eventSource.close()
    }
  }, [])

  if (loading && !stats) {
    return (
      <div className="card p-8 flex flex-col items-center justify-center gap-3 text-center">
        <RefreshCw size={24} className="animate-spin text-[var(--accent-blue)]" />
        <p className="text-slate-400 text-sm">Carregando painel...</p>
      </div>
    )
  }

  if (error && !stats) {
    return (
      <div className="card p-8 flex flex-col items-center justify-center gap-4 text-center max-w-lg mx-auto mt-8 border border-red-500/20">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-400">
          <AlertCircle size={24} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-[var(--text-main)]">Não foi possível carregar o painel</h3>
          <p className="text-sm text-slate-400 mt-1">{error}</p>
        </div>
        <button
          type="button"
          onClick={() => loadDashboardData()}
          className="btn-primary inline-flex items-center gap-2"
        >
          <RefreshCw size={16} />
          Tentar novamente
        </button>
      </div>
    )
  }

  if (!stats) return null

  const lineData = {
    labels: daily.map(d => formatDate(d.day)),
    datasets: [{
      label: 'Receita diária',
      data: daily.map(d => d.revenue),
      borderColor: '#4F7DFF',
      backgroundColor: 'rgba(79,125,255,0.16)',
      fill: true,
      tension: 0.35,
      pointRadius: 3,
      pointBackgroundColor: '#4F7DFF',
      pointHoverRadius: 5,
    }]
  }

  const barData = {
    labels: monthly.map(m => m.month),
    datasets: [
      { label: 'Receita', data: monthly.map(m => m.revenue), backgroundColor: '#4F7DFF', borderRadius: 10 },
      { label: 'Lucro', data: monthly.map(m => m.profit), backgroundColor: '#32D583', borderRadius: 10 },
    ]
  }

  const statusColors = {
    received: '#4F7DFF', diagnosis: '#8B5CF6', waiting_parts: '#FBBF24',
    repairing: '#22D3EE', ready: '#32D583', delivered: '#A1A1AA', not_performed: '#EF4444'
  }
  const doughnutData = {
    labels: statusDist.map(s => STATUS_LABELS[s.status] || s.status),
    datasets: [{
      data: statusDist.map(s => s.count),
      backgroundColor: statusDist.map(s => statusColors[s.status] || '#94a3b8'),
      borderWidth: 0,
    }]
  }

  const chartOpts = {
    plugins: {
      legend: { display: false, labels: { color: '#d4d4d8' } },
      tooltip: {
        backgroundColor: 'rgba(35,35,35,0.96)',
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        titleColor: '#ffffff',
        bodyColor: '#d4d4d8',
        callbacks: {
          label: context => `${context.dataset.label}: ${displayCurrency(context.parsed.y)}`,
        },
      },
    },
    maintainAspectRatio: false,
    scales: {
      x: { ticks: { color: '#a1a1aa' }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: '#a1a1aa', callback: value => valuesVisible ? value : 'R$ ••••••' }, grid: { color: 'rgba(255,255,255,0.04)' } },
    },
  }

  const compactStats = [
    { id: 'repairs-in-progress', label: 'Em andamento', value: stats.repairs_in_progress, icon: Wrench, tone: 'blue' },
    { id: 'repairs-ready', label: 'Prontos', value: stats.repairs_ready, icon: PackageCheck, tone: 'green' },
    { id: 'repairs-completed', label: 'Concluídos', value: stats.repairs_completed, icon: CheckCircle2, tone: 'slate' },
    { id: 'repairs-not-performed', label: 'Não realizados', value: stats.repairs_not_performed, icon: XCircle, tone: 'red' },
    { id: 'sales', label: 'Vendas', value: stats.sales_count, icon: ShoppingCart, tone: 'violet' },
    { id: 'products', label: 'Produtos', value: stats.products_sold, icon: PackageCheck, tone: 'blue' },
    { id: 'sales', label: 'Ticket médio', value: displayCurrency(stats.sales_avg_ticket), icon: TrendingUp, tone: 'green' },
  ]

  const filterOptions = [
    { id: 'today', label: 'Hoje' },
    { id: '7d', label: '7 dias' },
    { id: 'this_month', label: 'Este mês' },
    { id: 'last_month', label: 'Mês passado' },
    { id: 'custom', label: 'Personalizado' },
  ]

  function handleFilterClick(id) {
    if (id === 'custom') {
      setCustomDraft(customRange)
      setCustomError('')
      setShowCustomModal(true)
      return
    }
    setPeriod(id)
  }

  function handleApplyCustom(e) {
    e.preventDefault()
    setCustomError('')
    const { startDate, endDate } = customDraft
    if (!startDate || !endDate) {
      setCustomError('Preencha a data inicial e a data final.')
      return
    }
    if (startDate > endDate) {
      setCustomError('A data inicial não pode ser posterior à data final.')
      return
    }
    setCustomRange({ startDate, endDate })
    setPeriod('custom')
    setShowCustomModal(false)
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho do Dashboard com Saudação Dinâmica e Filtros de Período */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pt-1 pb-2">
        <div className="space-y-1 min-w-0">
          <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-zinc-400">
            {greetingInfo.line1}
          </p>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
            Como está a <span className="text-[var(--brand-primary)]">{settings?.store?.name || 'sua loja'}</span> hoje
          </h2>
        </div>

        {/* Grupo de Filtros e Ações à Direita */}
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-end shrink-0">
          <div className="inline-flex p-1 rounded-2xl bg-slate-100 dark:bg-[#202023] border border-slate-200 dark:border-white/10 shadow-sm max-w-full overflow-x-auto [scrollbar-width:none]">
            {filterOptions.map(opt => {
              const isActive = period === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleFilterClick(opt.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                    isActive
                      ? 'bg-white dark:bg-[#2c2c30] text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200/60 dark:ring-white/10'
                      : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-200/50 dark:hover:bg-white/5'
                  }`}
                >
                  {opt.label}
                  {opt.id === 'custom' && period === 'custom' && customRange.startDate && (
                    <span className="ml-1 text-[10px] font-normal opacity-75">
                      ({customRange.startDate.slice(5).replace('-', '/')} - {customRange.endDate.slice(5).replace('-', '/')})
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              className="btn-ghost !p-2 text-slate-600 dark:text-zinc-400"
              onClick={() => setValuesVisible(visible => !visible)}
              title={valuesVisible ? 'Ocultar valores' : 'Mostrar valores'}
              aria-label={valuesVisible ? 'Ocultar valores' : 'Mostrar valores'}
              aria-pressed={!valuesVisible}
            >
              {valuesVisible ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}
            </button>
            <Link to="/historico-financeiro" className="btn-secondary !py-1.5 !px-3 text-xs">
              Histórico
            </Link>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500/10 text-blue-500 text-xs font-semibold animate-pulse">
          <RefreshCw size={14} className="animate-spin" />
          <span>Atualizando indicadores do período...</span>
        </div>
      )}

      {/* Modal de Intervalo Personalizado */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-md space-y-4 bg-white dark:bg-[#1f1f22] border border-slate-200 dark:border-white/10 shadow-2xl rounded-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-[var(--brand-primary)]" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">Período Personalizado</h3>
              </div>
              <button
                type="button"
                className="btn-ghost !p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                onClick={() => setShowCustomModal(false)}
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Selecione o intervalo de datas para consolidar os indicadores da loja.
            </p>

            {customError && (
              <p className="text-xs text-rose-500 font-semibold bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                {customError}
              </p>
            )}

            <form onSubmit={handleApplyCustom} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="label text-xs">Data inicial (De)</span>
                  <input
                    type="date"
                    required
                    className="input text-xs"
                    value={customDraft.startDate}
                    onChange={e => setCustomDraft(d => ({ ...d, startDate: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="label text-xs">Data final (Até)</span>
                  <input
                    type="date"
                    required
                    className="input text-xs"
                    value={customDraft.endDate}
                    onChange={e => setCustomDraft(d => ({ ...d, endDate: e.target.value }))}
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  onClick={() => setShowCustomModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary text-xs"
                >
                  Aplicar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr_1fr]">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSelectedIndicator('revenue')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedIndicator('revenue'); } }}
          className="dashboard-feature-card dashboard-clickable"
          title="Clique para ver todas as entradas financeiras que compõem a receita"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="dashboard-label">Receita total</p>
                <span className="dashboard-interactive-hint">Ver detalhes <ArrowUpRight size={12} /></span>
              </div>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-[var(--text-main)] sm:text-4xl">
                {displayCurrency(stats.total_revenue)}
              </h2>
            </div>
            <div className="dashboard-mini-pill dashboard-tone-green">
              <ArrowUpRight size={14} />
              <span>Lucro {displayCurrency(isAdmin ? stats.total_profit : stats.sales_profit)}</span>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="dashboard-metric-sub">
              <span className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">Faturamento do dia</span>
              <strong className="mt-2 block text-xl font-bold text-[var(--text-main)]">{displayCurrency(stats.sales_day_revenue)}</strong>
            </div>
            <div className="dashboard-metric-sub">
              <span className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">Vendas do mês</span>
              <strong className="mt-2 block text-xl font-bold text-[var(--text-main)]">{displayCurrency(stats.sales_month_revenue)}</strong>
            </div>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setSelectedIndicator('pending-revenue')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedIndicator('pending-revenue'); } }}
          className="dashboard-mini-card dashboard-clickable"
          title="Clique para ver os valores que ainda precisam ser recebidos"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="dashboard-label">Receita pendente</span>
            <span className="dashboard-icon dashboard-tone-amber"><Clock size={18} /></span>
          </div>
          <div>
            <strong className="text-2xl font-bold text-[var(--text-main)]">{displayCurrency(stats.pending_revenue)}</strong>
            <p className="text-xs text-[var(--text-muted)] mt-1">Valores ainda não quitados</p>
          </div>
          <span className="dashboard-interactive-hint">Ver registros pendentes <ArrowUpRight size={12} /></span>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setSelectedIndicator('open-credits')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedIndicator('open-credits'); } }}
          className="dashboard-mini-card dashboard-clickable"
          title="Clique para ver as pendências e saldos de clientes com prazo"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="dashboard-label">Pendentes em aberto</span>
            <span className="dashboard-icon dashboard-tone-red"><HandCoins size={18} /></span>
          </div>
          <div>
            <strong className="text-2xl font-bold text-[var(--text-main)]">{displayCurrency(stats.credit_accounts_open)}</strong>
            <p className="text-xs text-[var(--text-muted)] mt-1">Saldo de clientes com prazo</p>
          </div>
          <span className="dashboard-interactive-hint">Ver pendentes em aberto <ArrowUpRight size={12} /></span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {compactStats.map(({ id, label, value, icon: Icon, tone }) => (
          <div
            key={label}
            role="button"
            tabIndex={0}
            onClick={() => id && setSelectedIndicator(id)}
            onKeyDown={(e) => { if (id && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSelectedIndicator(id); } }}
            className={`dashboard-compact-card ${id ? 'dashboard-clickable' : ''}`}
            title={id ? `Clique para detalhar os registros de ${label}` : undefined}
          >
            <div className="flex items-center justify-between gap-3">
              <span className={`dashboard-icon ${toneStyles[tone]}`}><Icon size={16} /></span>
              <strong className="text-base font-bold text-[var(--text-main)]">{value}</strong>
            </div>
            <div className="mt-3 flex items-center justify-between gap-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</p>
              {id && <ArrowUpRight size={12} className="text-[var(--text-muted)] opacity-60" />}
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <p className="font-semibold text-sm text-[var(--text-main)] mb-3">Receita Diária (últimos 14 dias)</p>
          <div className="h-56"><Line data={lineData} options={chartOpts} /></div>
        </div>
        <div className="card p-5">
          <p className="font-semibold text-sm text-[var(--text-main)] mb-3">Status dos Reparos</p>
          <div className="h-56"><Doughnut data={doughnutData} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, color: '#d4d4d8', font: { size: 10 } } } } }} /></div>
        </div>
      </div>

      <div className="card p-5">
        <p className="font-semibold text-sm text-[var(--text-main)] mb-3">Resumo do Mês Atual</p>
        <div className="h-64"><Bar data={barData} options={{ ...chartOpts, plugins: { ...chartOpts.plugins, legend: { display: true, position: 'bottom', labels: { color: '#d4d4d8' } } } }} /></div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-soft)]">
          <p className="font-semibold text-sm text-[var(--text-main)]">Ordens de Serviço Recentes</p>
          <Link to="/ordens" className="text-sm text-[var(--accent-blue)] font-medium hover:text-[var(--accent-purple)]">Ver todas</Link>
        </div>
        <div className="table-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase border-b border-[var(--border-soft)]">
                <th className="px-4 py-2.5">OS</th>
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5">Aparelho</th>
                <th className="px-4 py-2.5">Total</th>
                <th className="px-4 py-2.5">Pagamento</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Entrada</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} className="border-b border-white/5 hover:bg-white/[0.045] dark:hover:bg-white/[0.04]">
                  <td className="px-4 py-2.5 font-medium">{o.order_number}</td>
                  <td className="px-4 py-2.5">{o.first_name} {o.last_name}</td>
                  <td className="px-4 py-2.5 text-[var(--text-muted)]">{o.brand} {o.model}</td>
                  <td className="px-4 py-2.5">{displayCurrency(o.service_price)}</td>
                  <td className="px-4 py-2.5"><span className={PAYMENT_STATUS_BADGE[o.payment_status]}>{PAYMENT_STATUS_LABELS[o.payment_status]}</span></td>
                  <td className="px-4 py-2.5"><span className={STATUS_BADGE[o.status]}>{STATUS_LABELS[o.status]}</span></td>
                  <td className="px-4 py-2.5 text-[var(--text-muted)]">{formatDate(o.entry_date)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <Link to={`/ordens/${o.id}`} className="btn-ghost !px-1.5 !py-1"><Eye size={15} /></Link>
                      <Link to={`/ordens/${o.id}/editar`} className="btn-ghost !px-1.5 !py-1"><Pencil size={15} /></Link>
                      <Link to={`/ordens/${o.id}/imprimir`} className="btn-ghost !px-1.5 !py-1"><Printer size={15} /></Link>
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-[var(--text-muted)]">Nenhuma ordem de serviço ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedIndicator && (
        <DashboardDetailModal
          indicator={selectedIndicator}
          onClose={() => setSelectedIndicator(null)}
          isAdmin={isAdmin}
          valuesVisible={valuesVisible}
          periodParams={periodParams}
          onRecordDeleted={() => {
            loadDashboardData()
          }}
        />
      )}
    </div>
  )
}
