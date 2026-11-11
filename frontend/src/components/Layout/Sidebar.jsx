import { useSettings } from '../../context/SettingsContext'
import { canAccess } from '../../utils/access'
import React, { useEffect, useState, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Wrench, ShieldCheck, HandCoins, X, Smartphone, NotebookPen,
  ReceiptText, ShoppingCart, Boxes, FolderArchive, Banknote, Shield, Settings,
  User, Bell, UserCircle, LogOut
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useBodyScrollLock } from '../UI/ModalFrame'
import { useNotifications } from '../../context/NotificationContext'

const sidebarSections = [
  {
    title: 'Principal',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/valor-frontais', label: 'Peças', icon: Smartphone },
      { to: '/ordens', label: 'Ordens de Serviço', icon: Wrench },
      { to: '/clientes', label: 'Clientes', icon: Users },
    ],
  },
  {
    title: 'Financeiro',
    items: [
      { to: '/calculadora-maquininha', label: 'Calculadora Maquininha', icon: Smartphone },
      { to: '/garantias', label: 'Garantias', icon: ShieldCheck },
      { to: '/fiados', label: 'Pendentes', icon: HandCoins },
      { to: '/historico-financeiro', label: 'Histórico Financeiro', icon: FolderArchive },
    ],
  },
  {
    title: 'Estoque e Vendas',
    items: [
      { to: '/estoque', label: 'Controle de Estoque', icon: Boxes },
      { to: '/vendas', label: 'Venda de Caixa', icon: ShoppingCart },
      { to: '/venda-aparelho', label: 'Venda de Aparelho', icon: ReceiptText },
    ],
  },
  {
    title: 'Ferramentas',
    items: [
      { to: '/peliculas-compativeis', label: 'Películas Compatíveis', icon: Smartphone },
      { to: '/anotacoes', label: 'Anotações', icon: NotebookPen },
      { to: '/removedor-virus', label: 'Removedor de Vírus', icon: Shield },
    ],
  },
]

export default function Sidebar({ open, onClose }) {
  useBodyScrollLock(open)
  const navigate = useNavigate()
  const { isAdmin, user, logout } = useAuth()
  const { settings } = useSettings()
  const { unreadCount, setIsPanelOpen } = useNotifications()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false)
      }
    }
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [userMenuOpen])

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)')
    const closeOnDesktop = () => { if (desktop.matches) onClose() }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [onClose])

  const sections = sidebarSections.map(section => {
    const items = [...section.items]

    if (section.title === 'Financeiro' && isAdmin) {
      items.push({ to: '/caixa', label: 'Retiradas de Caixa', icon: Banknote })
    }

    return { ...section, items: items.filter(item => canAccess(user, item.to)) }
  })

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-[#1A1A1A]/70 backdrop-blur-[2px] z-30 md:hidden no-print" onClick={onClose} />
      )}
      <aside className={`
        mobile-sidebar fixed md:static z-40 top-0 left-0 h-screen w-[82vw] max-w-[300px] md:w-72 shrink-0 no-print
        bg-white/90 border-r border-slate-200 backdrop-blur-xl overflow-hidden
        dark:bg-[#18181B] dark:border-[rgba(255,255,255,0.08)] dark:text-[#FAFAFA]
        transform transition-transform duration-300 flex flex-col
        ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-[rgba(255,255,255,0.08)]">
          <div className="flex items-center gap-3 overflow-hidden">
            <img src={settings.store.logo || undefined} alt={settings.store.name} className="h-[110px] md:h-[130px] w-auto object-contain drop-shadow-[0_16px_20px_rgba(79,125,255,0.28)]" />
          </div>
          <button className="btn-ghost md:hidden !px-2.5 !py-2 text-slate-600 dark:text-zinc-300" onClick={onClose} aria-label="Fechar menu"><X size={20} /></button>
        </div>

        <nav className="flex-1 min-h-0 p-3.5 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y">
          {sections.map(section => (
            <div key={section.title} className="space-y-2">
              <p className="sidebar-section-title">{section.title}</p>
              <div className="space-y-1.5">
                {section.items.map(({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    onClick={onClose}
                    className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
                  >
                    <Icon size={18} />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}

          {isAdmin && (
            <div className="pt-2">
              <NavLink
                to="/configuracoes"
                onClick={onClose}
                className={({ isActive }) => `sidebar-link ${isActive ? "sidebar-link-active" : ""}`}
              >
                <Settings size={18} />
                <span>Configurações da Loja</span>
              </NavLink>
            </div>
          )}
        </nav>

        {/* Área Fixa do Usuário e Central de Notificações */}
        <div className="p-3 border-t border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-black/20 shrink-0 relative" ref={userMenuRef}>
          {/* Menu Suspenso do Usuário */}
          {userMenuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-2 p-1.5 rounded-2xl bg-white dark:bg-[#222225] border border-slate-200 dark:border-white/10 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150 space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false)
                  onClose()
                  navigate('/configuracoes?tab=users')
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/10 transition text-left"
              >
                <UserCircle size={17} className="text-[var(--brand-primary)] shrink-0" />
                <span>Minha conta</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false)
                  if (open) onClose()
                  logout()
                  navigate('/login', { replace: true })
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition text-left"
              >
                <LogOut size={17} className="shrink-0" />
                <span>Sair</span>
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-1.5 p-2 rounded-xl bg-white dark:bg-[#222225] border border-slate-200/80 dark:border-white/5 shadow-sm">
            {/* Identificação do Usuário */}
            <button
              type="button"
              className="flex items-center gap-2.5 min-w-0 flex-1 pr-1 text-left cursor-pointer hover:opacity-85 transition rounded-lg"
              onClick={() => setUserMenuOpen(prev => !prev)}
              title={user?.full_name || user?.username}
              aria-haspopup="true"
              aria-expanded={userMenuOpen}
            >
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#FFC806] to-[#D9A800] text-slate-950 flex items-center justify-center text-xs font-black shrink-0 shadow-sm">
                {user?.full_name ? user.full_name.slice(0, 1).toUpperCase() : <User size={15} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-800 dark:text-zinc-100 truncate leading-tight">
                  {user?.full_name || user?.username || 'Usuário'}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-zinc-400 truncate mt-0.5">
                  {user?.role === 'admin' ? 'Administrador' : 'Funcionário'}
                </p>
              </div>
            </button>

            {/* Ações: Sino de Notificações */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false)
                  setIsPanelOpen(true)
                  if (open) onClose()
                }}
                className="relative p-2 rounded-lg text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/10 transition"
                title="Central de Notificações"
                aria-label="Notificações"
              >
                <Bell size={17} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white shadow-sm ring-1 ring-white dark:ring-[#222225]">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
