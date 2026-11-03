import { confirmRecordDeletion } from '../utils/confirmDeletion'
import ModalFrame from '../components/UI/ModalFrame'
import React, { useEffect, useState, useCallback } from 'react'
import { Search, Check, Plus, X, Trash2 } from 'lucide-react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import CustomerPicker from '../components/UI/CustomerPicker'
import { formatCurrency, formatDate } from '../utils/format'

export default function CreditAccounts() {
  const { isAdmin } = useAuth()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [accounts, setAccounts] = useState([])
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    const { data } = await api.get('/credit-accounts', { params: { q: q || undefined, status: status || undefined } })
    setAccounts(data)
  }, [q, status])

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t) }, [load])

  async function markPaid(id) {
    await api.put(`/credit-accounts/${id}/pay`)
    load()
  }
  async function remove(id) {
    if (!confirmRecordDeletion('Excluir esta conta de fiado?')) return
    await api.delete(`/credit-accounts/${id}`)
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-bold text-xl">Pendentes</h2>
          <p className="text-sm text-slate-400">Contas a receber dos clientes</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> Novo Fiado</button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative w-full sm:flex-1 sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Buscar por cliente ou telefone..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="input sm:max-w-[180px]" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="open">Em Aberto</option>
          <option value="paid">Pago</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabela com rolagem horizontal"><table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-ink-700">
              <th className="px-4 py-2.5">Cliente</th>
              <th className="px-4 py-2.5">OS</th>
              <th className="px-4 py-2.5">Descrição</th>
              <th className="px-4 py-2.5">Valor</th>
              <th className="px-4 py-2.5">Data</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map(a => (
              <tr key={a.id} className="border-b border-slate-50 dark:border-ink-700/50">
                <td className="px-4 py-2.5 font-medium">{a.first_name} {a.last_name}</td>
                <td className="px-4 py-2.5 text-slate-500">{a.order_number || '—'}</td>
                <td className="px-4 py-2.5 text-slate-500">{a.description || '—'}</td>
                <td className="px-4 py-2.5">{formatCurrency(a.amount)}</td>
                <td className="px-4 py-2.5 text-slate-500">{formatDate(a.pickup_date || a.created_at)}</td>
                <td className="px-4 py-2.5">
                  {a.status === 'open' ? <span className="badge-yellow">Em Aberto</span> : <span className="badge-green">Pago</span>}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    {a.status === 'open' && (
                      <button className="btn-ghost !px-1.5 !py-1 text-emerald-600" title="Marcar como pago" onClick={() => markPaid(a.id)}><Check size={15} /></button>
                    )}
                    {isAdmin && <button className="btn-ghost !px-1.5 !py-1 text-rose-600" onClick={() => remove(a.id)}><Trash2 size={15} /></button>}
                  </div>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Nenhum fiado registrado.</td></tr>
            )}
          </tbody>
        </table></div>
      </div>

      {showForm && <CreditFormModal onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function CreditFormModal({ onClose, onSaved }) {
  const [customer, setCustomer] = useState(null)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [pickupDate, setPickupDate] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 640 : false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 640px)')
    const handleChange = (event) => setIsMobile(event.matches)

    setIsMobile(mediaQuery.matches)
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
    mediaQuery.addListener(handleChange)
    return () => mediaQuery.removeListener(handleChange)
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!customer) { setError('Selecione um cliente.'); return }
    setSaving(true)
    try {
      await api.post('/credit-accounts', { customer_id: customer.id, description, amount, pickup_date: pickupDate || null })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  const content = (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <p className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 rounded-lg p-2">{error}</p>}
      <div><label className="label">Cliente</label><CustomerPicker value={customer} onChange={setCustomer} /></div>
      <div><label className="label">Produto ou Serviço</label><input className="input" value={description} onChange={e => setDescription(e.target.value)} /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className="label">Valor (R$)</label><input type="number" step="0.01" required className="input" value={amount} onChange={e => setAmount(e.target.value)} /></div>
        <div><label className="label">Data</label><input type="date" className="input" value={pickupDate} onChange={e => setPickupDate(e.target.value)} /></div>
      </div>
      <div className="form-actions pt-2">
        <button type="button" className="btn-secondary" onClick={() => { if (!saving) onClose() }}>Cancelar</button>
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
      </div>
    </form>
  )

  if (isMobile) {
    return (
      <ModalFrame busy={saving} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-3 flex items-center justify-center" onClick={() => { if (!saving) onClose() }}>
        <div className="mx-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-[22px] border border-white/10 bg-white dark:bg-[#222225] shadow-2xl dark:border-white/10 dark:bg-[#222225]" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 px-4 py-3 dark:border-white/10">
            <h3 className="font-display font-bold text-lg">Novo Fiado</h3>
            <button type="button" onClick={() => { if (!saving) onClose() }} className="btn-ghost !px-2 !py-1.5" aria-label="Fechar modal">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            {content}
          </div>
        </div>
      </ModalFrame>
    )
  }

  return (
    <ModalFrame busy={saving} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { if (!saving) onClose() }}>
      <div className="modal-panel p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-lg">Novo Fiado</h3>
          <button onClick={() => { if (!saving) onClose() }} className="text-slate-400"><X size={20} /></button>
        </div>
        {content}
      </div>
    </ModalFrame>
  )
}
