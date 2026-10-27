const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { logAction } = require('../utils/audit');

const router = express.Router();
router.use(authenticate);

let notesUploadBase = process.env.ITECH_UPLOAD_PATH || path.join(__dirname, '..', 'uploads');
let UPLOAD_ROOT = path.join(notesUploadBase, 'notes');
try {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
} catch (_) {
  notesUploadBase = path.join(__dirname, '..', 'uploads');
  UPLOAD_ROOT = path.join(notesUploadBase, 'notes');
  try { fs.mkdirSync(UPLOAD_ROOT, { recursive: true }); } catch (__) {}
}

const ALLOWED_FILE_EXT = new Set(['.pdf', '.docx', '.xlsx', '.txt', '.zip']);
const ALLOWED_FILE_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed'
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_ROOT),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeName}`;
    cb(null, unique);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 10 }
});

function purgeExpiredTrash(userId) {
  const expired = db.prepare(`
    SELECT n.id, a.stored_name
    FROM notes n
    LEFT JOIN note_attachments a ON a.note_id = n.id
    WHERE n.user_id = ?
      AND n.trashed = 1
      AND n.deleted_at IS NOT NULL
      AND datetime(n.deleted_at, '+30 days') <= datetime('now')
  `).all(userId);

  const noteIds = [...new Set(expired.map((row) => row.id))];
  expired.forEach((row) => {
    if (!row.stored_name) return;
    const fullPath = path.join(UPLOAD_ROOT, row.stored_name);
    if (fs.existsSync(fullPath)) {
      try { fs.unlinkSync(fullPath); } catch (_err) {}
    }
  });

  if (noteIds.length > 0) {
    const stmt = db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?');
    const tx = db.transaction((ids) => {
      ids.forEach((id) => stmt.run(id, userId));
    });
    tx(noteIds);
  }
}

function normalizeBoolean(value) {
  return value ? 1 : 0;
}

function getNoteById(noteId, userId) {
  return db.prepare(`
    SELECT n.*, c.name as color_name, c.bg_color, c.border_color, c.text_color,
      CASE WHEN fn.id IS NULL THEN 0 ELSE 1 END AS is_favorite,
      CASE WHEN pn.id IS NULL THEN 0 ELSE 1 END AS is_pinned,
      COALESCE(pn.pinned_order, 0) AS pinned_order
    FROM notes n
    LEFT JOIN note_colors c ON c.id = n.color_id
    LEFT JOIN favorite_notes fn ON fn.note_id = n.id AND fn.user_id = n.user_id
    LEFT JOIN pinned_notes pn ON pn.note_id = n.id AND pn.user_id = n.user_id
    WHERE n.id = ? AND n.user_id = ?
  `).get(noteId, userId);
}

function hydrateNotes(notes) {
  if (!notes.length) return [];
  const ids = notes.map((n) => n.id);
  const placeholders = ids.map(() => '?').join(',');

  const checklists = db.prepare(`
    SELECT * FROM note_checklists
    WHERE note_id IN (${placeholders})
    ORDER BY position ASC, id ASC
  `).all(...ids);

  const labels = db.prepare(`
    SELECT nl.note_id, l.id, l.name
    FROM note_labels nl
    JOIN labels l ON l.id = nl.label_id
    WHERE nl.note_id IN (${placeholders})
    ORDER BY l.name ASC
  `).all(...ids);

  const attachments = db.prepare(`
    SELECT * FROM note_attachments
    WHERE note_id IN (${placeholders})
    ORDER BY created_at DESC
  `).all(...ids);

  const reminders = db.prepare(`
    SELECT * FROM note_reminders
    WHERE note_id IN (${placeholders})
    ORDER BY remind_at ASC
  `).all(...ids);

  const checklistByNote = new Map();
  checklists.forEach((row) => {
    if (!checklistByNote.has(row.note_id)) checklistByNote.set(row.note_id, []);
    checklistByNote.get(row.note_id).push({
      id: row.id,
      text: row.item_text,
      is_checked: !!row.is_checked,
      position: row.position,
      created_at: row.created_at,
      updated_at: row.updated_at
    });
  });

  const labelsByNote = new Map();
  labels.forEach((row) => {
    if (!labelsByNote.has(row.note_id)) labelsByNote.set(row.note_id, []);
    labelsByNote.get(row.note_id).push({ id: row.id, name: row.name });
  });

  const attachmentsByNote = new Map();
  attachments.forEach((row) => {
    if (!attachmentsByNote.has(row.note_id)) attachmentsByNote.set(row.note_id, []);
    attachmentsByNote.get(row.note_id).push({
      id: row.id,
      file_type: row.file_type,
      original_name: row.original_name,
      mime_type: row.mime_type,
      file_size: row.file_size,
      created_at: row.created_at,
      url: `/api/notes/attachments/${row.id}`
    });
  });

  const remindersByNote = new Map();
  reminders.forEach((row) => {
    if (!remindersByNote.has(row.note_id)) remindersByNote.set(row.note_id, []);
    remindersByNote.get(row.note_id).push({
      id: row.id,
      remind_at: row.remind_at,
      done: !!row.done,
      notified_at: row.notified_at,
      created_at: row.created_at,
      updated_at: row.updated_at
    });
  });

  return notes.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    title: row.title || '',
    content: row.content || '',
    color_id: row.color_id || 1,
    color: {
      id: row.color_id || 1,
      name: row.color_name || 'Cinza escuro (Padrão)',
      bg_color: row.bg_color || '#1e1e1e',
      border_color: row.border_color || '#464646',
      text_color: row.text_color || '#ffffff'
    },
    archived: !!row.archived,
    trashed: !!row.trashed,
    is_favorite: !!row.is_favorite,
    is_pinned: !!row.is_pinned,
    pinned_order: row.pinned_order || 0,
    position: row.position || 0,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    checklist: checklistByNote.get(row.id) || [],
    labels: labelsByNote.get(row.id) || [],
    attachments: attachmentsByNote.get(row.id) || [],
    reminders: remindersByNote.get(row.id) || []
  }));
}

function syncChecklist(noteId, checklist) {
  db.prepare('DELETE FROM note_checklists WHERE note_id = ?').run(noteId);
  if (!Array.isArray(checklist) || checklist.length === 0) return;

  const insert = db.prepare(`
    INSERT INTO note_checklists (note_id, item_text, is_checked, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  checklist.forEach((item, index) => {
    const text = String(item?.text || '').trim();
    if (!text) return;
    insert.run(noteId, text, normalizeBoolean(item?.is_checked), index);
  });
}

