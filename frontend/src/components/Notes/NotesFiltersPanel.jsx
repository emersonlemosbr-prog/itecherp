import React from 'react'

const sortOptions = [
  { value: 'newest', label: 'Mais recentes' },
  { value: 'oldest', label: 'Mais antigas' },
  { value: 'alphabetical', label: 'Alfabética' },
  { value: 'color', label: 'Cor' },
  { value: 'favorites', label: 'Favoritas' },
  { value: 'pinned', label: 'Fixadas' }
]

export default function NotesFiltersPanel({ sort, onSortChange, labelId, onLabelChange, labels }) {
  return (
    <div className="card p-3 flex flex-col md:flex-row gap-3 md:items-end">
      <div className="min-w-52">
        <label className="label">Ordenar por</label>
        <select className="input" value={sort} onChange={(e) => onSortChange(e.target.value)}>
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      <div className="min-w-56">
        <label className="label">Etiqueta</label>
        <select className="input" value={labelId || ''} onChange={(e) => onLabelChange(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Todas</option>
          {labels.map((label) => (
            <option key={label.id} value={label.id}>{label.name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
