import React, { useState, useEffect, useRef } from 'react'
import { Search, Check, Plus, User, Phone, MapPin, X } from 'lucide-react'
import api from '../../api/client'
import CustomerModal from '../CustomerModal'

export default function CustomerPicker({ value, onChange }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  useEffect(() => {
    if (!q.trim()) {
      setResults([])
      return
    }
    const t = setTimeout(() => {
      api.get('/customers', { params: { q } }).then(r => {
        const list = Array.isArray(r.data) ? r.data : (r.data?.data || [])
        setResults(list)
      }).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="relative min-w-0" ref={ref}>
      {value ? (
        <div className="flex items-center justify-between gap-2 input bg-slate-50/50 dark:bg-white/5 border border-amber-500/30">
          <div className="flex items-center gap-2 min-w-0">
            <Check size={16} className="text-emerald-500 shrink-0" />
            <div className="text-sm truncate">
              <strong className="text-slate-900 dark:text-white font-medium">
                {value.first_name} {value.last_name}
              </strong>
              {value.phone && <span className="text-slate-400 text-xs ml-2">· {value.phone}</span>}
              {value.cpf && <span className="text-slate-400 text-xs ml-2">· CPF: {value.cpf}</span>}
            </div>
          </div>
          <button
            type="button"
            className="text-xs font-semibold text-amber-600 hover:text-amber-500 hover:underline px-2 py-1 shrink-0"
            onClick={() => onChange(null)}
          >
            Trocar
          </button>
        </div>
      ) : (
        <div className="relative flex items-center">
          <Search size={15} className="absolute left-3 text-slate-400 pointer-events-none" />
          <input
            className="input pl-8 pr-10"
            placeholder="Buscar por nome, telefone, CPF ou código..."
            value={q}
            onFocus={() => setOpen(true)}
            onChange={e => {
              setQ(e.target.value)
              setOpen(true)
            }}
          />
          <button
            type="button"
            className="absolute right-2 p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-white/5 transition"
            title="Cadastrar novo cliente rapidamente"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={16} />
          </button>
        </div>
      )}

      {open && !value && (
        <div className="customer-picker-results absolute mt-1 w-full card p-1 max-h-64 overflow-auto z-40 text-sm shadow-xl border border-slate-200/80 dark:border-white/10 animate-in fade-in-50 duration-100">
          {results.length > 0 ? (
            results.map(c => (
              <button
                key={c.id}
                type="button"
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 transition flex items-center justify-between gap-2"
                onClick={() => {
                  onChange(c)
                  setOpen(false)
                  setQ('')
                }}
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 dark:text-zinc-100 truncate">
                    #{c.id} — {c.first_name} {c.last_name}
                  </div>
                  <div className="text-xs text-slate-400 truncate flex items-center gap-2">
                    {c.phone && <span>{c.phone}</span>}
                    {c.cpf && <span>CPF: {c.cpf}</span>}
                    {c.city && <span>{c.city} - {c.state}</span>}
                  </div>
                </div>
                <span className="text-[11px] font-bold text-amber-500 shrink-0">Selecionar</span>
              </button>
            ))
          ) : (
            <div className="p-3 text-center text-xs text-slate-400 space-y-2">
              <p>{q.trim() ? 'Nenhum cliente encontrado com este termo.' : 'Digite para buscar um cliente existente.'}</p>
              <button
                type="button"
                className="btn-secondary !text-xs !py-1 w-full flex items-center justify-center gap-1.5 text-amber-600 dark:text-amber-400"
                onClick={() => {
                  setShowCreateModal(true)
                  setOpen(false)
                }}
              >
                <Plus size={13} /> Cadastrar Novo Cliente Agora
              </button>
            </div>
          )}
        </div>
      )}

      {showCreateModal && (
        <CustomerModal
          onClose={() => setShowCreateModal(false)}
          onSaved={async () => {
            setShowCreateModal(false)
            // Se houver termo buscado, recarrega
            if (q.trim()) {
              const res = await api.get('/customers', { params: { q } })
              const list = Array.isArray(res.data) ? res.data : (res.data?.data || [])
              if (list.length > 0) onChange(list[0])
            }
          }}
        />
      )}
    </div>
  )
}
