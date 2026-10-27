import React, { useState, useEffect, useRef } from 'react'
import { Search, Check } from 'lucide-react'
import api from '../../api/client'

export default function CustomerPicker({ value, onChange }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  useEffect(() => {
    if (!q.trim()) { setResults([]); return }
    const t = setTimeout(() => api.get('/customers', { params: { q } }).then(r => setResults(r.data)), 200)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="relative min-w-0" ref={ref}>
      {value ? (
        <div className="flex items-center justify-between gap-2 input">
          <span className="flex flex-wrap min-w-0 items-center gap-2 break-words"><Check size={14} className="text-emerald-500" /> {value.first_name} {value.last_name} {value.phone && <span className="text-slate-400">· {value.phone}</span>}</span>
          <button type="button" className="min-h-11 shrink-0 text-sm text-brand-600 font-medium" onClick={() => onChange(null)}>Trocar</button>
        </div>
      ) : (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-8" placeholder="Digite o nome do cliente..." value={q}
            onFocus={() => setOpen(true)} onChange={e => { setQ(e.target.value); setOpen(true) }} />
        </div>
      )}
      {open && !value && results.length > 0 && (
        <div className="customer-picker-results absolute mt-1 w-full card p-1 max-h-56 overflow-auto z-30 text-sm">
          {results.map(c => (
            <button key={c.id} type="button"
              className="w-full min-h-11 break-words text-left px-2 py-1.5 rounded hover:bg-slate-50 dark:hover:bg-ink-700"
              onClick={() => { onChange(c); setOpen(false); setQ('') }}>
              {c.first_name} {c.last_name} <span className="text-slate-400">· {c.phone || 'sem telefone'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