function ensureLabel(userId, rawName) {
  const name = String(rawName || '').trim();
  if (!name) return null;

  const existing = db.prepare('SELECT id, name FROM labels WHERE user_id = ? AND name = ?').get(userId, name);
  if (existing) return existing;

  const info = db.prepare('INSERT INTO labels (user_id, name) VALUES (?, ?)').run(userId, name);
  return { id: info.lastInsertRowid, name };
}

function syncLabels(noteId, userId, labels) {
  db.prepare('DELETE FROM note_labels WHERE note_id = ?').run(noteId);
  if (!Array.isArray(labels) || labels.length === 0) return;

  const insert = db.prepare('INSERT OR IGNORE INTO note_labels (note_id, label_id) VALUES (?, ?)');
  labels.forEach((label) => {
    if (!label) return;
    let labelId = null;
    if (typeof label === 'number') {
      const ownLabel = db.prepare('SELECT id FROM labels WHERE id = ? AND user_id = ?').get(label, userId);
      labelId = ownLabel ? ownLabel.id : null;
    } else if (typeof label === 'object' && typeof label.id === 'number') {
      const ownLabel = db.prepare('SELECT id FROM labels WHERE id = ? AND user_id = ?').get(label.id, userId);
      labelId = ownLabel ? ownLabel.id : null;
    } else {
      const created = ensureLabel(userId, typeof label === 'object' ? label.name : label);
      labelId = created ? created.id : null;
    }

    if (labelId) insert.run(noteId, labelId);
  });
}

