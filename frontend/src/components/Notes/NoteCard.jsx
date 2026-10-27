import React from 'react'
import { authenticatedFileUrl } from '../../api/client'
import { Archive, CheckSquare, Clock3, FileText, Heart, Image, Pin, Trash2 } from 'lucide-react'
import { formatDate } from '../../utils/format'

function fmtDateTime(value) {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return value
  return dt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function NoteCard({
  index,
  note,
  viewMode,
  isDragging,
  onOpen,
  onPreviewImage,
  onToggleFavorite,
  onTogglePinned,
  onArchive,
  onTrash,
  draggable,
  onDragStart,
  onDrop
}) {
  const done = note.checklist.filter((item) => item.is_checked).length
  const total = note.checklist.length
  const reminder = note.reminders[0]
  const bgColor = note.color?.bg_color || '#1e1e1e'
  const borderColor = note.color?.border_color || '#464646'
  const textColor = note.color?.text_color || '#ffffff'
  const secondaryIconColor = textColor.toLowerCase() === '#ffffff' ? '#bdbdbd' : '#64748b'

  return (
    <article
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={`note-card rounded-xl border shadow-sm transition-all duration-150 hover:shadow-md active:scale-[0.99] group ${
        isDragging ? 'opacity-55 scale-[0.98]' : ''
      } ${
        viewMode === 'list' ? 'p-3 flex gap-3 items-start' : 'p-4'
      }`}
      style={{
        animationDelay: `${Math.min(index || 0, 12) * 35}ms`,
        backgroundColor: bgColor,
        borderColor,
        color: textColor
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-2">
          <button onClick={onOpen} className="text-left w-full sm:w-auto flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">{note.title || 'Sem título'}</h3>
          </button>
          <div className="flex items-center gap-1">
            <button className="btn-ghost !px-1.5 !py-1" onClick={onToggleFavorite} title="Favoritar">
              <Heart size={15} className={note.is_favorite ? 'fill-rose-500 text-rose-500' : ''} style={note.is_favorite ? undefined : { color: textColor }} />
            </button>
            <button className="btn-ghost !px-1.5 !py-1" onClick={onTogglePinned} title="Fixar">
              <Pin size={15} className={note.is_pinned ? 'fill-brand-500 text-brand-600' : ''} style={note.is_pinned ? undefined : { color: textColor }} />
            </button>
            {!note.trashed && (
              <>
                <button className="btn-ghost !px-1.5 !py-1 opacity-80 group-hover:opacity-100" onClick={onArchive} title="Arquivar">
                  <Archive size={15} style={{ color: secondaryIconColor }} />
                </button>
                <button className="btn-ghost !px-1.5 !py-1 text-rose-600 opacity-70 group-hover:opacity-100" onClick={onTrash} title="Excluir">
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
        </div>

        {!!note.content && (
          <button onClick={onOpen} className="w-full text-left mt-2 text-sm whitespace-pre-wrap break-words line-clamp-4">
            {note.content}
          </button>
        )}

        {total > 0 && (
          <button onClick={onOpen} className="mt-3 text-left w-full">
            <p className="text-xs font-medium inline-flex items-center gap-1">
              <CheckSquare size={13} /> Checklist {done}/{total}
            </p>
            <ul className="mt-1 space-y-1">
              {note.checklist.slice(0, 3).map((item) => (
                <li key={item.id || item.position} className={`text-xs ${item.is_checked ? 'line-through opacity-60' : ''}`}>
                  {item.is_checked ? '☑' : '☐'} {item.text}
                </li>
              ))}
            </ul>
          </button>
        )}

        {!!note.labels.length && (
          <div className="flex flex-wrap gap-1 mt-3">
            {note.labels.map((label) => (
              <span key={label.id || label.name} className="px-2 py-0.5 rounded-full text-[11px] bg-black/20 border border-white/20">
                {label.name}
              </span>
            ))}
          </div>
        )}

        {!!note.attachments?.filter((a) => a.file_type === 'image').length && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {note.attachments.filter((a) => a.file_type === 'image').slice(0, 3).map((image) => (
              <button key={image.id} onClick={() => onPreviewImage(authenticatedFileUrl(image.url))} className="rounded-lg overflow-hidden border border-white/20">
                <img src={authenticatedFileUrl(image.url)} alt={image.original_name} className="w-full h-16 object-cover" />
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px]">
          {reminder && (
            <span className="inline-flex items-center gap-1"><Clock3 size={12} style={{ color: secondaryIconColor }} /> {fmtDateTime(reminder.remind_at)}</span>
          )}
          {!!note.attachments.find((a) => a.file_type === 'image') && (
            <span className="inline-flex items-center gap-1"><Image size={12} style={{ color: secondaryIconColor }} /> Imagem</span>
          )}
          {!!note.attachments.find((a) => a.file_type === 'file') && (
            <span className="inline-flex items-center gap-1"><FileText size={12} style={{ color: secondaryIconColor }} /> Arquivo</span>
          )}
          {note.archived && <span className="inline-flex items-center gap-1"><Archive size={12} style={{ color: secondaryIconColor }} /> Arquivada</span>}
          {note.trashed && <span className="inline-flex items-center gap-1"><Trash2 size={12} className="text-rose-500" /> Lixeira</span>}
        </div>

        <div className="mt-3 text-[11px]">
          <p>Criada: {formatDate(note.created_at)}</p>
          <p>Editada: {fmtDateTime(note.updated_at)}</p>
        </div>
      </div>
    </article>
  )
}
