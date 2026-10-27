import React from 'react'
import { Search, X } from 'lucide-react'

type CompatibilitySearchProps = {
  value: string
  onChange: (value: string) => void
}

export default function CompatibilitySearch({ value, onChange }: CompatibilitySearchProps) {
  return (
    <div className="csp-search-wrap">
      <Search size={18} className="csp-search-icon" />
      <input
        className="csp-search-input"
        type="search"
        aria-label="Pesquisar modelo de aparelho"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Digite um modelo: A15, S23, iPhone 15, Redmi Note 13..."
      />
      {value && (
        <button type="button" className="csp-clear-btn" onClick={() => onChange('')} aria-label="Limpar busca">
          <X size={16} />
        </button>
      )}
    </div>
  )
}
