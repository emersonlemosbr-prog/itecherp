/**
 * Card responsivo reutilizável para exibição de registros em telas mobile (< md),
 * substituindo tabelas com rolagem horizontal sem perda de informações ou ações.
 */
export default function MobileRecordCard({
  title,
  subtitle,
  badge,
  media,
  fields = [],
  actions,
  onClick,
  className = '',
}) {
  return (
    <div
      onClick={onClick}
      className={`card p-3.5 space-y-3 w-full max-w-full overflow-hidden ${onClick ? 'cursor-pointer active:scale-[0.99] transition-transform' : ''} ${className}`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          {media && <div className="shrink-0">{media}</div>}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-slate-900 dark:text-white break-words leading-snug">{title}</div>
            {subtitle && (
              <div className="text-xs text-slate-500 dark:text-zinc-400 break-words mt-0.5">{subtitle}</div>
            )}
          </div>
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>

      {fields.length > 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs border-t border-slate-200 dark:border-white/10 pt-2.5">
          {fields.map((field, idx) => (
            <div key={idx} className={`min-w-0 ${field.fullWidth ? 'col-span-2' : ''}`}>
              <span className="block text-[10px] uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                {field.label}
              </span>
              <span
                className={`block break-words mt-0.5 ${
                  field.highlight ? 'font-bold text-[#FFBE0B]' : 'text-slate-700 dark:text-zinc-200 font-medium'
                }`}
              >
                {field.value ?? '-'}
              </span>
            </div>
          ))}
        </div>
      )}

      {actions && (
        <div
          className="flex flex-wrap items-center justify-end gap-1.5 border-t border-slate-200 dark:border-white/10 pt-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </div>
  )
}
