import Access from '../components/UI/Access'
import { useSettings } from '../context/SettingsContext'
import React, { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Eye, Pencil, Trash2, Printer } from 'lucide-react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import {
  STATUS_LABELS, STATUS_BADGE, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_BADGE,
  formatCurrency, formatDate
} from '../utils/format'

export default function ServiceOrders() {
  const { settings } = useSettings()
  const [page, setPage] = useState(1)
  const { isAdmin, isSuspended } = useAuth()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [orders, setOrders] = useState([])

  const load = useCallback(async () => {
    const { data } = await api.get('/service-orders', { params: { q: q || undefined, status: status || undefined } })
    setOrders(data)
  }, [q, status])

  useEffect(() => setPage(1), [q, status, settings.system.page_size])
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t) }, [load])

  async function handleDelete(id) {
    if (isSuspended) {
      alert('Esta funcionalidade está temporariamente indisponível porque a assinatura da sua loja está suspensa.')
      return
    }
    if (settings.system.confirm_delete && !confirm('Excluir esta ordem de serviço?')) return
    try {
      await api.delete(`/service-orders/${id}`)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao excluir ordem de serviço.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-bold text-xl">Ordens de Serviços</h2>
          <p className="text-sm text-slate-400">Cadastro e acompanhamento de reparos</p>
        </div>
        {!isSuspended && (
          <Access permission="create_order">
            <Link to="/ordens/nova" className="btn-primary">
              <Plus size={16} /> Nova Ordem
            </Link>
          </Access>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative w-full sm:flex-1 sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Buscar por OS, cliente ou aparelho..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="input sm:max-w-[220px]" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="flex gap-3 items-center text-sm"><button className="btn-secondary" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Página {page}</span><button className="btn-secondary" disabled={page*settings.system.page_size>=orders.length} onClick={()=>setPage(p=>p+1)}>Próxima</button></div>
      <p className="text-xs text-slate-500 md:hidden">Deslize a tabela para os lados para ver todas as colunas e ações.</p>
      <div className="card overflow-hidden">
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabela com rolagem horizontal"><table className="service-orders-table w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-ink-700">
              <th className="px-4 py-2.5">OS</th>
              <th className="px-4 py-2.5">Cliente</th>
              <th className="px-4 py-2.5">Marca</th>
              <th className="px-4 py-2.5">Modelo</th>
              <th className="px-4 py-2.5">Descrição</th>
              {isAdmin && <th className="px-4 py-2.5">Total</th>}
              {isAdmin && <th className="px-4 py-2.5">Pagamento</th>}
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Entrada</th>
              <th className="px-4 py-2.5">Entrega</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {orders.slice((page-1)*settings.system.page_size,page*settings.system.page_size).map(o => (
              <tr key={o.id} className="border-b border-slate-50 dark:border-ink-700/50 hover:bg-slate-50/60 dark:hover:bg-ink-700/30">
                <td className="px-4 py-2.5 font-medium"><Link className="order-edit-link" to={`/ordens/${o.id}${settings.system.edit_order_number ? "/editar" : ""}`} aria-label={`Editar OS ${o.order_number}`}>{o.order_number}</Link></td>
                <td className="px-4 py-2.5">{o.first_name} {o.last_name}</td>
                <td className="px-4 py-2.5 text-slate-500">{o.brand}</td>
                <td className="px-4 py-2.5 text-slate-500">{o.model}</td>
                <td className="px-4 py-2.5 text-slate-500 truncate max-w-[160px]">{o.description}</td>
                {isAdmin && <td className="px-4 py-2.5">{formatCurrency(o.service_price)}</td>}
                {isAdmin && <td className="px-4 py-2.5"><span className={PAYMENT_STATUS_BADGE[o.payment_status]}>{PAYMENT_STATUS_LABELS[o.payment_status]}</span></td>}
                <td className="px-4 py-2.5"><span className={STATUS_BADGE[o.status]}>{STATUS_LABELS[o.status]}</span></td>
                <td className="px-4 py-2.5 text-slate-500">{formatDate(o.entry_date)}</td>
                <td className="px-4 py-2.5 text-slate-500">{formatDate(o.delivery_date)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1">
                    <Link to={`/ordens/${o.id}`} className="btn-ghost !px-1.5 !py-1"><Eye size={15} /></Link>
                    <Access permission="edit_order"><Link to={`/ordens/${o.id}/editar`} className="btn-ghost !px-1.5 !py-1"><Pencil size={15} /></Link></Access>
                    <Access permission="printing"><Link to={`/ordens/${o.id}/imprimir`} className="btn-ghost !px-1.5 !py-1"><Printer size={15} /></Link></Access>
                    {isAdmin && <button className="btn-ghost !px-1.5 !py-1 text-rose-600" onClick={() => handleDelete(o.id)}><Trash2 size={15} /></button>}
                  </div>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-400">Nenhuma ordem de serviço encontrada.</td></tr>
            )}
          </tbody>
        </table></div>
      </div>
    </div>
  )
}
