import { useSettings } from '../../context/SettingsContext'
import { canAccess } from '../../utils/access'
import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Menu, Sun, Moon, Search, LogOut, ChevronDown, Banknote, Settings } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import api from '../../api/client'

const menuItems = [
  { to: '/configuracoes', label: 'Configurações' },
  { to: '/', label: 'Painel' },
  { to: '/clientes', label: 'Clientes' },
  { to: '/ordens', label: 'Ordens de Serviço' },
  { to: '/garantias', label: 'Garantias' },
  { to: '/fiados', label: 'Fiados' },
  { to: '/pagbank-calculadora', label: 'Calculadora PagBank' },
  { to: '/valor-frontais', label: 'Valor de Peças' },
  { to: '/peliculas-compativeis', label: 'Películas Compatíveis' },
  { to: '/venda-aparelho', label: 'Venda de Aparelho' },
  { to: '/vendas', label: 'Venda' },
  { to: '/estoque', label: 'Controle de Estoque' },
  { to: '/anotacoes', label: 'Anotações' },
]

export default function Header({ onMenuClick }) {
  const { settings } = useSettings()
  const { user, logout, isAdmin } = useAuth()
  const { dark, toggle, setLight, setDarkTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const boxRef = useRef(null)

  const currentPage = menuItems.find(item => item.to === location.pathname)?.label || 'Painel'

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
    <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/75 backdrop-blur-xl dark:border-[#333333] dark:bg-[var(--bg-primary)]">
      <div className="flex items-center gap-1.5 sm:gap-3 px-2 sm:px-4 md:px-6 py-3.5">
        <button className="btn-ghost md:hidden !px-2.5 !py-2 text-slate-600 dark:text-zinc-300" onClick={onMenuClick} aria-label="Abrir menu"><Menu size={22} /></button>

        <h1 className="hidden sm:block text-[15px] font-semibold text-slate-800 tracking-[0.01em] dark:text-zinc-100">{currentPage}<span className="block text-xs font-normal text-slate-400 max-w-40 truncate">{settings.store.name}</span></h1>

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
                  <p className="px-2 text-[11px] font-semibold text-zinc-400 uppercase">Fiados</p>
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
          <div className="hidden sm:flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100/80 p-1 dark:border-white/10 dark:bg-white/5">
            <button
              type="button"
              onClick={setLight}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${!dark ? 'bg-white text-slate-900 shadow-sm dark:bg-[#2A2A2A] dark:text-white' : 'text-slate-500 dark:text-slate-300'}`}
            >
              Claro
            </button>
            <button
              type="button"
              onClick={setDarkTheme}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${dark ? 'bg-white text-slate-900 shadow-sm dark:bg-[#2A2A2A] dark:text-white' : 'text-slate-500 dark:text-slate-300'}`}
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

          <div className="relative">
            <button className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-[14px] border border-white/5 bg-white/[0.03] hover:bg-white/[0.09]"
              onClick={() => setMenuOpen(o => !o)}>
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#FFC806] to-[#D9A800] text-[#1C1C1C] flex items-center justify-center text-xs font-bold">
                {user?.full_name?.slice(0, 1).toUpperCase()}
              </div>
              <ChevronDown size={14} className="text-zinc-400" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-52 card p-2 text-sm z-30">
                <div className="px-2 py-2 border-b border-white/10 mb-1">
                  <p className="font-semibold">{user?.full_name}</p>
                  <p className="text-xs text-zinc-400">{user?.role === 'admin' ? 'Administrador' : 'Funcionário'}</p>
                </div>
                {isAdmin && (
                  <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-white/10"
                    onClick={() => { navigate('/configuracoes'); setMenuOpen(false) }}>
                    <Settings size={15} /> Configurações
                  </button>
                )}
                <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-white/10 text-rose-400"
                  onClick={logout}>
                  <LogOut size={15} /> Sair
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
