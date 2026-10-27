import React from 'react'

type BrandFilterProps = {
  brands: string[]
  activeBrand: string
  onSelect: (brand: string) => void
}

export default function BrandFilter({ brands, activeBrand, onSelect }: BrandFilterProps) {
  return (
    <div className="csp-brand-row">
      {brands.map((brand) => {
        const isActive = activeBrand === brand
        return (
          <button
            type="button"
            key={brand}
            onClick={() => onSelect(brand)}
            aria-pressed={isActive}
            className={`csp-brand-chip ${isActive ? 'is-active' : ''}`}
          >
            {brand}
          </button>
        )
      })}
    </div>
  )
}
