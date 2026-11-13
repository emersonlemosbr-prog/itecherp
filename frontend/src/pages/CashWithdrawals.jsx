import { confirmRecordDeletion } from '../utils/confirmDeletion'
import ModalFrame from '../components/UI/ModalFrame'
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, X, Trash2 } from 'lucide-react'
import api from '../api/client'
import { formatCurrency, formatDate } from '../utils/format'
import { useAuth } from '../context/AuthContext'

export default function CashWithdrawals() {
  const { isSuspended } = useAuth()
  const [items, setItems] = useState([])
  const [showForm, setShowForm] = useState(false)

  const load = () => api.get('/cash-withdrawals').then(r => setItems(r.data))
  useEffect(() => { load() }, [])

  async function remove(id) {
    if (isSuspended) {
      alert('Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.')
      return
    }
    if (!confirmRecordDeletion('Excluir esta retirada de caixa?')) return
    await api.delete(`/cash-withdrawals/${id}`)
    load()
  }

  const total = items.reduce((s, i) => s + i.amount, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-bold text-xl">Retiradas de Caixa</h2>
          <p className="text-sm text-slate-400">Total retirado: <span className="font-semibold text-rose-600">{formatCurrency(total)}</span></p>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            if (isSuspended) {
              alert('Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.')
              return
            }
            setShowForm(true)
          }}
          disabled={isSuspended}
          title={isSuspended ? 'Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.' : ''}
        >
          <Plus size={16} /> Nova Retirada
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabela com rolagem horizontal"><table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-ink-700">
              <th className="px-4 py-2.5">Data</th>
              <th className="px-4 py-2.5">Descrição</th>
              <th className="px-4 py-2.5">Fornecedor</th>
              <th className="px-4 py-2.5">Valor</th>
              <th className="px-4 py-2.5">Origem / OS</th>
              <th className="px-4 py-2.5">Observações</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {items.map(w => (
              <tr key={w.id} className="border-b border-slate-50 dark:border-ink-700/50">
                <td className="px-4 py-2.5 text-slate-500">{formatDate(w.withdrawal_date)}</td>
                <td className="px-4 py-2.5 font-medium">{w.reason}</td>
                <td className="px-4 py-2.5">{w.supplier_name || '—'}</td>
                <td className="px-4 py-2.5 text-rose-600 font-medium">{formatCurrency(w.amount)}</td>
                <td className="px-4 py-2.5">
                  {w.source_type === 'service_order_part' ? <div className="flex flex-col gap-1">
                    <span className="text-xs text-slate-500">Retirada automática — OS</span>
                    {w.service_order_id && w.order_number && <Link className="font-medium text-brand-600 hover:underline" to={`/ordens/${w.service_order_id}`}>{w.order_number}</Link>}
                  </div> : <span className="text-xs text-slate-500">Retirada manual</span>}
                </td>
                <td className="px-4 py-2.5 text-slate-500">{w.notes || '—'}</td>
                <td className="px-4 py-2.5">{w.source_type !== 'service_order_part' && <button className="btn-ghost !px-1.5 !py-1 text-rose-600" aria-label="Excluir retirada manual" onClick={() => remove(w.id)}><Trash2 size={15} /></button>}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Nenhuma retirada registrada.</td></tr>
            )}
          </tbody>
        </table></div>
      </div>

      {showForm && <WithdrawalFormModal onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function WithdrawalFormModal({ onClose, onSaved }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/cash-withdrawals', { amount, reason, withdrawal_date: date, notes })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalFrame busy={saving} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="modal-panel w-full max-w-md p-5 sm:p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200/70 dark:border-white/10">
          <h3 className="font-display font-bold text-lg">Nova Retirada de Caixa</h3>
          <button type="button" onClick={onClose} className="btn-ghost !px-2 !py-1.5" aria-label="Fechar modal"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <p className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 rounded-lg p-2">{error}</p>}
          <div><label className="label">Valor (R$)</label><input type="number" step="0.01" required className="input" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div><label className="label">Motivo</label><input required className="input" value={reason} onChange={e => setReason(e.target.value)} /></div>
          <div><label className="label">Data</label><input type="date" required className="input" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><label className="label">Observações</label><textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </form>
      </div>
    </ModalFrame>
  )
}
