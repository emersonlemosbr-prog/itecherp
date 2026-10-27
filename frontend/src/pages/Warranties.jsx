import Access from '../components/UI/Access'
import { usePagination } from '../components/UI/Pagination'
import React, { useEffect, useState, useCallback } from 'react'
import { Search, ShieldAlert, ShieldCheck } from 'lucide-react'
import api from '../api/client'
import { formatCurrency, formatDate } from '../utils/format'

export default function Warranties() {
  const [q, setQ] = useState('')
  const [warranties, setWarranties] = useState([])
  const pagination = usePagination(warranties)
  const [expiring, setExpiring] = useState([])

  const load = useCallback(async () => {
    const { data } = await api.get('/warranties', { params: q ? { q } : {} })
    setWarranties(data)
  }, [q])

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t) }, [load])
  useEffect(() => { api.get('/warranties/expiring').then(r => setExpiring(r.data)) }, [])

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-4">
      {pagination.controls}
      <div>
        <h2 className="font-display font-bold text-xl">Garantias</h2>
        <p className="text-sm text-slate-400">Acompanhamento de garantias dos reparos entregues</p>
      </div>

      {expiring.length > 0 && (
        <div className="card p-4 border-l-4 border-amber-400 bg-amber-50/60 dark:bg-amber-500/5">
          <div className="flex items-center gap-2 mb-2 text-amber-700 dark:text-amber-400">
            <ShieldAlert size={18} />
            <p className="font-semibold text-sm">Garantias vencendo em até 7 dias</p>
          </div>
          <ul className="text-sm space-y-1">
            {expiring.map(w => (
              <li key={w.id} className="text-slate-600 dark:text-slate-300">
                {w.order_number} · {w.first_name} {w.last_name} — vence em {formatDate(w.warranty_end)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Buscar por cliente, OS ou aparelho..." value={q} onChange={e => setQ(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabela com rolagem horizontal"><table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-ink-700">
              <th className="px-4 py-2.5">OS</th>
              <th className="px-4 py-2.5">Cliente</th>
              <th className="px-4 py-2.5">Aparelho</th>
              <th className="px-4 py-2.5">Retirada</th>
              <th className="px-4 py-2.5">Início Garantia</th>
              <th className="px-4 py-2.5">Fim Garantia</th>
              <Access><th className="px-4 py-2.5">Valor Pago</th></Access>
              <th className="px-4 py-2.5">Situação</th>
            </tr>
          </thead>
          <tbody>
            {pagination.rows.map(w => {
              const expired = w.warranty_end < today
              return (
                <tr key={w.id} className="border-b border-slate-50 dark:border-ink-700/50">
                  <td className="px-4 py-2.5 font-medium">{w.order_number}</td>
                  <td className="px-4 py-2.5">{w.first_name} {w.last_name}</td>
                  <td className="px-4 py-2.5 text-slate-500">{w.brand} {w.model}</td>
                  <td className="px-4 py-2.5 text-slate-500">{formatDate(w.pickup_date)}</td>
                  <td className="px-4 py-2.5 text-slate-500">{formatDate(w.warranty_start)}</td>
                  <td className="px-4 py-2.5 text-slate-500">{formatDate(w.warranty_end)}</td>
                  <Access><td className="px-4 py-2.5">{formatCurrency(w.amount_paid)}</td></Access>
                  <td className="px-4 py-2.5">
                    {expired
                      ? <span className="badge-slate">Expirada</span>
                      : <span className="badge-green flex items-center gap-1 w-fit"><ShieldCheck size={12} /> Ativa</span>}
                  </td>
                </tr>
              )
            })}
            {warranties.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Nenhuma garantia registrada ainda.</td></tr>
            )}
          </tbody>
        </table></div>
      </div>
    </div>
  )
}