function syncReminder(noteId, reminderAt) {
  if (!reminderAt) {
    db.prepare('DELETE FROM note_reminders WHERE note_id = ?').run(noteId);
    return;
  }

  const existing = db.prepare('SELECT id FROM note_reminders WHERE note_id = ? ORDER BY id ASC LIMIT 1').get(noteId);
  if (existing) {
    db.prepare(`
      UPDATE note_reminders
      SET remind_at = ?, done = 0, notified_at = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(reminderAt, existing.id);
    db.prepare('DELETE FROM note_reminders WHERE note_id = ? AND id != ?').run(noteId, existing.id);
  } else {
    db.prepare(`
      INSERT INTO note_reminders (note_id, remind_at, done, created_at, updated_at)
      VALUES (?, ?, 0, datetime('now'), datetime('now'))
    `).run(noteId, reminderAt);
  }
}

function setFavorite(noteId, userId, enabled) {
  if (enabled) {
    db.prepare('INSERT OR IGNORE INTO favorite_notes (note_id, user_id) VALUES (?, ?)').run(noteId, userId);
  } else {
    db.prepare('DELETE FROM favorite_notes WHERE note_id = ? AND user_id = ?').run(noteId, userId);
  }
}

function setPinned(noteId, userId, enabled) {
  if (enabled) {
    const maxRow = db.prepare('SELECT COALESCE(MAX(pinned_order), 0) as max_order FROM pinned_notes WHERE user_id = ?').get(userId);
    db.prepare('INSERT OR REPLACE INTO pinned_notes (note_id, user_id, pinned_order) VALUES (?, ?, ?)')
      .run(noteId, userId, (maxRow?.max_order || 0) + 1);
  } else {
    db.prepare('DELETE FROM pinned_notes WHERE note_id = ? AND user_id = ?').run(noteId, userId);
  }
}

function removeNoteFiles(noteId) {
  const files = db.prepare('SELECT stored_name FROM note_attachments WHERE note_id = ?').all(noteId);
  files.forEach((file) => {
    const fullPath = path.join(UPLOAD_ROOT, file.stored_name);
    if (fs.existsSync(fullPath)) {
      try { fs.unlinkSync(fullPath); } catch (_err) {}
    }
  });
}

function buildOrder(sort) {
  switch (sort) {
    case 'oldest':
      return 'n.created_at ASC, n.id ASC';
    case 'alphabetical':
      return 'LOWER(COALESCE(n.title, "")) ASC, n.updated_at DESC';
    case 'color':
      return 'LOWER(COALESCE(c.name, "")) ASC, n.updated_at DESC';
    case 'favorites':
      return 'CASE WHEN fn.id IS NULL THEN 1 ELSE 0 END ASC, n.updated_at DESC';
    case 'pinned':
      return 'CASE WHEN pn.id IS NULL THEN 1 ELSE 0 END ASC, pn.pinned_order ASC, n.updated_at DESC';
    case 'newest':
    default:
      return 'n.position DESC, n.updated_at DESC, n.id DESC';
  }
}

router.get('/meta', (req, res) => {
  purgeExpiredTrash(req.user.id);

  const colors = db.prepare('SELECT * FROM note_colors ORDER BY id ASC').all();
  const labels = db.prepare('SELECT id, name FROM labels WHERE user_id = ? ORDER BY name ASC').all(req.user.id);

  const counts = {
    notes: db.prepare('SELECT COUNT(*) as total FROM notes WHERE user_id = ? AND archived = 0 AND trashed = 0').get(req.user.id).total,
    reminders: db.prepare(`
      SELECT COUNT(DISTINCT n.id) as total
      FROM notes n
      JOIN note_reminders nr ON nr.note_id = n.id
      WHERE n.user_id = ? AND n.archived = 0 AND n.trashed = 0 AND nr.done = 0
    `).get(req.user.id).total,
    favorites: db.prepare(`
      SELECT COUNT(*) as total FROM favorite_notes fn
      JOIN notes n ON n.id = fn.note_id
      WHERE fn.user_id = ? AND n.trashed = 0
    `).get(req.user.id).total,
    archived: db.prepare('SELECT COUNT(*) as total FROM notes WHERE user_id = ? AND archived = 1 AND trashed = 0').get(req.user.id).total,
    trash: db.prepare('SELECT COUNT(*) as total FROM notes WHERE user_id = ? AND trashed = 1').get(req.user.id).total
  };

  res.json({ colors, labels, counts });
});

router.get('/', (req, res) => {
  purgeExpiredTrash(req.user.id);

  const section = String(req.query.section || 'notes');
  const q = String(req.query.search || req.query.q || '').trim();
  const sort = String(req.query.sort || 'newest');
  const labelId = req.query.label ? Number(req.query.label) : (req.query.label_id ? Number(req.query.label_id) : null);
  const archivedFilter = typeof req.query.archived === 'string' ? req.query.archived === 'true' : null;
  const favoriteFilter = typeof req.query.favorite === 'string' ? req.query.favorite === 'true' : null;
  const pinnedFilter = typeof req.query.pinned === 'string' ? req.query.pinned === 'true' : null;
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 24), 1), 100);
  const offset = (page - 1) * pageSize;

  let whereSql = 'WHERE n.user_id = ?';
  const params = [req.user.id];

  if (section === 'favorites') {
    whereSql += ' AND fn.id IS NOT NULL AND n.trashed = 0';
  } else if (section === 'archived') {
    whereSql += ' AND n.archived = 1 AND n.trashed = 0';
  } else if (section === 'trash') {
    whereSql += ' AND n.trashed = 1';
  } else if (section === 'reminders') {
    whereSql += ' AND n.archived = 0 AND n.trashed = 0 AND nr_filter.id IS NOT NULL';
  } else {
    whereSql += ' AND n.archived = 0 AND n.trashed = 0';
  }

  if (archivedFilter !== null) {
    whereSql += ' AND n.archived = ?';
    params.push(archivedFilter ? 1 : 0);
  }
  if (favoriteFilter === true) {
    whereSql += ' AND fn.id IS NOT NULL';
  }
  if (favoriteFilter === false) {
    whereSql += ' AND fn.id IS NULL';
  }
  if (pinnedFilter === true) {
    whereSql += ' AND pn.id IS NOT NULL';
  }
  if (pinnedFilter === false) {
    whereSql += ' AND pn.id IS NULL';
  }

  if (labelId) {
    whereSql += ' AND EXISTS (SELECT 1 FROM note_labels nlf WHERE nlf.note_id = n.id AND nlf.label_id = ?)';
    params.push(labelId);
  }

  if (q) {
    whereSql += `
      AND (
        COALESCE(n.title, '') LIKE ?
        OR COALESCE(n.content, '') LIKE ?
        OR EXISTS (
          SELECT 1 FROM note_checklists nc
          WHERE nc.note_id = n.id AND nc.item_text LIKE ?
        )
        OR EXISTS (
          SELECT 1 FROM note_labels nls
          JOIN labels ls ON ls.id = nls.label_id
          WHERE nls.note_id = n.id AND ls.name LIKE ?
        )
      )
    `;
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  const baseSql = `
    FROM notes n
    LEFT JOIN note_colors c ON c.id = n.color_id
    LEFT JOIN favorite_notes fn ON fn.note_id = n.id AND fn.user_id = n.user_id
    LEFT JOIN pinned_notes pn ON pn.note_id = n.id AND pn.user_id = n.user_id
    LEFT JOIN note_reminders nr_filter ON nr_filter.note_id = n.id AND nr_filter.done = 0
    ${whereSql}
  `;

  const total = db.prepare(`SELECT COUNT(DISTINCT n.id) as total ${baseSql}`).get(...params).total;

  const orderBy = buildOrder(sort);
  const rows = db.prepare(`
    SELECT DISTINCT n.*, c.name as color_name, c.bg_color, c.border_color, c.text_color,
      CASE WHEN fn.id IS NULL THEN 0 ELSE 1 END AS is_favorite,
      CASE WHEN pn.id IS NULL THEN 0 ELSE 1 END AS is_pinned,
      COALESCE(pn.pinned_order, 0) AS pinned_order
    ${baseSql}
    ORDER BY CASE WHEN pn.id IS NULL THEN 1 ELSE 0 END ASC,
      CASE WHEN pn.id IS NULL THEN 999999 ELSE pn.pinned_order END ASC,
      ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  res.json({
    notes: hydrateNotes(rows),
    pagination: {
      total,
      page,
      pageSize,
      hasMore: offset + rows.length < total
    }
  });
});

router.get('/notifications', (req, res) => {
  const rows = db.prepare(`
    SELECT nr.id as reminder_id, nr.remind_at, n.id as note_id, n.title, n.content
    FROM note_reminders nr
    JOIN notes n ON n.id = nr.note_id
    WHERE n.user_id = ?
      AND n.trashed = 0
      AND nr.done = 0
      AND nr.notified_at IS NULL
      AND datetime(nr.remind_at) <= datetime('now')
    ORDER BY nr.remind_at ASC
    LIMIT 20
  `).all(req.user.id);

  res.json(rows);
});

router.post('/reminders/:id/ack', (req, res) => {
  const row = db.prepare(`
    SELECT nr.id
    FROM note_reminders nr
    JOIN notes n ON n.id = nr.note_id
    WHERE nr.id = ? AND n.user_id = ?
  `).get(req.params.id, req.user.id);

  if (!row) return res.status(404).json({ error: 'Lembrete não encontrado.' });

  db.prepare('UPDATE note_reminders SET notified_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/labels', (req, res) => {
  const label = ensureLabel(req.user.id, req.body?.name);
  if (!label) return res.status(400).json({ error: 'Nome da etiqueta é obrigatório.' });
  res.status(201).json(label);
});

router.delete('/labels/:id', (req, res) => {
  const ownLabel = db.prepare('SELECT id FROM labels WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!ownLabel) return res.status(404).json({ error: 'Etiqueta não encontrada.' });

  db.prepare('DELETE FROM labels WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

router.delete('/trash/empty', (req, res) => {
  const trashedNotes = db.prepare('SELECT id FROM notes WHERE user_id = ? AND trashed = 1').all(req.user.id);
  if (!trashedNotes.length) {
    return res.json({ success: true, deleted_count: 0 });
  }

  trashedNotes.forEach((note) => removeNoteFiles(note.id));

  const info = db.prepare('DELETE FROM notes WHERE user_id = ? AND trashed = 1').run(req.user.id);
  logAction({ user: req.user, action: 'empty_trash_notes', recordType: 'note', details: { deleted_count: info.changes } });

  return res.json({ success: true, deleted_count: info.changes });
});

router.get('/attachments/:attachmentId', (req, res) => {
  const attachment = db.prepare(`
    SELECT a.*
    FROM note_attachments a
    JOIN notes n ON n.id = a.note_id
    WHERE a.id = ? AND n.user_id = ?
  `).get(req.params.attachmentId, req.user.id);

  if (!attachment) return res.status(404).json({ error: 'Anexo não encontrado.' });
  return res.sendFile(attachment.stored_name, {
    root: UPLOAD_ROOT,
    headers: { 'Content-Type': attachment.mime_type || 'application/octet-stream' },
  });
});

router.get('/:id', (req, res) => {
  const note = getNoteById(req.params.id, req.user.id);
  if (!note) return res.status(404).json({ error: 'Nota não encontrada.' });
  res.json(hydrateNotes([note])[0]);
});

router.post('/', (req, res) => {
  const {
    title,
    content,
    color_id,
    checklist,
    labels,
    reminder_at,
    archived,
    trashed,
    is_favorite,
    is_pinned
  } = req.body || {};

  const tx = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO notes (user_id, title, content, color_id, archived, trashed, deleted_at, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      req.user.id,
      title || '',
      content || '',
      color_id || 1,
      normalizeBoolean(archived),
      normalizeBoolean(trashed),
      trashed ? new Date().toISOString() : null,
      Date.now()
    );

    const noteId = info.lastInsertRowid;
    syncChecklist(noteId, checklist);
    syncLabels(noteId, req.user.id, labels);
    syncReminder(noteId, reminder_at || null);
    setFavorite(noteId, req.user.id, !!is_favorite);
    setPinned(noteId, req.user.id, !!is_pinned);

    return noteId;
  });

  const noteId = tx();
  logAction({ user: req.user, action: 'create_note', recordType: 'note', recordId: noteId });

  const note = hydrateNotes([getNoteById(noteId, req.user.id)])[0];
  res.status(201).json(note);
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Nota não encontrada.' });

  const {
    title,
    content,
    color_id,
    checklist,
    labels,
    reminder_at,
    archived,
    trashed,
    is_favorite,
    is_pinned
  } = req.body || {};

  const shouldTrash = typeof trashed === 'boolean' ? trashed : !!existing.trashed;

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE notes
      SET title = ?,
          content = ?,
          color_id = ?,
          archived = ?,
          trashed = ?,
          deleted_at = ?,
          updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(
      title ?? existing.title,
      content ?? existing.content,
      color_id || existing.color_id || 1,
      typeof archived === 'boolean' ? normalizeBoolean(archived) : existing.archived,
      normalizeBoolean(shouldTrash),
      shouldTrash ? (existing.deleted_at || new Date().toISOString()) : null,
      req.params.id,
      req.user.id
    );

    if (Array.isArray(checklist)) syncChecklist(existing.id, checklist);
    if (Array.isArray(labels)) syncLabels(existing.id, req.user.id, labels);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'reminder_at')) syncReminder(existing.id, reminder_at || null);
    if (typeof is_favorite === 'boolean') setFavorite(existing.id, req.user.id, is_favorite);
    if (typeof is_pinned === 'boolean') setPinned(existing.id, req.user.id, is_pinned);
  });

  tx();
  logAction({ user: req.user, action: 'update_note', recordType: 'note', recordId: req.params.id });

  const note = hydrateNotes([getNoteById(req.params.id, req.user.id)])[0];
  res.json(note);
});

router.post('/:id/reorder', (req, res) => {
  const { position } = req.body || {};
  const own = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!own) return res.status(404).json({ error: 'Nota não encontrada.' });

  db.prepare('UPDATE notes SET position = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?')
    .run(Number(position || Date.now()), req.params.id, req.user.id);
  res.json({ success: true });
});

