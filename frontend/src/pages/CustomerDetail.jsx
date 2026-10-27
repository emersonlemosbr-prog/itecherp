import Access from '../components/UI/Access'
import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Wrench, ShieldCheck, Wallet, Calendar, Eye, Printer } from 'lucide-react'
import api from '../api/client'
import {
  STATUS_LABELS, STATUS_BADGE, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_BADGE,
  formatCurrency, formatDate
} from '../utils/format'

export default function CustomerDetail() {
  const { id } = useParams()
  const [data, setData] = useState(null)

  useEffect(() => {
    api.get(`/customers/${id}/history`).then(r => setData(r.data))
  }, [id])

  if (!data) return <div className="text-slate-400 text-sm">Carregando...</div>
  const { customer, orders, totals } = data

  return (
    <div className="space-y-4">
      <Link to="/clientes" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
        <ArrowLeft size={15} /> Voltar aos clientes
      </Link>

      <div className="card p-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-xl">{customer.first_name} {customer.last_name}</h2>
          <p className="text-sm text-slate-400">{customer.phone || 'Sem telefone'} · {customer.address || 'Sem endereço'}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-lg font-display font-bold">{totals.total_repairs}</p>
            <p className="text-xs text-slate-400">Reparos</p>
          </div>
          <Access><div>
            <p className="text-lg font-display font-bold">{formatCurrency(totals.total_spent)}</p>
            <p className="text-xs text-slate-400">Total Gasto</p>
          </div></Access>
          <div>
            <p className="text-lg font-display font-bold">{formatDate(totals.last_visit)}</p>
            <p className="text-xs text-slate-400">Última Visita</p>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-ink-700 flex items-center gap-2">
          <Wrench size={16} className="text-brand-600" />
          <p className="font-semibold text-sm">Histórico de Reparos</p>
        </div>
        <div className="table-scroll overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-ink-700">
                <th className="px-4 py-2.5">OS</th>
                <th className="px-4 py-2.5">Entrada</th>
                <th className="px-4 py-2.5">Entrega</th>
                <th className="px-4 py-2.5">Aparelho</th>
                <th className="px-4 py-2.5">Descrição</th>
                <Access><th className="px-4 py-2.5">Valor</th></Access>
                <Access><th className="px-4 py-2.5">Pagamento</th></Access>
                <th className="px-4 py-2.5">Garantia até</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} className="border-b border-slate-50 dark:border-ink-700/50">
                  <td className="px-4 py-2.5 font-medium">{o.order_number}</td>
                  <td className="px-4 py-2.5 text-slate-500">{formatDate(o.entry_date)}</td>
                  <td className="px-4 py-2.5 text-slate-500">{formatDate(o.delivery_date)}</td>
                  <td className="px-4 py-2.5">{o.brand} {o.model}</td>
                  <td className="px-4 py-2.5 text-slate-500 truncate max-w-[200px]">{o.description}</td>
                  <Access><td className="px-4 py-2.5">{formatCurrency(o.service_price)}</td></Access>
                  <Access><td className="px-4 py-2.5"><span className={PAYMENT_STATUS_BADGE[o.payment_status]}>{PAYMENT_STATUS_LABELS[o.payment_status]}</span></td></Access>
                  <td className="px-4 py-2.5 text-slate-500">{formatDate(o.warranty_end)}</td>
                  <td className="px-4 py-2.5"><span className={STATUS_BADGE[o.status]}>{STATUS_LABELS[o.status]}</span></td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      <Link to={`/ordens/${o.id}`} className="btn-ghost !px-1.5 !py-1"><Eye size={15} /></Link>
                      <Link to={`/ordens/${o.id}/imprimir`} className="btn-ghost !px-1.5 !py-1"><Printer size={15} /></Link>
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">Nenhum reparo registrado ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
