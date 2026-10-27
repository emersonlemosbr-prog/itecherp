import { useSettings } from '../../context/SettingsContext'
import { canAccess } from '../../utils/access'
import React, { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, Wrench, ShieldCheck, HandCoins, X, Smartphone, NotebookPen,
  ReceiptText, ShoppingCart, Boxes, FolderArchive, ChevronDown, Banknote, Shield, Settings
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useBodyScrollLock } from '../UI/ModalFrame'


const sidebarSections = [
  {
    title: 'Principal',
    items: [
      { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
      { to: '/ordens', label: 'Ordens de Serviço', icon: Wrench },
      { to: '/clientes', label: 'Clientes', icon: Users },
    ],
  },
  {
    title: 'Financeiro',
    items: [
      { to: '/garantias', label: 'Garantias', icon: ShieldCheck },
      { to: '/fiados', label: 'Fiados', icon: HandCoins },
      { to: '/historico-financeiro', label: 'Histórico Financeiro', icon: FolderArchive },
    ],
  },
  {
    title: 'Estoque e Vendas',
    items: [
      { to: '/estoque', label: 'Controle de Estoque', icon: Boxes },
      { to: '/vendas', label: 'Venda', icon: ShoppingCart },
      { to: '/venda-aparelho', label: 'Venda de Aparelho', icon: ReceiptText },
    ],
  },
]

const toolsItems = [
  { to: '/pagbank-calculadora', label: 'Calculadora PagBank', icon: Smartphone },
  { to: '/valor-frontais', label: 'Valor de Peças', icon: Smartphone },
  { to: '/peliculas-compativeis', label: 'Películas Compatíveis', icon: Smartphone },
  { to: '/anotacoes', label: 'Anotações', icon: NotebookPen },
  { to: '/removedor-virus', label: 'Removedor de Vírus', icon: Shield },
]

export default function Sidebar({ open, onClose }) {
  useBodyScrollLock(open)
  const { isAdmin, user } = useAuth()
  const { settings } = useSettings()
  const [toolsOpen, setToolsOpen] = useState(false)
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
        bg-white/80 border-r border-slate-200 backdrop-blur-xl overflow-hidden
        dark:bg-[var(--bg-secondary)] dark:border-[var(--border-soft)] dark:text-[var(--text-main)]
        transform transition-transform duration-300 flex flex-col
        ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-[var(--border-soft)]">
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

          <div className="space-y-2">
            <button
              type="button"
              className="sidebar-collapse-button"
              onClick={() => setToolsOpen(!toolsOpen)}
              aria-expanded={toolsOpen}
            >
              <span className="sidebar-section-title !mb-0">Ferramentas</span>
              <ChevronDown size={14} className={`transition-transform duration-200 ${toolsOpen ? 'rotate-180' : ''}`} />
            </button>

            <div className={`space-y-1.5 overflow-hidden transition-all duration-200 ${toolsOpen ? 'max-h-none opacity-100' : 'max-h-0 opacity-0'}`}>
              {toolsItems.filter(item => canAccess(user, item.to)).map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={onClose}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        {isAdmin && <NavLink to="/configuracoes" onClick={onClose} className={({ isActive }) => `sidebar-link ${isActive ? "sidebar-link-active" : ""}`}><Settings size={18} /><span>Configurações</span></NavLink>}
        </nav>
      </aside>
    </>
  )
}
