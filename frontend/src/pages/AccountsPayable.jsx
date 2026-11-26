import React, { useEffect, useState } from 'react'
import {
  ReceiptText, Plus, Search, CheckCircle2, AlertCircle, Clock, DollarSign, X, Ban
} from 'lucide-react'
import api from '../api/client'
const formatMoney = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const todayDate = () => new Date().toISOString().slice(0, 10)

const FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'open', label: 'Em aberto' },
  { key: 'overdue', label: 'Vencidas' },
  { key: 'due_today', label: 'Vencimento hoje' },
  { key: 'due_7d', label: 'Próximos 7 dias' },
  { key: 'due_30d', label: 'Próximos 30 dias' },
  { key: 'paid', label: 'Pagas' },
]

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'debit_card', label: 'Cartão de Débito' },
  { value: 'credit_card', label: 'Cartão de Crédito' },
  { value: 'transfer', label: 'Transferência Bancária' },
]

export default function AccountsPayable() {
  const [dashboard, setDashboard] = useState({ open_total: 0, overdue_total: 0, due_soon_total: 0, paid_this_month: 0 })
  const [items, setItems] = useState([])
  const [payments, setPayments] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('list') // 'list' | 'payments'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Modal nova conta manual
  const [newOpen, setNewOpen] = useState(false)
  const [newForm, setNewForm] = useState({ description: '', supplier_id: '', category: 'Despesa operacional', amount: '', due_date: todayDate(), notes: '' })

  // Modal pagamento
  const [payModal, setPayModal] = useState(null)
  const [payForm, setPayForm] = useState({ amount: '', payment_date: todayDate(), payment_method: 'pix', notes: '' })
  const [payIdempotencyKey, setPayIdempotencyKey] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function loadAll() {
    setLoading(true)
    try {
      const [dashRes, listRes, payRes, supRes] = await Promise.all([
        api.get('/payables/dashboard'),
        api.get('/payables', { params: { filter, q: q || undefined } }),
        api.get('/payables/payments'),
        api.get('/inventory/suppliers'),
      ])
      setDashboard(dashRes.data || {})
      setItems(listRes.data || [])
      setPayments(payRes.data || [])
      setSuppliers(supRes.data || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao carregar contas a pagar.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => { loadAll() }, 200)
    return () => clearTimeout(t)
  }, [filter, q])

  async function handleCreateManual(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      await api.post('/payables', {
        ...newForm,
        supplier_id: newForm.supplier_id ? Number(newForm.supplier_id) : null,
        amount: Number(newForm.amount),
      })
      setSuccess('Conta a pagar cadastrada com sucesso.')
      setNewOpen(false)
      setNewForm({ description: '', supplier_id: '', category: 'Despesa operacional', amount: '', due_date: todayDate(), notes: '' })
      loadAll()
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao cadastrar conta.')
    }
  }

  function openPayModal(item) {
    setPayModal(item)
    setPayForm({
      amount: String(item.remaining_amount ?? item.amount),
      payment_date: todayDate(),
      payment_method: 'pix',
      notes: '',
    })
    setPayIdempotencyKey(`pay-${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
  }

  async function handleConfirmPay(e) {
    e.preventDefault()
    if (!payModal) return
    setError('')
    setSuccess('')
    setSubmitting(true)
    try {
      await api.post(`/payables/installments/${payModal.id}/pay`, {
        amount: Number(payForm.amount),
        payment_date: payForm.payment_date,
        payment_method: payForm.payment_method,
        notes: payForm.notes || null,
        idempotency_key: payIdempotencyKey,
      })
      setSuccess('Pagamento registrado e lançado em Retiradas de Caixa.')
      setPayModal(null)
      loadAll()
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao registrar pagamento.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancelPayable(payableId) {
    if (!window.confirm('Deseja cancelar esta conta a pagar?')) return
    setError('')
    try {
      await api.post(`/payables/${payableId}/cancel`)
      setSuccess('Conta cancelada com sucesso.')
      loadAll()
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao cancelar conta.')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ReceiptText className="text-[#FFBE0B]" size={22} />
            Contas a Pagar
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Controle de parcelas de compras, despesas manuais e baixas integradas às Retiradas de Caixa.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 self-start"
        >
          <Plus size={16} /> Nova despesa
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle size={16} /> <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
          <CheckCircle2 size={16} /> <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="text-[11px] uppercase tracking-wider text-zinc-400">Total em aberto</p>
          <p className="text-xl font-bold text-[#FFBE0B] mt-1">{formatMoney(dashboard.open_total)}</p>
        </div>
        <div className="card p-4 border-rose-500/20">
          <p className="text-[11px] uppercase tracking-wider text-zinc-400">Total vencido</p>
          <p className="text-xl font-bold text-rose-400 mt-1">{formatMoney(dashboard.overdue_total)}</p>
        </div>
        <div className="card p-4 border-amber-500/20">
          <p className="text-[11px] uppercase tracking-wider text-zinc-400">Vencimento próximo (7d)</p>
          <p className="text-xl font-bold text-amber-400 mt-1">{formatMoney(dashboard.due_soon_total)}</p>
        </div>
        <div className="card p-4 border-emerald-500/20">
          <p className="text-[11px] uppercase tracking-wider text-zinc-400">Total pago no mês</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{formatMoney(dashboard.paid_this_month)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setTab('list')}
            className={`px-3 py-1.5 rounded-xl font-bold ${tab === 'list' ? 'bg-[#FFBE0B] text-slate-950' : 'bg-white/5 text-zinc-300'}`}
          >
            Parcelas e Contas
          </button>
          <button
            type="button"
            onClick={() => setTab('payments')}
            className={`px-3 py-1.5 rounded-xl font-bold ${tab === 'payments' ? 'bg-[#FFBE0B] text-slate-950' : 'bg-white/5 text-zinc-300'}`}
          >
            Histórico de Pagamentos
          </button>
        </div>
      </div>

      {tab === 'list' ? (
        <>
          <div className="card p-3 space-y-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9 w-full text-xs"
                placeholder="Buscar por descrição, fornecedor ou número da compra..."
                value={q}
                onChange={e => setQ(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`px-2.5 py-1 rounded-lg font-semibold ${filter === f.key ? 'bg-[#FFBE0B]/20 text-[#FFBE0B] border border-[#FFBE0B]/40' : 'bg-white/5 text-zinc-400'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 text-zinc-400 uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Descrição</th>
                    <th className="px-4 py-3">Fornecedor</th>
                    <th className="px-4 py-3">Origem</th>
                    <th className="px-4 py-3">Parcela</th>
                    <th className="px-4 py-3">Vencimento</th>
                    <th className="px-4 py-3">Pagamento</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3">Situação</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loading ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-zinc-400">Carregando...</td></tr>
                  ) : items.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-zinc-400">Nenhuma conta encontrada.</td></tr>
                  ) : items.map(it => (
                    <tr key={it.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-semibold text-white">{it.description}</td>
                      <td className="px-4 py-3 text-zinc-300">{it.supplier_name || '-'}</td>
                      <td className="px-4 py-3 text-zinc-400">{it.purchase_number || 'Manual'}</td>
                      <td className="px-4 py-3 text-zinc-300">{it.installment_number}/{it.total_installments}</td>
                      <td className={`px-4 py-3 font-medium ${it.is_overdue ? 'text-rose-400' : 'text-zinc-300'}`}>
                        {String(it.due_date).slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{it.paid_at ? String(it.paid_at).slice(0, 10) : '-'}</td>
                      <td className="px-4 py-3 text-right font-bold text-white">
                        {formatMoney(it.status === 'paid' ? it.amount : it.remaining_amount)}
                      </td>
                      <td className="px-4 py-3">
                        {it.status === 'paid' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400">Paga</span>
                        ) : it.status === 'canceled' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-500/15 text-zinc-400">Cancelada</span>
                        ) : it.is_overdue ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400">Vencida</span>
                        ) : it.status === 'partial' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400">Parcial</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-[#FFBE0B]">Em aberto</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {(it.status === 'open' || it.status === 'partial') && (
                            <button
                              type="button"
                              onClick={() => openPayModal(it)}
                              className="px-2.5 py-1 rounded-lg bg-[#FFBE0B] text-slate-950 font-bold text-[11px]"
                            >
                              Pagar
                            </button>
                          )}
                          {it.origin_type === 'manual' && it.status === 'open' && Number(it.paid_amount || 0) === 0 && (
                            <button
                              type="button"
                              onClick={() => handleCancelPayable(it.payable_id)}
                              className="p-1 rounded-lg text-rose-400 hover:bg-rose-500/10"
                              title="Cancelar conta"
                            >
                              <Ban size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/5 text-zinc-400 uppercase text-[10px]">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Fornecedor</th>
                  <th className="px-4 py-3">Parcela</th>
                  <th className="px-4 py-3">Forma</th>
                  <th className="px-4 py-3 text-right">Valor Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {payments.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-400">Nenhum pagamento registrado.</td></tr>
                ) : payments.map(p => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 text-zinc-300">{String(p.payment_date).slice(0, 10)}</td>
                    <td className="px-4 py-3 font-semibold text-white">{p.description}</td>
                    <td className="px-4 py-3 text-zinc-400">{p.supplier_name || '-'}</td>
                    <td className="px-4 py-3 text-zinc-400">{p.installment_number}/{p.total_installments}</td>
                    <td className="px-4 py-3 text-zinc-300">{p.payment_method}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-400">{formatMoney(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Nova Despesa Manual */}
      {newOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form onSubmit={handleCreateManual} className="card w-full max-w-md p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Nova Conta a Pagar</h3>
              <button type="button" onClick={() => setNewOpen(false)} className="text-zinc-400 hover:text-white"><X size={18} /></button>
            </div>
            <input className="input w-full" placeholder="Descrição *" value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))} required />
            <select className="input w-full" value={newForm.supplier_id} onChange={e => setNewForm(f => ({ ...f, supplier_id: e.target.value }))}>
              <option value="">Fornecedor (opcional)</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input className="input w-full" placeholder="Categoria" value={newForm.category} onChange={e => setNewForm(f => ({ ...f, category: e.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" step="0.01" min="0.01" className="input" placeholder="Valor *" value={newForm.amount} onChange={e => setNewForm(f => ({ ...f, amount: e.target.value }))} required />
              <input type="date" className="input" value={newForm.due_date} onChange={e => setNewForm(f => ({ ...f, due_date: e.target.value }))} required />
            </div>
            <input className="input w-full" placeholder="Observações" value={newForm.notes} onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setNewOpen(false)} className="px-3 py-1.5 rounded-lg bg-white/5 text-zinc-300">Cancelar</button>
              <button type="submit" className="btn-primary px-4 py-1.5 rounded-lg font-bold">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Pagamento de Parcela */}
      {payModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form onSubmit={handleConfirmPay} className="card w-full max-w-md p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <DollarSign size={16} className="text-[#FFBE0B]" /> Registrar Pagamento
              </h3>
              <button type="button" onClick={() => setPayModal(null)} className="text-zinc-400 hover:text-white"><X size={18} /></button>
            </div>
            <p className="text-zinc-300">
              {payModal.description} — Parcela {payModal.installment_number}/{payModal.total_installments}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-zinc-400 mb-1">Valor a pagar (R$)</label>
                <input type="number" step="0.01" min="0.01" max={payModal.remaining_amount} className="input w-full" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">Data do pagamento</label>
                <input type="date" className="input w-full" value={payForm.payment_date} onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))} required />
              </div>
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">Forma de pagamento</label>
              <select className="input w-full" value={payForm.payment_method} onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}>
                {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <input className="input w-full" placeholder="Observações (opcional)" value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setPayModal(null)} className="px-3 py-1.5 rounded-lg bg-white/5 text-zinc-300">Cancelar</button>
              <button type="submit" disabled={submitting} className="btn-primary px-4 py-1.5 rounded-lg font-bold disabled:opacity-50">
                {submitting ? 'Registrando...' : 'Confirmar Pagamento'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
