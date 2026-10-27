import React from 'react'
import { Shield, Smartphone, Tags } from 'lucide-react'

type StatsCardsProps = {
  groupCount: number
  modelCount: number
  brandCount: number
}

export default function StatsCards({ groupCount, modelCount, brandCount }: StatsCardsProps) {
  const stats = [
    { label: 'Grupos', value: groupCount, icon: Shield },
    { label: 'Modelos', value: modelCount, icon: Smartphone },
    { label: 'Marcas', value: brandCount, icon: Tags },
  ]

  return (
    <div className="csp-stats-grid">
      {stats.map(({ label, value, icon: Icon }) => (
        <div className="csp-stat-card" key={label}>
          <span className="csp-stat-icon"><Icon size={17} /></span>
          <span className="csp-stat-copy">
            <span className="csp-stat-label">{label}</span>
            <strong>{value}</strong>
          </span>
        </div>
      ))}
    </div>
  )
}
