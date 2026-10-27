import React from 'react'
import { BellRing, Heart, Archive, Trash2, StickyNote } from 'lucide-react'

const items = [
  { key: 'notes', label: 'Notas', icon: StickyNote },
  { key: 'reminders', label: 'Lembretes', icon: BellRing },
  { key: 'favorites', label: 'Favoritas', icon: Heart },
  { key: 'archived', label: 'Arquivadas', icon: Archive },
  { key: 'trash', label: 'Lixeira', icon: Trash2 }
]

export default function NotesSidebar({ section, onSectionChange, counts }) {
  return (
    <aside className="w-full lg:w-56 shrink-0">
      <div className="card p-2 sticky top-20">
        {items.map(({ key, label, icon: Icon }) => {
          const active = section === key
          return (
            <button
              key={key}
              onClick={() => onSectionChange(key)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                  : 'hover:bg-slate-100 dark:hover:bg-[#2A2A2A] text-slate-600 dark:text-slate-300'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <Icon size={16} />
                {label}
              </span>
              <span className="text-xs text-slate-400">{counts?.[key] || 0}</span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
