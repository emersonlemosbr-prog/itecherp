import Access from '../components/UI/Access'
import MobileRecordCard from '../components/MobileRecordCard'
import React, { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Wrench, ShieldCheck, Wallet, Calendar, Eye, Printer,
  Phone, Mail, MapPin, MessageCircle, Pencil, Plus, ShoppingBag,
  Clock, AlertCircle, CheckCircle2, History, FileText, UserCheck, Smartphone, ExternalLink
} from 'lucide-react'
import api from '../api/client'
import {
  STATUS_LABELS, STATUS_BADGE, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_BADGE,
  formatCurrency, formatDate
} from '../utils/format'
import { onlyDigits } from '../utils/masks'
import CustomerModal from '../components/CustomerModal'
import { useAuth } from '../context/AuthContext'

export default function CustomerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isSuspended } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'orders' | 'sales' | 'warranties' | 'pending' | 'timeline'
  const [showEditModal, setShowEditModal] = useState(false)

  const loadProfile = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/customers/${id}/crm-profile`)
      setData(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível carregar a ficha do cliente.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  function handleOpenWhatsApp(phone) {
    const digits = onlyDigits(phone)
    if (!digits) return
    const formatted = digits.length <= 11 ? `55${digits}` : digits
    window.open(`https://wa.me/${formatted}`, '_blank')
  }

  function handleCreateOS() {
    if (isSuspended) {
      alert('Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.')
      return
    }
    navigate(`/ordens/nova?customerId=${id}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium">Carregando perfil CRM do cliente...</span>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="card p-6 text-center space-y-3 max-w-lg mx-auto mt-8">
        <AlertCircle size={36} className="mx-auto text-rose-500" />
        <h3 className="font-bold text-lg text-slate-900 dark:text-white">Cliente não encontrado</h3>
        <p className="text-sm text-slate-500">{error || 'O cliente solicitado não existe ou foi removido.'}</p>
        <Link to="/clientes" className="btn-secondary inline-flex items-center gap-2">
          <ArrowLeft size={16} /> Voltar para a lista
        </Link>
      </div>
    )
  }

  const { customer, metrics, orders = [], sales = [], warranties = [], credit_accounts = [], timeline = [] } = data

  const openCredits = credit_accounts.filter(c => c.status === 'open')

  return (
    <div className="space-y-5">
      {/* Voltar */}
      <Link to="/clientes" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-amber-500 transition">
        <ArrowLeft size={16} /> Voltar aos clientes
      </Link>

      {/* CABEÇALHO DO PERFIL CRM */}
      <div className="card p-5 sm:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-white/10">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center font-display font-black text-2xl shadow-md shrink-0">
              {customer.first_name?.charAt(0)?.toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="font-display font-black text-xl sm:text-2xl text-slate-900 dark:text-white">
                  {customer.first_name} {customer.last_name}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  Cód. #{customer.id}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Cliente desde {formatDate(customer.created_at)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowEditModal(true)}
              className="btn-secondary !text-xs !py-2 flex items-center gap-1.5"
            >
              <Pencil size={14} /> Editar Cadastro
            </button>
            <button
              type="button"
              onClick={handleCreateOS}
              className="btn-primary !text-xs !py-2 flex items-center gap-1.5"
            >
              <Plus size={15} /> Nova Ordem de Serviço
            </button>
          </div>
        </div>

        {/* Informações Rápidas de Contato e Endereço */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-white/5">
            <Phone size={15} className="text-amber-500 shrink-0" />
            <div className="min-w-0 flex-1 truncate">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Telefone / WhatsApp</span>
              <span className="font-medium text-slate-800 dark:text-zinc-100">{customer.phone || 'Não informado'}</span>
            </div>
            {customer.phone && (
              <button
                type="button"
                onClick={() => handleOpenWhatsApp(customer.phone)}
                className="p-1 rounded text-emerald-600 hover:bg-emerald-500/10"
                title="Conversar no WhatsApp"
              >
                <MessageCircle size={15} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-white/5">
            <Mail size={15} className="text-amber-500 shrink-0" />
            <div className="min-w-0 flex-1 truncate">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">E-mail</span>
              <span className="font-medium text-slate-800 dark:text-zinc-100">{customer.email || 'Não informado'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-white/5">
            <UserCheck size={15} className="text-amber-500 shrink-0" />
            <div className="min-w-0 flex-1 truncate">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">CPF / Documento</span>
              <span className="font-mono font-medium text-slate-800 dark:text-zinc-100">{customer.cpf || 'Não informado'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-white/5">
            <MapPin size={15} className="text-amber-500 shrink-0" />
            <div className="min-w-0 flex-1 truncate">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Cidade / UF</span>
              <span className="font-medium text-slate-800 dark:text-zinc-100">
                {customer.city ? `${customer.city}${customer.state ? ` - ${customer.state}` : ''}` : (customer.address || 'Não informado')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4 CARDS DE INDICADORES CRM */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Ordens de Serviço</span>
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-500"><Wrench size={18} /></span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold font-display text-slate-900 dark:text-white">
              {metrics?.total_orders || 0}
            </span>
            <p className="text-[11px] text-slate-400 mt-0.5">reparos abertos no histórico</p>
          </div>
        </div>

        <div className="card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Compras Realizadas</span>
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-500"><ShoppingBag size={18} /></span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold font-display text-slate-900 dark:text-white">
              {metrics?.total_sales || 0}
            </span>
            <p className="text-[11px] text-slate-400 mt-0.5">vendas de aparelhos</p>
          </div>
        </div>

        <div className="card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Garantias Emitidas</span>
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500"><ShieldCheck size={18} /></span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold font-display text-slate-900 dark:text-white">
              {metrics?.total_warranties || 0}
            </span>
            <p className="text-[11px] text-slate-400 mt-0.5">garantias vinculadas</p>
          </div>
        </div>

        <div className="card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Pendências / Em Aberto</span>
            <span className={`p-2 rounded-xl ${metrics?.total_pending > 0 ? 'bg-rose-500/10 text-rose-500' : 'bg-slate-100 text-slate-400 dark:bg-white/5'}`}>
              <Wallet size={18} />
            </span>
          </div>
          <div className="mt-2">
            <span className={`text-2xl font-bold font-display ${metrics?.total_pending > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
              {formatCurrency(metrics?.total_pending || 0)}
            </span>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {metrics?.total_pending > 0 ? 'possui valores em aberto' : 'nenhum débito pendente'}
            </p>
          </div>
        </div>
      </div>

      {/* ABAS DO CRM */}
      <div className="card overflow-hidden">
        {/* Navegação por Abas */}
        <div className="flex border-b border-slate-200/80 dark:border-white/10 px-4 pt-2 overflow-x-auto gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-3 py-3 font-semibold text-xs border-b-2 transition whitespace-nowrap ${
              activeTab === 'overview'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            <UserCheck size={15} /> Visão Geral
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-2 px-3 py-3 font-semibold text-xs border-b-2 transition whitespace-nowrap ${
              activeTab === 'orders'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            <Wrench size={15} /> Ordens de Serviço ({orders.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sales')}
            className={`flex items-center gap-2 px-3 py-3 font-semibold text-xs border-b-2 transition whitespace-nowrap ${
              activeTab === 'sales'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            <ShoppingBag size={15} /> Compras ({sales.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('warranties')}
            className={`flex items-center gap-2 px-3 py-3 font-semibold text-xs border-b-2 transition whitespace-nowrap ${
              activeTab === 'warranties'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            <ShieldCheck size={15} /> Garantias ({warranties.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`flex items-center gap-2 px-3 py-3 font-semibold text-xs border-b-2 transition whitespace-nowrap ${
              activeTab === 'pending'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            <Wallet size={15} /> Pendências ({openCredits.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('timeline')}
            className={`flex items-center gap-2 px-3 py-3 font-semibold text-xs border-b-2 transition whitespace-nowrap ${
              activeTab === 'timeline'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            <History size={15} /> Linha do Tempo ({timeline.length})
          </button>
        </div>

        {/* CONTEÚDO DAS ABAS */}
        <div className="p-5">
          {/* ABA 1: VISÃO GERAL */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3 p-4 rounded-xl bg-slate-50/60 dark:bg-white/5 border border-slate-200/60 dark:border-white/5">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <UserCheck size={16} className="text-amber-500" /> Resumo do Relacionamento
                  </h4>
                  <div className="text-xs space-y-2">
                    <div className="flex justify-between py-1 border-b border-slate-200/50 dark:border-white/5">
                      <span className="text-slate-400">Valor Total Investido (LTV):</span>
                      <strong className="text-slate-800 dark:text-white font-mono">{formatCurrency(metrics?.total_spent || 0)}</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/50 dark:border-white/5">
                      <span className="text-slate-400">Última Atividade:</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">{formatDate(metrics?.last_visit)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/50 dark:border-white/5">
                      <span className="text-slate-400">Total de Reparos:</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">{metrics?.total_orders || 0} OS</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/50 dark:border-white/5">
                      <span className="text-slate-400">Total de Compras:</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">{metrics?.total_sales || 0} aparelhos</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 p-4 rounded-xl bg-slate-50/60 dark:bg-white/5 border border-slate-200/60 dark:border-white/5">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <MapPin size={16} className="text-amber-500" /> Endereço Completo
                  </h4>
                  <div className="text-xs space-y-1.5 text-slate-600 dark:text-slate-300">
                    <p><strong>Logradouro:</strong> {customer.street || customer.address || '—'} {customer.number ? `, nº ${customer.number}` : ''}</p>
                    {customer.complement && <p><strong>Complemento:</strong> {customer.complement}</p>}
                    {customer.neighborhood && <p><strong>Bairro:</strong> {customer.neighborhood}</p>}
                    <p><strong>Cidade/UF:</strong> {customer.city ? `${customer.city} - ${customer.state}` : '—'}</p>
                    {customer.postal_code && <p><strong>CEP:</strong> {customer.postal_code}</p>}
                  </div>
                </div>
              </div>

              {/* Observações Internas */}
              <div className="p-4 rounded-xl bg-slate-50/60 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 space-y-2">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText size={16} className="text-amber-500" /> Observações Internas
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {customer.notes || 'Nenhuma observação interna cadastrada para este cliente.'}
                </p>
              </div>
            </div>
          )}

          {/* ABA 2: ORDENS DE SERVIÇO */}
          {activeTab === 'orders' && (
            <>
            <div className="md:hidden space-y-3 p-3">
              {orders.map(o => (
                <MobileRecordCard
                  key={o.id}
                  title={`OS #${o.order_number}`}
                  subtitle={`${o.brand || ''} ${o.model || ''}`.trim() || '—'}
                  badge={<span className="text-xs font-bold text-[#FFBE0B]">{formatCurrency(o.service_price)}</span>}
                  fields={[
                    { label: 'Entrada', value: formatDate(o.entry_date) },
                    { label: 'Status', value: o.status },
                    { label: 'Pagamento', value: o.payment_status },
                    ...(o.description ? [{ label: 'Descrição', value: o.description, fullWidth: true }] : []),
                  ]}
                  actions={
                    <Link to={`/ordens/${o.id}`} className="btn-ghost !px-2 !py-1 text-xs">Ver OS</Link>
                  }
                />
              ))}
            </div>
            <div className="table-scroll overflow-x-auto hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-ink-700">
                    <th className="px-4 py-2.5">OS</th>
                    <th className="px-4 py-2.5">Entrada</th>
                    <th className="px-4 py-2.5">Aparelho</th>
                    <th className="px-4 py-2.5">Descrição</th>
                    <th className="px-4 py-2.5">Valor</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Pagamento</th>
                    <th className="px-4 py-2.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} className="border-b border-slate-50 dark:border-ink-700/50 hover:bg-slate-50/60 dark:hover:bg-ink-700/30">
                      <td className="px-4 py-2.5 font-bold text-amber-500">#{o.order_number}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{formatDate(o.entry_date)}</td>
                      <td className="px-4 py-2.5 font-medium">{o.brand} {o.model}</td>
                      <td className="px-4 py-2.5 text-slate-500 truncate max-w-xs">{o.description}</td>
                      <td className="px-4 py-2.5 font-mono">{formatCurrency(o.service_price)}</td>
                      <td className="px-4 py-2.5"><span className={STATUS_BADGE[o.status]}>{STATUS_LABELS[o.status]}</span></td>
                      <td className="px-4 py-2.5"><span className={PAYMENT_STATUS_BADGE[o.payment_status]}>{PAYMENT_STATUS_LABELS[o.payment_status]}</span></td>
                      <td className="px-4 py-2.5 text-right">
                        <Link to={`/ordens/${o.id}`} className="btn-ghost !px-2 !py-1 text-slate-600 dark:text-zinc-300 hover:text-amber-500">
                          <Eye size={15} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {orders.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Nenhuma ordem de serviço registrada.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            </>
          )}

          {/* ABA 3: COMPRAS */}
          {activeTab === 'sales' && (
            <>
            <div className="md:hidden space-y-3 p-3">
              {sales.map(s => (
                <MobileRecordCard
                  key={s.id}
                  title={`Venda #${s.order_number}`}
                  subtitle={formatDate(s.sale_date)}
                  badge={<span className="text-xs font-bold text-emerald-500">{formatCurrency(s.total_amount)}</span>}
                  fields={[
                    { label: 'Vendedor', value: s.seller_name || '—' },
                    { label: 'Pagamento', value: (s.payment_method || '—').toUpperCase() },
                  ]}
                  actions={
                    <Link to={`/venda-aparelho/${s.id}`} className="btn-ghost !px-2 !py-1 text-xs">Ver Venda</Link>
                  }
                />
              ))}
              {sales.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-400">Nenhuma compra de aparelho vinculada.</p>
              )}
            </div>
            <div className="table-scroll overflow-x-auto hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-ink-700">
                    <th className="px-4 py-2.5">Venda #</th>
                    <th className="px-4 py-2.5">Data</th>
                    <th className="px-4 py-2.5">Vendedor</th>
                    <th className="px-4 py-2.5">Valor Total</th>
                    <th className="px-4 py-2.5">Forma de Pagamento</th>
                    <th className="px-4 py-2.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map(s => (
                    <tr key={s.id} className="border-b border-slate-50 dark:border-ink-700/50 hover:bg-slate-50/60 dark:hover:bg-ink-700/30">
                      <td className="px-4 py-2.5 font-bold text-amber-500">#{s.order_number}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{formatDate(s.sale_date)}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{s.seller_name || '—'}</td>
                      <td className="px-4 py-2.5 font-bold font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(s.total_amount)}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs uppercase">{s.payment_method || '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Link to={`/venda-aparelho/${s.id}`} className="btn-ghost !px-2 !py-1 text-slate-600 dark:text-zinc-300 hover:text-amber-500">
                          <Eye size={15} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {sales.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Nenhuma compra de aparelho vinculada.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            </>
          )}

          {/* ABA 4: GARANTIAS */}
          {activeTab === 'warranties' && (
            <>
            <div className="md:hidden space-y-3 p-3">
              {warranties.map(w => {
                const isExpired = w.warranty_end && new Date(w.warranty_end) < new Date()
                return (
                  <MobileRecordCard
                    key={w.id}
                    title={`${w.brand || ''} ${w.model || ''}`.trim() || 'Aparelho'}
                    subtitle={w.order_number ? `OS #${w.order_number}` : 'Sem OS'}
                    badge={
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isExpired
                          ? 'bg-slate-100 text-slate-500 dark:bg-white/10'
                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      }`}>
                        {isExpired ? 'Expirada' : 'Em Garantia'}
                      </span>
                    }
                    fields={[
                      { label: 'Início', value: formatDate(w.warranty_start) },
                      { label: 'Vencimento', value: formatDate(w.warranty_end) },
                      { label: 'Valor Coberto', value: formatCurrency(w.amount_paid), highlight: true },
                    ]}
                  />
                )
              })}
              {warranties.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-400">Nenhuma garantia registrada.</p>
              )}
            </div>
            <div className="table-scroll overflow-x-auto hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-ink-700">
                    <th className="px-4 py-2.5">Aparelho / Produto</th>
                    <th className="px-4 py-2.5">Início</th>
                    <th className="px-4 py-2.5">Vencimento</th>
                    <th className="px-4 py-2.5">OS Vinculada</th>
                    <th className="px-4 py-2.5">Valor Coberto</th>
                    <th className="px-4 py-2.5">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {warranties.map(w => {
                    const isExpired = w.warranty_end && new Date(w.warranty_end) < new Date()
                    return (
                      <tr key={w.id} className="border-b border-slate-50 dark:border-ink-700/50 hover:bg-slate-50/60 dark:hover:bg-ink-700/30">
                        <td className="px-4 py-2.5 font-medium">{w.brand} {w.model}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs">{formatDate(w.warranty_start)}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs font-semibold">{formatDate(w.warranty_end)}</td>
                        <td className="px-4 py-2.5 text-amber-500 font-bold">
                          {w.order_number ? (
                            <Link to={`/ordens/${w.service_order_id}`} className="hover:underline flex items-center gap-1">
                              #{w.order_number} <ExternalLink size={12} />
                            </Link>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono">{formatCurrency(w.amount_paid)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            isExpired
                              ? 'bg-slate-100 text-slate-500 dark:bg-white/10'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          }`}>
                            {isExpired ? 'Expirada' : 'Em Garantia'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  {warranties.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Nenhuma garantia registrada.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            </>
          )}

          {/* ABA 5: PENDÊNCIAS */}
          {activeTab === 'pending' && (
            <>
            <div className="md:hidden space-y-3 p-3">
              {credit_accounts.map(c => (
                <MobileRecordCard
                  key={c.id}
                  title={c.description || 'Fiado / Prazo'}
                  subtitle={formatDate(c.created_at)}
                  badge={
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      c.status === 'open' ? 'bg-amber-500/15 text-amber-500' : 'bg-emerald-500/15 text-emerald-500'
                    }`}>
                      {c.status === 'open' ? 'Em Aberto' : 'Pago'}
                    </span>
                  }
                  fields={[
                    { label: 'OS Vinculada', value: c.order_number ? `#${c.order_number}` : 'Avulso' },
                    { label: 'Valor', value: formatCurrency(c.amount), highlight: true },
                  ]}
                />
              ))}
              {credit_accounts.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-400">Nenhuma pendência registrada.</p>
              )}
            </div>
            <div className="table-scroll overflow-x-auto hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-ink-700">
                    <th className="px-4 py-2.5">Origem / Descrição</th>
                    <th className="px-4 py-2.5">Data Lançamento</th>
                    <th className="px-4 py-2.5">OS Vinculada</th>
                    <th className="px-4 py-2.5">Valor</th>
                    <th className="px-4 py-2.5">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {credit_accounts.map(c => (
                    <tr key={c.id} className="border-b border-slate-50 dark:border-ink-700/50 hover:bg-slate-50/60 dark:hover:bg-ink-700/30">
                      <td className="px-4 py-2.5 font-medium">{c.description || 'Fiado / Prazo'}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{formatDate(c.created_at)}</td>
                      <td className="px-4 py-2.5 text-amber-500 font-bold">
                        {c.order_number ? (
                          <Link to={`/ordens/${c.service_order_id}`} className="hover:underline flex items-center gap-1">
                            #{c.order_number} <ExternalLink size={12} />
                          </Link>
                        ) : 'Avulso'}
                      </td>
                      <td className={`px-4 py-2.5 font-bold font-mono ${c.status === 'open' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}`}>
                        {formatCurrency(c.amount)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          c.status === 'open'
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {c.status === 'open' ? 'Pendente em Aberto' : 'Quitado'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {credit_accounts.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Nenhuma pendência ou fiado registrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            </>
          )}

          {/* ABA 6: LINHA DO TEMPO */}
          {activeTab === 'timeline' && (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-white/10">
              {timeline.map(item => (
                <div key={item.id} className="relative group">
                  <div className={`absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-900 ${
                    item.type === 'service_order' ? 'bg-amber-500' : (item.type === 'sale' ? 'bg-purple-500' : 'bg-rose-500')
                  }`} />
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <strong className="text-sm text-slate-800 dark:text-white">{item.title}</strong>
                      <span className="text-[11px] text-slate-400">{formatDate(item.date)}</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-300">{item.subtitle}</p>
                    {item.amount && (
                      <p className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                        {formatCurrency(item.amount)}
                      </p>
                    )}
                    {item.link && (
                      <div className="pt-1">
                        <Link to={item.link} className="text-xs text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 font-semibold">
                          Acessar registro <ExternalLink size={12} />
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {timeline.length === 0 && (
                <p className="text-sm text-slate-400 py-6 text-center">Nenhum evento registrado no histórico.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Edição */}
      {showEditModal && (
        <CustomerModal
          customer={customer}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            setShowEditModal(false)
            loadProfile()
          }}
        />
      )}
    </div>
  )
}
