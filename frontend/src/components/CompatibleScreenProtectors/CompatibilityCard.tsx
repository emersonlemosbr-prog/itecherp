import React from 'react'
import { MoreVertical, Pencil, ShieldCheck, Trash2 } from 'lucide-react'

type CompatibilityCardProps = {
  groupName: string
  models: string[]
  isModelMatch: (model: string) => boolean
  canManage?: boolean
  onEdit?: () => void
  onDelete?: () => void
}

export default function CompatibilityCard({
  groupName,
  models,
  isModelMatch,
  canManage = false,
  onEdit,
  onDelete,
}: CompatibilityCardProps) {
  function closeMenu(event: React.MouseEvent<HTMLButtonElement>) {
    event.currentTarget.closest('details')?.removeAttribute('open')
  }

  return (
    <article className="csp-group-card itech-sidebar-hover">
      <div className="csp-group-title-row">
        <div className="csp-group-icon-wrap"><ShieldCheck size={16} /></div>
        <h3 className="csp-group-title">{groupName}</h3>
        {canManage && (
          <details className="csp-card-menu">
            <summary aria-label={`Gerenciar ${groupName}`}><MoreVertical size={17} /></summary>
            <div className="csp-card-menu-popover">
              <button type="button" onClick={event => { closeMenu(event); onEdit?.() }}><Pencil size={14} /> Editar</button>
              <button type="button" className="is-danger" onClick={event => { closeMenu(event); onDelete?.() }}><Trash2 size={14} /> Excluir</button>
            </div>
          </details>
        )}
      </div>
      <div className="csp-chip-grid">
        {models.map(model => (
          <span key={`${groupName}-${model}`} className={`csp-model-chip ${isModelMatch(model) ? 'is-match' : ''}`}>
            {model}
          </span>
        ))}
      </div>
    </article>
  )
}
