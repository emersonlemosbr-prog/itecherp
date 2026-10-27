import { useSettings } from '../context/SettingsContext'
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Wallet, Clock, TrendingUp, Banknote, HandCoins, Wrench,
  CheckCircle2, PackageCheck, XCircle, Eye, EyeOff, Pencil, Printer,
  ArrowUpRight, ShoppingCart
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
  const { isAdmin } = useAuth()
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

  async function loadDashboardData() {
    const [statsRes, dailyRes, monthlyRes, statusRes, ordersRes] = await Promise.all([
      api.get('/dashboard/stats'),
      api.get('/dashboard/charts/daily-revenue'),
      api.get('/dashboard/charts/monthly-revenue'),
      api.get('/dashboard/charts/status-distribution'),
      api.get('/service-orders'),
    ])

    setStats(statsRes.data)
    setDaily(dailyRes.data)
    setMonthly(monthlyRes.data)
    setStatusDist(statusRes.data)
    setOrders(ordersRes.data.slice(0, 15))
  }

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

  if (!stats) return <div className="text-slate-400 text-sm">Carregando painel...</div>

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
    { label: 'Em andamento', value: stats.repairs_in_progress, icon: Wrench, tone: 'blue' },
    { label: 'Prontos', value: stats.repairs_ready, icon: PackageCheck, tone: 'green' },
    { label: 'Concluídos', value: stats.repairs_completed, icon: CheckCircle2, tone: 'slate' },
    { label: 'Não realizados', value: stats.repairs_not_performed, icon: XCircle, tone: 'red' },
    { label: 'Vendas', value: stats.sales_count, icon: ShoppingCart, tone: 'violet' },
    { label: 'Produtos', value: stats.products_sold, icon: PackageCheck, tone: 'blue' },
    { label: 'Ticket médio', value: displayCurrency(stats.sales_avg_ticket), icon: TrendingUp, tone: 'green' },
  ]

  return (
    <div className="space-y-6">
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--text-muted)]">A dashboard exibe somente os indicadores do mês atual.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-ghost !p-3 shrink-0"
            onClick={() => setValuesVisible(visible => !visible)}
            title={valuesVisible ? 'Ocultar valores' : 'Mostrar valores'}
            aria-label={valuesVisible ? 'Ocultar valores' : 'Mostrar valores'}
            aria-pressed={!valuesVisible}
          >
            {valuesVisible ? <Eye size={20} aria-hidden="true" /> : <EyeOff size={20} aria-hidden="true" />}
          </button>
          <Link to="/historico-financeiro" className="btn-secondary">Ver Histórico Financeiro</Link>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr_1fr]">
        <div className="dashboard-feature-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="dashboard-label">Receita total</p>
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

        <div className="dashboard-mini-card">
          <div className="flex items-center justify-between gap-3">
            <span className="dashboard-label">Receita pendente</span>
            <span className="dashboard-icon dashboard-tone-amber"><Clock size={18} /></span>
          </div>
          <strong className="text-2xl font-bold text-[var(--text-main)]">{displayCurrency(stats.pending_revenue)}</strong>
          <p className="text-xs text-[var(--text-muted)]">Valores ainda não quitados</p>
        </div>

        <div className="dashboard-mini-card">
          <div className="flex items-center justify-between gap-3">
            <span className="dashboard-label">Fiados em aberto</span>
            <span className="dashboard-icon dashboard-tone-red"><HandCoins size={18} /></span>
          </div>
          <strong className="text-2xl font-bold text-[var(--text-main)]">{displayCurrency(stats.credit_accounts_open)}</strong>
          <p className="text-xs text-[var(--text-muted)]">Saldo de clientes com prazo</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        {compactStats.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="dashboard-compact-card">
            <div className="flex items-center justify-between gap-3">
              <span className={`dashboard-icon ${toneStyles[tone]}`}><Icon size={16} /></span>
              <strong className="text-base font-bold text-[var(--text-main)]">{value}</strong>
            </div>
            <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</p>
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
    </div>
  )
}
