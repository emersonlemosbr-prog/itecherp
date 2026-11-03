import ModalFrame from '../UI/ModalFrame'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { authenticatedFileUrl } from '../../api/client'
import {
  Archive,
  FileText,
  Heart,
  Image,
  Paperclip,
  Pin,
  Plus,
  Trash2,
  Undo2,
  X
} from 'lucide-react'

function toDatetimeLocal(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const offset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - offset).toISOString().slice(0, 16)
}

function fromDatetimeLocal(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export default function NoteEditor({
  note,
  colors,
  allLabels,
  onClose,
  onSave,
  onRemoveAttachment,
  onCreateLabel,
  onRestore,
  onDeletePermanent
}) {
  const imageInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const isNew = !note?.id
  const [title, setTitle] = useState(note.title || '')
  const [content, setContent] = useState(note.content || '')
  const [colorId, setColorId] = useState(note.color_id || 1)
  const [checklist, setChecklist] = useState(note.checklist || [])
  const [labels, setLabels] = useState(note.labels || [])
  const [reminderAt, setReminderAt] = useState(toDatetimeLocal(note.reminders?.[0]?.remind_at))
  const [isPinned, setIsPinned] = useState(!!note.is_pinned)
  const [isFavorite, setIsFavorite] = useState(!!note.is_favorite)
  const [isArchived, setIsArchived] = useState(!!note.archived)
  const [labelInput, setLabelInput] = useState('')
  const [pendingImages, setPendingImages] = useState([])
  const [pendingFiles, setPendingFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setTitle(note.title || '')
    setContent(note.content || '')
    setColorId(note.color_id || 1)
    setChecklist(note.checklist || [])
    setLabels(note.labels || [])
    setReminderAt(toDatetimeLocal(note.reminders?.[0]?.remind_at))
    setIsPinned(!!note.is_pinned)
    setIsFavorite(!!note.is_favorite)
    setIsArchived(!!note.archived)
    setLabelInput('')
    setPendingImages([])
    setPendingFiles([])
    setError('')
  }, [note.id])

  const payload = useMemo(() => ({
    title,
    content,
    color_id: colorId,
    checklist,
    labels,
    reminder_at: fromDatetimeLocal(reminderAt),
    is_pinned: isPinned,
    is_favorite: isFavorite,
    archived: isArchived
  }), [title, content, colorId, checklist, labels, reminderAt, isPinned, isFavorite, isArchived])

  function updateChecklist(index, next) {
    setChecklist((items) => items.map((item, i) => (i === index ? { ...item, ...next } : item)))
  }

  function addChecklistItem() {
    setChecklist((items) => [...items, { text: '', is_checked: false, position: items.length }])
  }

  function removeChecklistItem(index) {
    setChecklist((items) => items.filter((_, i) => i !== index).map((item, i) => ({ ...item, position: i })))
  }

  async function attachLabel(name) {
    const trimmed = String(name || '').trim()
    if (!trimmed) return

    const existing = allLabels.find((label) => label.name.toLowerCase() === trimmed.toLowerCase())
    const label = existing || await onCreateLabel(trimmed)
    if (!label) return

    setLabels((items) => {
      if (items.some((item) => item.id === label.id || item.name === label.name)) return items
      return [...items, label]
    })
    setLabelInput('')
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      await onSave(note.id, payload, [...pendingImages, ...pendingFiles])
      onClose()
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Erro ao salvar anotação.')
    } finally {
      setSaving(false)
    }
  }

  function handleSelectImages(fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    setPendingImages((prev) => [...prev, ...files])
  }

  function handleSelectFiles(fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    setPendingFiles((prev) => [...prev, ...files])
  }

  return (
    <ModalFrame busy={saving} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm p-3 md:p-6 overflow-y-auto" onClick={() => { if (!saving) onClose() }}>
      <div
        className="mx-auto flex w-full max-w-3xl max-h-[calc(100vh-1.5rem)] flex-col overflow-hidden rounded-[22px] border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#222225] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200/70 px-4 py-3 dark:border-white/10">
          <h3 className="font-display font-bold text-lg text-slate-900 dark:text-zinc-100">{isNew ? 'Nova anotação' : 'Editar anotação'}</h3>
          <button type="button" className="btn-ghost !px-2 !py-1.5" aria-label="Fechar anotação" onClick={() => { if (!saving) onClose() }}><X size={18} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-5">
          <div className="space-y-3">
            {!!error && <p className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 rounded-lg p-2">{error}</p>}

            <input
              className="input text-base font-semibold"
              placeholder="Título"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <textarea
              className="input min-h-28"
              placeholder="Escreva sua anotação..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />

            <div>
              <div className="flex items-center justify-between">
                <label className="label mb-0">Checklist</label>
                <button type="button" className="btn-secondary !px-2 !py-1" onClick={addChecklistItem}><Plus size={14} /> Item</button>
              </div>
              <div className="space-y-2 mt-2">
                {checklist.map((item, index) => (
                  <div key={`${index}-${item.id || 'new'}`} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!item.is_checked}
                      onChange={(e) => updateChecklist(index, { is_checked: e.target.checked })}
                    />
                    <input
                      className={`input flex-1 ${item.is_checked ? 'line-through opacity-60' : ''}`}
                      placeholder="Novo item"
                      value={item.text || ''}
                      onChange={(e) => updateChecklist(index, { text: e.target.value })}
                    />
                    <button type="button" className="btn-ghost !px-2" onClick={() => removeChecklistItem(index)}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Etiquetas</label>
              <div className="flex flex-wrap gap-1 mb-2">
                {labels.map((label) => (
                  <span key={label.id || label.name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-brand-50 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                    {label.name}
                    <button type="button" onClick={() => setLabels((items) => items.filter((item) => (item.id || item.name) !== (label.id || label.name)))}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className="input"
                  placeholder="Adicionar etiqueta"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      attachLabel(labelInput)
                    }
                  }}
                />
                <button type="button" className="btn-secondary" onClick={() => attachLabel(labelInput)}>Adicionar</button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label">Cor</label>
                <div className="flex flex-wrap gap-2">
                  {colors.map((color) => (
                    <button
                      key={color.id}
                      type="button"
                      title={color.name}
                      onClick={() => setColorId(color.id)}
                      className={`h-8 w-8 rounded-full border-2 transition-transform ${colorId === color.id ? 'scale-110 border-brand-500' : ''}`}
                      style={{ backgroundColor: color.bg_color, borderColor: color.border_color }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Lembrete</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={reminderAt}
                  onChange={(e) => setReminderAt(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="label">Anexos</label>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleSelectImages(e.target.files || [])}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.xlsx,.txt,.zip"
                multiple
                className="hidden"
                onChange={(e) => handleSelectFiles(e.target.files || [])}
              />

              <div className="flex flex-wrap gap-2 mb-3">
                <button type="button" className="btn-secondary" onClick={() => imageInputRef.current?.click()}><Image size={15} /> Adicionar imagem</button>
                <button type="button" className="btn-secondary" onClick={() => fileInputRef.current?.click()}><Paperclip size={15} /> Adicionar arquivo</button>
              </div>

              {isNew && (!!pendingImages.length || !!pendingFiles.length) && (
                <div className="space-y-2 mb-3">
                  {pendingImages.map((file, idx) => (
                    <div key={`img-${idx}-${file.name}`} className="text-sm rounded-lg bg-slate-50 dark:bg-[#2A2A2A] px-3 py-2 inline-flex items-center gap-2 mr-2 mb-2">
                      <Image size={14} /> {file.name}
                    </div>
                  ))}
                  {pendingFiles.map((file, idx) => (
                    <div key={`file-${idx}-${file.name}`} className="text-sm rounded-lg bg-slate-50 dark:bg-[#2A2A2A] px-3 py-2 inline-flex items-center gap-2 mr-2 mb-2">
                      <FileText size={14} /> {file.name}
                    </div>
                  ))}
                </div>
              )}

              {!!note.attachments?.length && (
                <div className="space-y-2">
                  {note.attachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-[#2A2A2A]">
                      <a href={authenticatedFileUrl(attachment.url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-brand-700 dark:text-brand-300 truncate">
                        {attachment.file_type === 'image' ? <Image size={14} /> : <FileText size={14} />}
                        <span className="truncate">{attachment.original_name}</span>
                      </a>
                      <button type="button" className="btn-ghost !px-2" onClick={() => onRemoveAttachment(note.id, attachment.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-[#4A4A4A]">
              <button type="button" className="btn-secondary" onClick={() => setIsFavorite((v) => !v)}>
                <Heart size={15} className={isFavorite ? 'fill-rose-500 text-rose-500' : ''} /> Favoritar
              </button>
              <button type="button" className="btn-secondary" onClick={() => setIsPinned((v) => !v)}>
                <Pin size={15} className={isPinned ? 'fill-brand-500 text-brand-600' : ''} /> Fixar
              </button>
              <button type="button" className="btn-secondary" onClick={() => setIsArchived((v) => !v)}>
                <Archive size={15} /> {isArchived ? 'Desarquivar' : 'Arquivar'}
              </button>
              {!isNew && !note.trashed && (
                <button type="button" className="btn-danger" onClick={() => onSave(note.id, { ...payload, trashed: true }, [])}>
                  <Trash2 size={15} /> Excluir
                </button>
              )}
              {!isNew && note.trashed && (
                <>
                  <button type="button" className="btn-secondary" onClick={() => onRestore(note.id)}>
                    <Undo2 size={15} /> Restaurar
                  </button>
                  <button type="button" className="btn-danger" onClick={() => onDeletePermanent(note.id)}>
                    <Trash2 size={15} /> Excluir permanente
                  </button>
                </>
              )}
            </div>

            {!isNew && note.trashed && <p className="text-xs text-amber-600 dark:text-amber-300">Notas na lixeira são removidas automaticamente após 30 dias.</p>}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#4A4A4A]">
              <button type="button" className="btn-secondary" onClick={() => { if (!saving) onClose() }} disabled={saving}>Cancelar</button>
              <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      </div>
    </ModalFrame>
  )
}
