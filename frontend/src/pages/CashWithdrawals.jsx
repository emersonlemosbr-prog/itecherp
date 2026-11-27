import ModalFrame from '../components/UI/ModalFrame'
import MobileRecordCard from '../components/MobileRecordCard'
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, X, Trash2, AlertTriangle, KeyRound, Eye, EyeOff } from 'lucide-react'
import api from '../api/client'
import { formatCurrency, formatDate } from '../utils/format'
import { getSaoPauloDateString } from '../utils/date'
import { useAuth } from '../context/AuthContext'

export default function CashWithdrawals() {
  const { isSuspended, isOwner } = useAuth()
  const [items, setItems] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [passwordModalItem, setPasswordModalItem] = useState(null)
  const [notice, setNotice] = useState('')

  const load = () => api.get('/cash-withdrawals').then(r => setItems(r.data))
  useEffect(() => { load() }, [])

  function handleStartDelete(withdrawal) {
    if (isSuspended) {
      alert('Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.')
      return
    }
    setPendingDelete(withdrawal)
  }

  const total = items.reduce((s, i) => s + Number(i.amount || 0), 0)

  return (
    <div className="space-y-4">
      {notice && (
        <div role="status" className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 p-3 rounded-xl flex items-center justify-between text-sm">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="btn-ghost !p-1" aria-label="Fechar aviso"><X size={16} /></button>
        </div>
      )}

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

      <div className="md:hidden space-y-3">
        {items.map(w => (
          <MobileRecordCard
            key={w.id}
            title={w.reason}
            subtitle={w.supplier_name || 'Sem fornecedor'}
            badge={<span className="text-xs font-bold text-rose-500">{formatCurrency(w.amount)}</span>}
            fields={[
              { label: 'Data', value: formatDate(w.withdrawal_date) },
              { label: 'Origem', value: w.source_type === 'service_order_part' ? `Automática (${w.order_number || 'OS'})` : 'Manual' },
              ...(w.notes ? [{ label: 'Observações', value: w.notes, fullWidth: true }] : []),
            ]}
            actions={
              isOwner && w.source_type !== 'service_order_part' ? (
                <button
                  type="button"
                  className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 text-rose-500 text-xs flex items-center gap-1"
                  onClick={() => handleStartDelete(w)}
                >
                  <Trash2 size={14} /> Excluir
                </button>
              ) : null
            }
          />
        ))}
        {items.length === 0 && (
          <div className="card p-6 text-center text-xs text-slate-400">Nenhuma retirada registrada.</div>
        )}
      </div>

      <div className="card overflow-hidden hidden md:block">
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabela com rolagem horizontal"><table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-ink-700">
              <th className="px-4 py-2.5">Data</th>
              <th className="px-4 py-2.5">Descrição</th>
              <th className="px-4 py-2.5">Fornecedor</th>
              <th className="px-4 py-2.5">Valor</th>
              <th className="px-4 py-2.5">Origem / OS</th>
              <th className="px-4 py-2.5">Observações</th>
              {isOwner && <th className="px-4 py-2.5 text-right">Ações</th>}
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
                {isOwner && (
                  <td className="px-4 py-2.5 text-right">
                    {w.source_type !== 'service_order_part' ? (
                      <button
                        className="btn-ghost !px-2 !py-1 text-rose-600 hover:bg-rose-500/10 transition-colors"
                        aria-label={`Excluir retirada de ${formatCurrency(w.amount)}`}
                        title="Excluir retirada (exclusivo para proprietário)"
                        onClick={() => handleStartDelete(w)}
                      >
                        <Trash2 size={15} />
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400 italic">Automática</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={isOwner ? 7 : 6} className="px-4 py-8 text-center text-slate-400">Nenhuma retirada registrada.</td></tr>
            )}
          </tbody>
        </table></div>
      </div>

      {showForm && <WithdrawalFormModal onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}

      {/* Primeiro Pop-up: Confirmação de exclusão */}
      {pendingDelete && (
        <DeleteConfirmModal
          withdrawal={pendingDelete}
          onClose={() => setPendingDelete(null)}
          onContinue={() => {
            const item = pendingDelete
            setPendingDelete(null)
            setPasswordModalItem(item)
          }}
        />
      )}

      {/* Segundo Pop-up: Autenticação com senha do proprietário */}
      {passwordModalItem && (
        <OwnerPasswordModal
          withdrawal={passwordModalItem}
          onClose={() => setPasswordModalItem(null)}
          onSuccess={() => {
            setPasswordModalItem(null)
            setNotice('Retirada de caixa excluída com sucesso.')
            load()
          }}
        />
      )}
    </div>
  )
}

function DeleteConfirmModal({ withdrawal, onClose, onContinue }) {
  return (
    <ModalFrame className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <div className="modal-panel w-full max-w-md p-5 sm:p-6" onClick={e => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-labelledby="confirm-delete-title">
        <div className="flex items-center gap-3 pb-3 mb-4 border-b border-slate-200/70 dark:border-white/10">
          <div className="p-2 rounded-full bg-rose-500/10 text-rose-600">
            <AlertTriangle size={22} />
          </div>
          <div>
            <h3 id="confirm-delete-title" className="font-display font-bold text-lg text-slate-900 dark:text-white">
              Excluir retirada de caixa?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Esta ação não poderá ser desfeita após a confirmação.</p>
          </div>
        </div>

        <div className="space-y-3 mb-5 text-sm">
          <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-3.5 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400">Valor da retirada:</span>
              <span className="font-bold text-rose-600 dark:text-rose-400 text-sm">{formatCurrency(withdrawal.amount)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400">Data:</span>
              <span className="font-medium text-slate-700 dark:text-slate-200">{formatDate(withdrawal.withdrawal_date)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400">Descrição:</span>
              <span className="font-medium text-slate-700 dark:text-slate-200 max-w-[200px] truncate text-right">{withdrawal.reason || '—'}</span>
            </div>
            {withdrawal.notes && (
              <div className="flex justify-between items-start pt-1 border-t border-slate-200/60 dark:border-white/5">
                <span className="text-slate-500 dark:text-slate-400">Observações:</span>
                <span className="text-slate-700 dark:text-slate-300 italic max-w-[200px] text-right">{withdrawal.notes}</span>
              </div>
            )}
          </div>

          <p className="text-slate-700 dark:text-slate-300 text-xs">
            Essa ação excluirá permanentemente esta retirada. Para continuar, será necessário confirmar sua senha de acesso.
          </p>
        </div>

        <div className="flex justify-end gap-2.5">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn-primary !bg-rose-600 hover:!bg-rose-700 text-white" onClick={onContinue}>
            Continuar
          </button>
        </div>
      </div>
    </ModalFrame>
  )
}

function OwnerPasswordModal({ withdrawal, onClose, onSuccess }) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirm(e) {
    e.preventDefault()
    if (!password) {
      setError('Informe sua senha de acesso.')
      return
    }

    setLoading(true)
    setError('')
    try {
      await api.delete(`/cash-withdrawals/${withdrawal.id}`, {
        data: { password }
      })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao excluir retirada de caixa.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalFrame busy={loading} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4" onClick={() => { if (!loading) onClose() }}>
      <div className="modal-panel w-full max-w-md p-5 sm:p-6" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="owner-auth-title">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200/70 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-full bg-amber-500/10 text-amber-500">
              <KeyRound size={20} />
            </div>
            <div>
              <h3 id="owner-auth-title" className="font-display font-bold text-lg text-slate-900 dark:text-white">
                Confirme sua identidade
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Digite sua senha de acesso ao iTechCloud para autorizar a exclusão.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={loading} className="btn-ghost !px-2 !py-1.5" aria-label="Fechar modal">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="space-y-4">
          <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5 p-3 rounded-lg border border-slate-200/60 dark:border-white/5">
            Excluindo retirada de <strong className="text-rose-600 dark:text-rose-400">{formatCurrency(withdrawal.amount)}</strong> realizada em <strong>{formatDate(withdrawal.withdrawal_date)}</strong>.
          </div>

          {error && (
            <p role="alert" className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg p-2.5">
              {error}
            </p>
          )}

          <div>
            <label className="label" htmlFor="owner-delete-password">
              Senha de acesso
            </label>
            <div className="relative">
              <input
                id="owner-delete-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                disabled={loading}
                className="input pr-10"
                placeholder="Digite sua senha de login"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button type="button" className="btn-secondary" disabled={loading} onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary !bg-rose-600 hover:!bg-rose-700 text-white disabled:opacity-50"
              disabled={loading || !password}
            >
              {loading ? 'Validando senha...' : 'Confirmar exclusão'}
            </button>
          </div>
        </form>
      </div>
    </ModalFrame>
  )
}

function WithdrawalFormModal({ onClose, onSaved }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(() => getSaoPauloDateString())
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

