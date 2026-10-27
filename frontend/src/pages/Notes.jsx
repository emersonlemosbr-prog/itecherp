import { confirmRecordDeletion } from '../utils/confirmDeletion'
import { useSettings } from '../context/SettingsContext'
import ModalFrame from '../components/UI/ModalFrame'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Grid2x2,
  List,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  BellRing,
  Trash2
} from 'lucide-react'
import api from '../api/client'
import NotesSidebar from '../components/Notes/NotesSidebar'
import NotesFiltersPanel from '../components/Notes/NotesFiltersPanel'
import NoteCard from '../components/Notes/NoteCard'
import NoteEditor from '../components/Notes/NoteEditor'



export default function Notes() {
  const { settings } = useSettings()
  const [section, setSection] = useState('notes')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('newest')
  const [labelId, setLabelId] = useState(null)
  const [viewMode, setViewMode] = useState('grid')
  const [showFilters, setShowFilters] = useState(false)

  const [notes, setNotes] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)

  const [meta, setMeta] = useState({ colors: [], labels: [], counts: {} })
  const [editingNote, setEditingNote] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [previewImage, setPreviewImage] = useState('')
  const [draggingId, setDraggingId] = useState(null)
  const [emptyingTrash, setEmptyingTrash] = useState(false)

  const sectionLabel = useMemo(() => {
    if (section === 'reminders') return 'Lembretes'
    if (section === 'favorites') return 'Favoritas'
    if (section === 'archived') return 'Arquivadas'
    if (section === 'trash') return 'Lixeira'
    return 'Notas'
  }, [section])

  const isNoteVisibleInSection = useCallback((note, targetSection) => {
    if (!note) return false
    if (targetSection === 'trash') return !!note.trashed
    if (targetSection === 'archived') return !!note.archived && !note.trashed
    if (targetSection === 'favorites') return !!note.is_favorite && !note.trashed
    if (targetSection === 'reminders') return !note.archived && !note.trashed && (note.reminders || []).some((r) => !r.done)
    return !note.archived && !note.trashed
  }, [])

  const applyUpdatedNoteInCurrentList = useCallback((updatedNote) => {
    setNotes((prev) => {
      const without = prev.filter((n) => n.id !== updatedNote.id)
      if (!isNoteVisibleInSection(updatedNote, section)) return without
      return [updatedNote, ...without]
    })
  }, [section, isNoteVisibleInSection])

  const refreshMeta = useCallback(async () => {
    const { data } = await api.get('/notes/meta')
    setMeta(data)
  }, [])

  const loadNotes = useCallback(async ({ reset = false } = {}) => {
    setLoading(true)
    try {
      const nextPage = reset ? 1 : page
      const { data } = await api.get('/notes', {
        params: {
          section,
          q: q || undefined,
          sort,
          label_id: labelId || undefined,
          page: nextPage,
          pageSize: settings.system.page_size
        }
      })

      setNotes((prev) => (reset ? data.notes : [...prev, ...data.notes]))
      setHasMore(data.pagination?.hasMore)
      setPage(data.pagination?.page + 1)
    } finally {
      setLoading(false)
    }
  }, [section, q, sort, labelId, page])

  const fetchNotifications = useCallback(async () => {
    if (!settings.system.notifications) { setNotifications([]); return }
    const { data } = await api.get('/notes/notifications')
    if (data.length && settings.system.sounds) { try { const audio = new (window.AudioContext || window.webkitAudioContext)(); const oscillator = audio.createOscillator(); const gain = audio.createGain(); gain.gain.value = 0.05; oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + 0.15); oscillator.onended = () => audio.close() } catch {} }
    setNotifications(data)
  }, [settings.system.notifications, settings.system.sounds])

  const refreshAll = useCallback(async () => {
    setPage(1)
    await Promise.all([refreshMeta(), loadNotes({ reset: true }), fetchNotifications()])
  }, [refreshMeta, loadNotes, fetchNotifications])

  useEffect(() => {
    refreshMeta()
    fetchNotifications()
  }, [refreshMeta, fetchNotifications])

  useEffect(() => {
    const timer = setInterval(() => {
      fetchNotifications()
    }, 30000)

    return () => clearInterval(timer)
  }, [fetchNotifications])

  useEffect(() => {
    setPage(1)
    const timer = setTimeout(() => {
      loadNotes({ reset: true })
    }, 250)
    return () => clearTimeout(timer)
  }, [section, q, sort, labelId])

  async function handleCreateNote() {
    setEditingNote({
      id: null,
      title: '',
      content: '',
      color_id: meta.colors?.[0]?.id || 1,
      checklist: [],
      labels: [],
      reminders: [],
      attachments: [],
      is_pinned: false,
      is_favorite: false,
      archived: false,
      trashed: false
    })
  }

  async function patchNote(noteId, payload) {
    const { data } = await api.put(`/notes/${noteId}`, payload)
    applyUpdatedNoteInCurrentList(data)
    setEditingNote((prev) => (prev?.id === noteId ? data : prev))
    refreshMeta()
    return data
  }

  async function saveNote(noteId, payload, files = []) {
    let savedNote = null
    if (noteId) {
      const { data } = await api.put(`/notes/${noteId}`, payload)
      savedNote = data
    } else {
      const { data } = await api.post('/notes', payload)
      savedNote = data
    }

    if (files.length) {
      const fd = new FormData()
      files.forEach((file) => fd.append('files', file))
      await api.post(`/notes/${savedNote.id}/attachments`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
    }

    try {
      const { data } = await api.get('/notes', {
        params: { section, q: q || undefined, sort, label_id: labelId || undefined, page: 1, pageSize: settings.system.page_size }
      })
      setNotes(data.notes)
      setHasMore(data.pagination?.hasMore)
      setPage(2)
    } catch (_err) {
      // Fallback: se a recarga falhar, mantém a nota já salva visível sem bloquear o usuário.
      setNotes((prev) => {
        const idx = prev.findIndex((item) => item.id === savedNote.id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = { ...next[idx], ...savedNote }
          return next
        }
        return [savedNote, ...prev]
      })
    }

    if (savedNote) {
      applyUpdatedNoteInCurrentList(savedNote)
    }

    setEditingNote(null)
    try {
      await refreshMeta()
    } catch (_err) {
      // Nao bloqueia o usuario se a atualizacao de metadados falhar apos salvar.
    }
  }

  async function moveToTrash(noteId) {
    await api.delete(`/notes/${noteId}`)
    setNotes((prev) => prev.filter((note) => note.id !== noteId))
    if (editingNote?.id === noteId) setEditingNote(null)
    await refreshMeta()
  }

  async function restoreNote(noteId) {
    const { data } = await api.post(`/notes/${noteId}/restore`)
    applyUpdatedNoteInCurrentList(data)
    if (editingNote?.id === noteId) setEditingNote(null)
    await refreshMeta()
  }

  async function deletePermanent(noteId) {
    if (!confirmRecordDeletion('Excluir permanentemente esta nota?')) return
    await api.delete(`/notes/${noteId}?force=true`)
    setNotes((prev) => prev.filter((note) => note.id !== noteId))
    if (editingNote?.id === noteId) setEditingNote(null)
    await refreshMeta()
  }

  async function emptyTrash() {
    if (!confirm('Esvaziar a lixeira? Essa ação remove permanentemente todas as anotações da lixeira.')) return

    setEmptyingTrash(true)
    try {
      await api.delete('/notes/trash/empty')
      if (section === 'trash') {
        setNotes([])
        setHasMore(false)
      } else {
        setNotes((prev) => prev.filter((note) => !note.trashed))
      }
      await refreshMeta()
    } finally {
      setEmptyingTrash(false)
    }
  }

  async function removeAttachment(noteId, attachmentId) {
    await api.delete(`/notes/${noteId}/attachments/${attachmentId}`)
    await patchNote(noteId, {})
  }

  async function createLabel(name) {
    const { data } = await api.post('/notes/labels', { name })
    await refreshMeta()
    return data
  }

  async function ackReminder(reminderId) {
    await api.post(`/notes/reminders/${reminderId}/ack`)
    setNotifications((items) => items.filter((item) => item.reminder_id !== reminderId))
  }

  async function handleDrop(draggedId, targetId) {
    if (!draggedId || !targetId || draggedId === targetId) return

    const current = [...notes]
    const from = current.findIndex((note) => note.id === draggedId)
    const to = current.findIndex((note) => note.id === targetId)
    if (from < 0 || to < 0) return

    const [moved] = current.splice(from, 1)
    current.splice(to, 0, moved)
    setNotes(current)

    await api.post('/notes/reorder', { ids: current.map((note) => note.id) })
    setDraggingId(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-bold text-xl">Anotações</h2>
          <p className="text-sm text-slate-400">Central de notas estilo Keep integrada ao sistema da loja</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-primary" onClick={handleCreateNote}><Plus size={16} /> Nova anotação</button>
        </div>
      </div>

      {!!notifications.length && (
        <div className="card p-3">
          <div className="flex items-center gap-2 mb-2 text-amber-600 dark:text-amber-300">
            <BellRing size={16} />
            <p className="font-semibold text-sm">Lembretes vencidos</p>
          </div>
          <div className="space-y-2">
            {notifications.map((item) => (
              <div key={item.reminder_id} className="flex items-center justify-between gap-3 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{item.title || 'Nota sem título'}</p>
                  <p className="text-xs text-slate-500">{new Date(item.remind_at).toLocaleString('pt-BR')}</p>
                </div>
                <button className="btn-secondary" onClick={() => ackReminder(item.reminder_id)}>Dispensar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[224px_1fr] gap-4">
        <NotesSidebar section={section} onSectionChange={setSection} counts={meta.counts} />

        <div className="space-y-3 min-w-0">
          <div className="card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-0 basis-56">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="input pl-11"
                  placeholder="Pesquisar por título, conteúdo, etiqueta ou checklist..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <button className="btn-secondary" onClick={refreshAll}><RefreshCw size={15} /> Atualizar</button>
              <button className="btn-secondary" onClick={() => setShowFilters((v) => !v)}><SlidersHorizontal size={15} /> Filtros</button>
              <button
                className="btn-secondary"
                onClick={() => setViewMode((mode) => (mode === 'grid' ? 'list' : 'grid'))}
              >
                {viewMode === 'grid' ? <List size={15} /> : <Grid2x2 size={15} />}
                {viewMode === 'grid' ? 'Lista' : 'Grade'}
              </button>
            </div>
          </div>

          {showFilters && (
            <NotesFiltersPanel
              sort={sort}
              onSortChange={setSort}
              labelId={labelId}
              onLabelChange={setLabelId}
              labels={meta.labels || []}
            />
          )}

          <div className="flex items-center justify-between px-1">
            <p className="text-sm text-slate-500">Seção: <span className="font-semibold text-slate-700 dark:text-slate-200">{sectionLabel}</span></p>
            <div className="flex items-center gap-2">
              {section === 'trash' && (
                <button className="btn-danger" onClick={emptyTrash} disabled={emptyingTrash || notes.length === 0}>
                  <Trash2 size={14} /> {emptyingTrash ? 'Esvaziando...' : 'Esvaziar lixeira'}
                </button>
              )}
              <p className="text-xs text-slate-400">Auto-save ativo</p>
            </div>
          </div>

          <div className={viewMode === 'grid' ? 'grid sm:grid-cols-2 xl:grid-cols-3 gap-3' : 'space-y-3'}>
            {notes.map((note, index) => (
              <NoteCard
                key={note.id}
                index={index}
                note={note}
                viewMode={viewMode}
                isDragging={draggingId === note.id}
                onOpen={() => setEditingNote(note)}
                onPreviewImage={setPreviewImage}
                onToggleFavorite={() => patchNote(note.id, { is_favorite: !note.is_favorite })}
                onTogglePinned={() => patchNote(note.id, { is_pinned: !note.is_pinned })}
                onArchive={() => patchNote(note.id, { archived: !note.archived })}
                onTrash={() => moveToTrash(note.id)}
                draggable={section !== 'trash'}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', String(note.id))
                  setDraggingId(note.id)
                }}
                onDrop={(e) => {
                  const draggedId = Number(e.dataTransfer.getData('text/plain'))
                  handleDrop(draggedId, note.id)
                }}
              />
            ))}
          </div>

          {!loading && notes.length === 0 && (
            <div className="card p-8 text-center text-slate-400">
              <p className="font-medium">Nenhuma anotação em {sectionLabel.toLowerCase()}.</p>
              <p className="text-sm mt-1">Crie uma nova anotação para começar.</p>
            </div>
          )}

          {hasMore && (
            <div className="flex justify-center">
              <button className="btn-secondary" onClick={() => loadNotes({ reset: false })} disabled={loading}>
                {loading ? 'Carregando...' : 'Carregar mais'}
              </button>
            </div>
          )}
        </div>
      </div>

      {editingNote && (
        <NoteEditor
          note={editingNote}
          colors={meta.colors || []}
          allLabels={meta.labels || []}
          onClose={() => setEditingNote(null)}
          onSave={saveNote}
          onRemoveAttachment={removeAttachment}
          onCreateLabel={createLabel}
          onRestore={restoreNote}
          onDeletePermanent={deletePermanent}
        />
      )}

      {!!previewImage && (
        <ModalFrame className="photo-lightbox fixed inset-0 z-50 bg-black/80 p-4 flex items-center justify-center" onClick={() => setPreviewImage('')}>
          <button type="button" aria-label="Fechar foto" className="absolute right-4 top-4 text-white" onClick={() => setPreviewImage('')}>Fechar</button>
          <img src={previewImage} alt="Preview" className="max-h-[92vh] max-w-[92vw] object-contain rounded-xl" />
        </ModalFrame>
      )}
    </div>
  )
}
