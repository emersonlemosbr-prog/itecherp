import Access from '../components/UI/Access'
import { usePagination } from '../components/UI/Pagination'
import ModalFrame from '../components/UI/ModalFrame'
import PermanentDeleteDialog from '../components/UI/PermanentDeleteDialog'
import React, { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, Eye, Pencil, Trash2, X } from 'lucide-react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { formatDate } from '../utils/format'

export default function Customers() {
  const { isAdmin, isSuspended } = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [customers, setCustomers] = useState([])
  const pagination = usePagination(customers)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data } = await api.get('/customers', { params: q ? { q } : {} })
    setCustomers(data)
  }, [q])

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t) }, [load])

  async function handleDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    setError('')
    try {
      await api.delete(`/customers/${pendingDelete.id}`)
      setPendingDelete(null)
      await load()
    } catch (failure) {
      setError(failure.response?.data?.error || 'Não foi possível excluir permanentemente o cliente.')
    } finally { setDeleting(false) }
  }

  return (
    <div className="space-y-4">
      {pagination.controls}
      {error && <p className="rounded-lg bg-rose-100 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-bold text-xl">Clientes</h2>
          <p className="text-sm text-slate-400">Cadastro e histórico de clientes</p>
        </div>
        <Access permission="create_customer"><button
          className="btn-primary disabled:opacity-50"
          disabled={isSuspended}
          title={isSuspended ? 'Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.' : ''}
          onClick={() => {
            if (isSuspended) {
              setError('Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.')
              return
            }
            setEditing(null)
            setShowForm(true)
          }}
        >
          <Plus size={16} /> Novo Cliente
        </button></Access>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Buscar por nome ou telefone..." value={q} onChange={e => setQ(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabela com rolagem horizontal"><table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-ink-700">
              <th className="px-4 py-2.5">Nome</th>
              <th className="px-4 py-2.5">Telefone</th>
              <th className="px-4 py-2.5">Endereço</th>
              <th className="px-4 py-2.5">Cadastrado em</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {pagination.rows.map(c => (
              <tr key={c.id} className="border-b border-slate-50 dark:border-ink-700/50 hover:bg-slate-50/60 dark:hover:bg-ink-700/30">
                <td className="px-4 py-2.5 font-medium">{c.first_name} {c.last_name}</td>
                <td className="px-4 py-2.5 text-slate-500">{c.phone || '—'}</td>
                <td className="px-4 py-2.5 text-slate-500 truncate max-w-xs">{c.address || '—'}</td>
                <td className="px-4 py-2.5 text-slate-500">{formatDate(c.created_at)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1">
                    <Link to={`/clientes/${c.id}`} className="btn-ghost !px-1.5 !py-1"><Eye size={15} /></Link>
                    <Access permission="edit_customer">
                      <button
                        disabled={isSuspended}
                        title={isSuspended ? 'Indisponível durante a suspensão da loja' : 'Editar'}
                        className="btn-ghost !px-1.5 !py-1 disabled:opacity-40"
                        onClick={() => {
                          if (isSuspended) {
                            setError('Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.')
                            return
                          }
                          setEditing(c)
                          setShowForm(true)
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                    </Access>
                    {isAdmin && (
                      <button
                        disabled={isSuspended}
                        title={isSuspended ? 'Indisponível durante a suspensão da loja' : 'Excluir'}
                        aria-label={`Excluir ${c.first_name} ${c.last_name}`}
                        className="btn-ghost !px-1.5 !py-1 text-rose-600 disabled:opacity-40"
                        onClick={() => {
                          if (isSuspended) {
                            setError('Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.')
                            return
                          }
                          setPendingDelete(c)
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Nenhum cliente encontrado.</td></tr>
            )}
          </tbody>
        </table></div>
      </div>

      {showForm && (
        <CustomerFormModal
          customer={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
        />
      )}
      {pendingDelete && <PermanentDeleteDialog subject="cliente" busy={deleting} onCancel={() => setPendingDelete(null)} onConfirm={handleDelete} />}
    </div>
  )
}

function CustomerFormModal({ customer, onClose, onSaved }) {
  const [form, setForm] = useState({
    first_name: customer?.first_name || '',
    last_name: customer?.last_name || '',
    birth_date: customer?.birth_date || '',
    address: customer?.address || '',
    phone: customer?.phone || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
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
    setSaving(true)
    setError('')
    try {
      if (customer) await api.put(`/customers/${customer.id}`, form)
      else await api.post('/customers', form)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar cliente.')
    } finally {
      setSaving(false)
    }
  }

  const content = (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <p className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 rounded-lg p-2">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Nome</label>
          <input className="input" required value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
        </div>
        <div>
          <label className="label">Sobrenome</label>
          <input className="input" required value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Data de Nascimento</label>
          <input type="date" className="input" value={form.birth_date || ''} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))} />
        </div>
        <div>
          <label className="label">Telefone</label>
          <input className="input" placeholder="(82) 9 9999-9999" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="label">Endereço</label>
        <input className="input" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
      </div>
      <div className="form-actions pt-2">
        <button type="button" className="btn-secondary" onClick={() => { if (!saving) onClose() }}>Cancelar</button>
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
      </div>
    </form>
  )

  return (
    <ModalFrame busy={saving} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4" onClick={() => { if (!saving) onClose() }}>
      <div className="modal-panel w-full max-w-lg max-h-[calc(100dvh-2rem)] flex flex-col p-5 sm:p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200/70 dark:border-white/10 shrink-0">
          <h3 className="font-display font-bold text-lg">{customer ? 'Editar Cliente' : 'Novo Cliente'}</h3>
          <button type="button" onClick={() => { if (!saving) onClose() }} className="btn-ghost !px-2 !py-1.5" aria-label="Fechar modal">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
          {content}
        </div>
      </div>
    </ModalFrame>
  )
}
