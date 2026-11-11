import { useSettings } from '../../context/SettingsContext'
import { canAccess } from '../../utils/access'
import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Menu, Sun, Moon, Search, Banknote } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import api from '../../api/client'

const menuItems = [
  { to: '/configuracoes', label: 'Configurações' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/', label: 'Dashboard' },
  { to: '/clientes', label: 'Clientes' },
  { to: '/ordens', label: 'Ordens de Serviço' },
  { to: '/garantias', label: 'Garantias' },
  { to: '/fiados', label: 'Pendentes' },
  { to: '/calculadora-maquininha', label: 'Calculadora Maquininha' },
  { to: '/valor-frontais', label: 'Peças' },
  { to: '/peliculas-compativeis', label: 'Películas Compatíveis' },
  { to: '/venda-aparelho', label: 'Venda de Aparelho' },
  { to: '/vendas', label: 'Venda de Caixa' },
  { to: '/estoque', label: 'Controle de Estoque' },
  { to: '/anotacoes', label: 'Anotações' },
]

export default function Header({ onMenuClick }) {
  const { settings } = useSettings()
  const { user, isAdmin } = useAuth()
  const { dark, toggle, setLight, setDarkTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const boxRef = useRef(null)

  const currentPage = menuItems.find(item => item.to === location.pathname)?.label || 'Dashboard'

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setResults(null)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    if (!q.trim()) { setResults(null); return }
    const timer = setTimeout(async () => {
      const [customers, orders, warranties, credits] = await Promise.all([
        canAccess(user, '/clientes') ? api.get('/customers', { params: { q } }).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        canAccess(user, '/ordens') ? api.get('/service-orders', { params: { q } }).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        canAccess(user, '/garantias') ? api.get('/warranties', { params: { q } }).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        canAccess(user, '/fiados') ? api.get('/credit-accounts', { params: { q } }).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      ])
      setResults({
        customers: customers.data.slice(0, 4),
        orders: orders.data.slice(0, 4),
        warranties: warranties.data.slice(0, 3),
        credits: credits.data.slice(0, 3),
      })
    }, 250)
    return () => clearTimeout(timer)
  }, [q])

  return (
    <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur-xl dark:border-[rgba(255,255,255,0.08)] dark:bg-[#18181B]/95">
      <div className="flex items-center gap-1.5 sm:gap-3 px-2 sm:px-4 md:px-6 py-3.5">
        <button className="btn-ghost md:hidden !px-2.5 !py-2 text-slate-600 dark:text-zinc-300" onClick={onMenuClick} aria-label="Abrir menu"><Menu size={22} /></button>

        <h1 className="hidden sm:block text-[15px] font-semibold text-slate-800 tracking-[0.01em] dark:text-zinc-100">{currentPage}</h1>

        <div className="relative min-w-0 flex-1 max-w-xl sm:ml-2" ref={boxRef}>
          <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-400" />
          <input
            className="input h-11 pl-12"
            placeholder="Buscar cliente, OS, garantia, fiado..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {results && (
            <div className="absolute mt-2 w-full min-w-[220px] max-w-[calc(100vw-5rem)] card p-2 max-h-96 overflow-auto text-sm z-40">
              {results.customers.length > 0 && (
                <div className="mb-2">
                  <p className="px-2 text-[11px] font-semibold text-zinc-400 uppercase">Clientes</p>
                  {results.customers.map(c => (
                    <button key={c.id} onClick={() => { navigate(`/clientes/${c.id}`); setQ(''); setResults(null) }}
                      className="w-full text-left px-2 py-1.5 rounded-xl hover:bg-white/10">
                      {c.first_name} {c.last_name} <span className="text-zinc-400">· {c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
              {results.orders.length > 0 && (
                <div className="mb-2">
                  <p className="px-2 text-[11px] font-semibold text-zinc-400 uppercase">Ordens de Serviço</p>
                  {results.orders.map(o => (
                    <button key={o.id} onClick={() => { navigate(`/ordens/${o.id}`); setQ(''); setResults(null) }}
                      className="w-full text-left px-2 py-1.5 rounded-xl hover:bg-white/10">
                      {o.order_number} <span className="text-zinc-400">· {o.first_name} {o.last_name} · {o.brand} {o.model}</span>
                    </button>
                  ))}
                </div>
              )}
              {results.warranties.length > 0 && (
                <div className="mb-2">
                  <p className="px-2 text-[11px] font-semibold text-zinc-400 uppercase">Garantias</p>
                  {results.warranties.map(w => (
                    <div key={w.id} className="px-2 py-1.5 text-zinc-300">{w.order_number} · {w.first_name} {w.last_name}</div>
                  ))}
                </div>
              )}
              {results.credits.length > 0 && (
                <div>
                  <p className="px-2 text-[11px] font-semibold text-zinc-400 uppercase">Pendentes</p>
                  {results.credits.map(c => (
                    <div key={c.id} className="px-2 py-1.5 text-zinc-300">{c.first_name} {c.last_name}</div>
                  ))}
                </div>
              )}
              {!results.customers.length && !results.orders.length && !results.warranties.length && !results.credits.length && (
                <p className="px-2 py-2 text-zinc-400">Nenhum resultado.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 ml-auto">
          <div className="hidden sm:flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100/80 p-1 dark:border-white/10 dark:bg-zinc-800/80">
            <button
              type="button"
              onClick={setLight}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${!dark ? 'bg-white text-slate-900 shadow-sm ' : 'text-slate-500 dark:text-zinc-400 dark:hover:text-zinc-200'}`}
            >
              Claro
            </button>
            <button
              type="button"
              onClick={setDarkTheme}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${dark ? 'bg-[#FFC806] text-[#1C1C1C] font-semibold shadow-sm' : 'text-slate-500 dark:text-zinc-400'}`}
            >
              Escuro
            </button>
          </div>
          {canAccess(user, "/ordens/nova") && <button className="btn-primary hidden sm:inline-flex" onClick={() => navigate('/ordens/nova')}>
            Nova OS
          </button>}
          {isAdmin && (
            <button className="btn-secondary hidden sm:inline-flex" onClick={() => navigate('/caixa')}>
              <Banknote size={16} /> Caixa
            </button>
          )}
          <button className="btn-ghost !px-2.5" onClick={toggle} title="Alternar tema">
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>
    </header>
  )
}