router.post('/reorder', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: 'Lista de IDs inválida.' });

  const tx = db.transaction((list) => {
    const stmt = db.prepare('UPDATE notes SET position = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?');
    const base = Date.now();
    list.forEach((id, index) => stmt.run(base - index, id, req.user.id));
  });

  tx(ids);
  res.json({ success: true });
});

router.post('/:id/attachments', upload.array('files', 10), (req, res) => {
  const note = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!note) {
    (req.files || []).forEach((file) => {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    });
    return res.status(404).json({ error: 'Nota não encontrada.' });
  }

  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

  const insert = db.prepare(`
    INSERT INTO note_attachments (note_id, file_type, original_name, stored_name, mime_type, file_size)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertedIds = [];
  files.forEach((file) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isImage = (file.mimetype || '').startsWith('image/');
    const isAllowedFile = ALLOWED_FILE_MIME.has(file.mimetype) || ALLOWED_FILE_EXT.has(ext);

    if (!isImage && !isAllowedFile) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return;
    }

    const info = insert.run(
      req.params.id,
      isImage ? 'image' : 'file',
      file.originalname,
      path.basename(file.filename),
      file.mimetype,
      file.size
    );
    insertedIds.push(info.lastInsertRowid);
  });

  db.prepare('UPDATE notes SET updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);

  if (!insertedIds.length) {
    return res.status(400).json({ error: 'Nenhum arquivo com formato permitido foi enviado.' });
  }

  const placeholders = insertedIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT * FROM note_attachments WHERE id IN (${placeholders}) ORDER BY id DESC
  `).all(...insertedIds);

  res.status(201).json(rows.map((row) => ({
    id: row.id,
    note_id: row.note_id,
    file_type: row.file_type,
    original_name: row.original_name,
    mime_type: row.mime_type,
    file_size: row.file_size,
    created_at: row.created_at,
    url: `/api/notes/attachments/${row.id}`
  })));
});

router.delete('/:noteId/attachments/:attachmentId', (req, res) => {
  const row = db.prepare(`
    SELECT a.*
    FROM note_attachments a
    JOIN notes n ON n.id = a.note_id
    WHERE a.id = ? AND a.note_id = ? AND n.user_id = ?
  `).get(req.params.attachmentId, req.params.noteId, req.user.id);

  if (!row) return res.status(404).json({ error: 'Anexo não encontrado.' });

  db.prepare('DELETE FROM note_attachments WHERE id = ?').run(row.id);
  db.prepare('UPDATE notes SET updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(req.params.noteId, req.user.id);

  const fullPath = path.join(UPLOAD_ROOT, row.stored_name);
  if (fs.existsSync(fullPath)) {
    try { fs.unlinkSync(fullPath); } catch (_err) {}
  }

  res.json({ success: true });
});

router.post('/:id/restore', (req, res) => {
  const note = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!note) return res.status(404).json({ error: 'Nota não encontrada.' });

  db.prepare(`
    UPDATE notes
    SET trashed = 0, deleted_at = NULL, archived = 0, updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(req.params.id, req.user.id);

  const hydrated = hydrateNotes([getNoteById(req.params.id, req.user.id)])[0];
  res.json(hydrated);
});

router.post('/:id/favorite', (req, res) => {
  const note = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!note) return res.status(404).json({ error: 'Nota não encontrada.' });

  const enabled = typeof req.body?.enabled === 'boolean'
    ? req.body.enabled
    : !db.prepare('SELECT id FROM favorite_notes WHERE note_id = ? AND user_id = ?').get(req.params.id, req.user.id);

  setFavorite(req.params.id, req.user.id, enabled);
  db.prepare('UPDATE notes SET updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);

  const hydrated = hydrateNotes([getNoteById(req.params.id, req.user.id)])[0];
  res.json(hydrated);
});

router.post('/:id/pin', (req, res) => {
  const note = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!note) return res.status(404).json({ error: 'Nota não encontrada.' });

  const enabled = typeof req.body?.enabled === 'boolean'
    ? req.body.enabled
    : !db.prepare('SELECT id FROM pinned_notes WHERE note_id = ? AND user_id = ?').get(req.params.id, req.user.id);

  setPinned(req.params.id, req.user.id, enabled);
  db.prepare('UPDATE notes SET updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);

  const hydrated = hydrateNotes([getNoteById(req.params.id, req.user.id)])[0];
  res.json(hydrated);
});

router.post('/:id/archive', (req, res) => {
  const note = db.prepare('SELECT id, archived FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!note) return res.status(404).json({ error: 'Nota não encontrada.' });

  const enabled = typeof req.body?.enabled === 'boolean' ? req.body.enabled : !note.archived;
  db.prepare('UPDATE notes SET archived = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?')
    .run(enabled ? 1 : 0, req.params.id, req.user.id);

  const hydrated = hydrateNotes([getNoteById(req.params.id, req.user.id)])[0];
  res.json(hydrated);
});

router.delete('/:id', (req, res) => {
  const force = String(req.query.force || '') === 'true';
  const existing = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Nota não encontrada.' });

  if (!force) {
    db.prepare(`
      UPDATE notes
      SET trashed = 1, deleted_at = COALESCE(deleted_at, datetime('now')), updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(req.params.id, req.user.id);

    logAction({ user: req.user, action: 'trash_note', recordType: 'note', recordId: req.params.id });
    return res.json({ success: true, moved_to_trash: true });
  }

  removeNoteFiles(existing.id);
  db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);

  logAction({ user: req.user, action: 'delete_note_permanently', recordType: 'note', recordId: req.params.id });
  return res.json({ success: true, moved_to_trash: false });
});

module.exports = router;
