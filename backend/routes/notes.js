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

async function purgeExpiredTrash(userId) {
  try {
    const expired = await db.query(`
      SELECT n.id, a.stored_name
      FROM notes n
      LEFT JOIN note_attachments a ON a.note_id = n.id
      WHERE n.user_id = $1
        AND n.trashed = 1
        AND n.deleted_at IS NOT NULL
        AND n.deleted_at + INTERVAL '30 days' <= CURRENT_TIMESTAMP
    `, [userId]);

    const noteIds = [...new Set(expired.map((row) => row.id))];
    expired.forEach((row) => {
      if (!row.stored_name) return;
      const fullPath = path.join(UPLOAD_ROOT, row.stored_name);
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch (_err) {}
      }
    });

    if (noteIds.length > 0) {
      await db.transaction(async (tx) => {
        for (const id of noteIds) {
          await tx.execute('DELETE FROM notes WHERE id = $1 AND user_id = $2', [id, userId]);
        }
      });
    }
  } catch (err) {
    console.warn('⚠️ [NOTES_PURGE_ERROR]', err.message);
  }
}

function normalizeBoolean(value) {
  return value ? 1 : 0;
}

async function getNoteById(noteId, userId, client = db) {
  return client.queryOne(`
    SELECT n.*, c.name as color_name, c.bg_color, c.border_color, c.text_color,
      CASE WHEN fn.id IS NULL THEN 0 ELSE 1 END AS is_favorite,
      CASE WHEN pn.id IS NULL THEN 0 ELSE 1 END AS is_pinned,
      COALESCE(pn.pinned_order, 0) AS pinned_order
    FROM notes n
    LEFT JOIN note_colors c ON c.id = n.color_id
    LEFT JOIN favorite_notes fn ON fn.note_id = n.id AND fn.user_id = n.user_id
    LEFT JOIN pinned_notes pn ON pn.note_id = n.id AND pn.user_id = n.user_id
    WHERE n.id = $1 AND n.user_id = $2
  `, [noteId, userId]);
}

async function hydrateNotes(notes, client = db) {
  if (!notes.length) return [];
  const ids = notes.map((n) => n.id);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');

  const checklists = await client.query(`
    SELECT * FROM note_checklists
    WHERE note_id IN (${placeholders})
    ORDER BY position ASC, id ASC
  `, ...ids);

  const labels = await client.query(`
    SELECT nl.note_id, l.id, l.name
    FROM note_labels nl
    JOIN labels l ON l.id = nl.label_id
    WHERE nl.note_id IN (${placeholders})
    ORDER BY l.name ASC
  `, ...ids);

  const attachments = await client.query(`
    SELECT * FROM note_attachments
    WHERE note_id IN (${placeholders})
    ORDER BY created_at DESC
  `, ...ids);

  const reminders = await client.query(`
    SELECT * FROM note_reminders
    WHERE note_id IN (${placeholders})
    ORDER BY remind_at ASC
  `, ...ids);

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

async function syncChecklist(noteId, checklist, client = db) {
  await client.execute('DELETE FROM note_checklists WHERE note_id = $1', [noteId]);
  if (!Array.isArray(checklist) || checklist.length === 0) return;

  for (let index = 0; index < checklist.length; index++) {
    const item = checklist[index];
    const text = String(item?.text || '').trim();
    if (!text) continue;
    await client.execute(`
      INSERT INTO note_checklists (note_id, item_text, is_checked, position, created_at, updated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [noteId, text, normalizeBoolean(item?.is_checked), index]);
  }
}

async function ensureLabel(userId, rawName, client = db) {
  const name = String(rawName || '').trim();
  if (!name) return null;

  const existing = await client.queryOne('SELECT id, name FROM labels WHERE user_id = $1 AND name = $2', [userId, name]);
  if (existing) return existing;

  const info = await client.execute('INSERT INTO labels (user_id, name) VALUES ($1, $2) RETURNING id', [userId, name]);
  return { id: info.id, name };
}

async function syncLabels(noteId, userId, labels, client = db) {
  await client.execute('DELETE FROM note_labels WHERE note_id = $1', [noteId]);
  if (!Array.isArray(labels) || labels.length === 0) return;

  for (const label of labels) {
    if (!label) continue;
    let labelId = null;
    if (typeof label === 'number') {
      const ownLabel = await client.queryOne('SELECT id FROM labels WHERE id = $1 AND user_id = $2', [label, userId]);
      labelId = ownLabel ? ownLabel.id : null;
    } else if (typeof label === 'object' && typeof label.id === 'number') {
      const ownLabel = await client.queryOne('SELECT id FROM labels WHERE id = $1 AND user_id = $2', [label.id, userId]);
      labelId = ownLabel ? ownLabel.id : null;
    } else {
      const created = await ensureLabel(userId, typeof label === 'object' ? label.name : label, client);
      labelId = created ? created.id : null;
    }

    if (labelId) {
      await client.execute('INSERT INTO note_labels (note_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [noteId, labelId]);
    }
  }
}

async function syncReminder(noteId, reminderAt, client = db) {
  if (!reminderAt) {
    await client.execute('DELETE FROM note_reminders WHERE note_id = $1', [noteId]);
    return;
  }

  const existing = await client.queryOne('SELECT id FROM note_reminders WHERE note_id = $1 ORDER BY id ASC LIMIT 1', [noteId]);
  if (existing) {
    await client.execute(`
      UPDATE note_reminders
      SET remind_at = $1, done = 0, notified_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [reminderAt, existing.id]);
    await client.execute('DELETE FROM note_reminders WHERE note_id = $1 AND id != $2', [noteId, existing.id]);
  } else {
    await client.execute(`
      INSERT INTO note_reminders (note_id, remind_at, done, created_at, updated_at)
      VALUES ($1, $2, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [noteId, reminderAt]);
  }
}

async function setFavorite(noteId, userId, enabled, client = db) {
  if (enabled) {
    await client.execute('INSERT INTO favorite_notes (note_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [noteId, userId]);
  } else {
    await client.execute('DELETE FROM favorite_notes WHERE note_id = $1 AND user_id = $2', [noteId, userId]);
  }
}

async function setPinned(noteId, userId, enabled, client = db) {
  if (enabled) {
    const maxRow = await client.queryOne('SELECT COALESCE(MAX(pinned_order), 0) as max_order FROM pinned_notes WHERE user_id = $1', [userId]);
    await client.execute(`
      INSERT INTO pinned_notes (note_id, user_id, pinned_order)
      VALUES ($1, $2, $3)
      ON CONFLICT (note_id, user_id) DO UPDATE SET pinned_order = EXCLUDED.pinned_order
    `, [noteId, userId, (parseInt(maxRow?.max_order || 0, 10)) + 1]);
  } else {
    await client.execute('DELETE FROM pinned_notes WHERE note_id = $1 AND user_id = $2', [noteId, userId]);
  }
}

async function removeNoteFiles(noteId, client = db) {
  const files = await client.query('SELECT stored_name FROM note_attachments WHERE note_id = $1', [noteId]);
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
      return "LOWER(COALESCE(n.title, '')) ASC, n.updated_at DESC";
    case 'color':
      return "LOWER(COALESCE(c.name, '')) ASC, n.updated_at DESC";
    case 'favorites':
      return 'CASE WHEN fn.id IS NULL THEN 1 ELSE 0 END ASC, n.updated_at DESC';
    case 'pinned':
      return 'CASE WHEN pn.id IS NULL THEN 1 ELSE 0 END ASC, pn.pinned_order ASC, n.updated_at DESC';
    case 'newest':
    default:
      return 'n.position DESC, n.updated_at DESC, n.id DESC';
  }
}

router.get('/meta', async (req, res) => {
  try {
    await purgeExpiredTrash(req.user.id);

    const colors = await db.query('SELECT * FROM note_colors ORDER BY id ASC');
    const labels = await db.query('SELECT id, name FROM labels WHERE user_id = $1 ORDER BY name ASC', [req.user.id]);

    const notesCount = await db.queryOne('SELECT COUNT(*) as total FROM notes WHERE user_id = $1 AND archived = 0 AND trashed = 0', [req.user.id]);
    const remindersCount = await db.queryOne(`
      SELECT COUNT(DISTINCT n.id) as total
      FROM notes n
      JOIN note_reminders nr ON nr.note_id = n.id
      WHERE n.user_id = $1 AND n.archived = 0 AND n.trashed = 0 AND nr.done = 0
    `, [req.user.id]);
    const favoritesCount = await db.queryOne(`
      SELECT COUNT(*) as total FROM favorite_notes fn
      JOIN notes n ON n.id = fn.note_id
      WHERE fn.user_id = $1 AND n.trashed = 0
    `, [req.user.id]);
    const archivedCount = await db.queryOne('SELECT COUNT(*) as total FROM notes WHERE user_id = $1 AND archived = 1 AND trashed = 0', [req.user.id]);
    const trashCount = await db.queryOne('SELECT COUNT(*) as total FROM notes WHERE user_id = $1 AND trashed = 1', [req.user.id]);

    const counts = {
      notes: parseInt(notesCount?.total || 0, 10),
      reminders: parseInt(remindersCount?.total || 0, 10),
      favorites: parseInt(favoritesCount?.total || 0, 10),
      archived: parseInt(archivedCount?.total || 0, 10),
      trash: parseInt(trashCount?.total || 0, 10)
    };

    res.json({ colors, labels, counts });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar metadados das notas: ' + err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    await purgeExpiredTrash(req.user.id);

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

    let whereSql = 'WHERE n.user_id = $1';
    const params = [req.user.id];
    let paramIndex = 2;

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
      whereSql += ` AND n.archived = $${paramIndex++}`;
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
      whereSql += ` AND EXISTS (SELECT 1 FROM note_labels nlf WHERE nlf.note_id = n.id AND nlf.label_id = $${paramIndex++})`;
      params.push(labelId);
    }

    if (q) {
      whereSql += `
        AND (
          COALESCE(n.title, '') ILIKE $${paramIndex}
          OR COALESCE(n.content, '') ILIKE $${paramIndex}
          OR EXISTS (
            SELECT 1 FROM note_checklists nc
            WHERE nc.note_id = n.id AND nc.item_text ILIKE $${paramIndex}
          )
          OR EXISTS (
            SELECT 1 FROM note_labels nls
            JOIN labels ls ON ls.id = nls.label_id
            WHERE nls.note_id = n.id AND ls.name ILIKE $${paramIndex}
          )
        )
      `;
      params.push(`%${q}%`);
      paramIndex++;
    }

    const baseSql = `
      FROM notes n
      LEFT JOIN note_colors c ON c.id = n.color_id
      LEFT JOIN favorite_notes fn ON fn.note_id = n.id AND fn.user_id = n.user_id
      LEFT JOIN pinned_notes pn ON pn.note_id = n.id AND pn.user_id = n.user_id
      LEFT JOIN note_reminders nr_filter ON nr_filter.note_id = n.id AND nr_filter.done = 0
      ${whereSql}
    `;

    const totalRow = await db.queryOne(`SELECT COUNT(DISTINCT n.id) as total ${baseSql}`, ...params);
    const total = parseInt(totalRow?.total || 0, 10);

    const orderBy = buildOrder(sort);
    const queryParams = [...params, pageSize, offset];
    const limitPlaceholder = `$${params.length + 1}`;
    const offsetPlaceholder = `$${params.length + 2}`;

    const rows = await db.query(`
      SELECT DISTINCT n.*, c.name as color_name, c.bg_color, c.border_color, c.text_color,
        CASE WHEN fn.id IS NULL THEN 0 ELSE 1 END AS is_favorite,
        CASE WHEN pn.id IS NULL THEN 0 ELSE 1 END AS is_pinned,
        COALESCE(pn.pinned_order, 0) AS pinned_order
      ${baseSql}
      ORDER BY CASE WHEN pn.id IS NULL THEN 1 ELSE 0 END ASC,
        CASE WHEN pn.id IS NULL THEN 999999 ELSE pn.pinned_order END ASC,
        ${orderBy}
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `, ...queryParams);

    res.json({
      notes: await hydrateNotes(rows),
      pagination: {
        total,
        page,
        pageSize,
        hasMore: offset + rows.length < total
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar notas: ' + err.message });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT nr.id as reminder_id, nr.remind_at, n.id as note_id, n.title, n.content
      FROM note_reminders nr
      JOIN notes n ON n.id = nr.note_id
      WHERE n.user_id = $1
        AND n.trashed = 0
        AND nr.done = 0
        AND nr.notified_at IS NULL
        AND nr.remind_at <= CURRENT_TIMESTAMP
      ORDER BY nr.remind_at ASC
      LIMIT 20
    `, [req.user.id]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar notificações: ' + err.message });
  }
});

router.post('/reminders/:id/ack', async (req, res) => {
  try {
    const row = await db.queryOne(`
      SELECT nr.id
      FROM note_reminders nr
      JOIN notes n ON n.id = nr.note_id
      WHERE nr.id = $1 AND n.user_id = $2
    `, [req.params.id, req.user.id]);

    if (!row) return res.status(404).json({ error: 'Lembrete não encontrado.' });

    await db.execute('UPDATE note_reminders SET notified_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/labels', async (req, res) => {
  try {
    const label = await ensureLabel(req.user.id, req.body?.name);
    if (!label) return res.status(400).json({ error: 'Nome da etiqueta é obrigatório.' });
    res.status(201).json(label);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/labels/:id', async (req, res) => {
  try {
    const ownLabel = await db.queryOne('SELECT id FROM labels WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!ownLabel) return res.status(404).json({ error: 'Etiqueta não encontrada.' });

    await db.execute('DELETE FROM labels WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/trash/empty', async (req, res) => {
  try {
    const trashedNotes = await db.query('SELECT id FROM notes WHERE user_id = $1 AND trashed = 1', [req.user.id]);
    if (!trashedNotes.length) {
      return res.json({ success: true, deleted_count: 0 });
    }

    for (const note of trashedNotes) {
      await removeNoteFiles(note.id);
    }

    const info = await db.execute('DELETE FROM notes WHERE user_id = $1 AND trashed = 1', [req.user.id]);
    await logAction({ user: req.user, action: 'empty_trash_notes', recordType: 'note', details: { deleted_count: info.changes } });

    return res.json({ success: true, deleted_count: info.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/attachments/:attachmentId', async (req, res) => {
  try {
    const attachment = await db.queryOne(`
      SELECT a.*
      FROM note_attachments a
      JOIN notes n ON n.id = a.note_id
      WHERE a.id = $1 AND n.user_id = $2
    `, [req.params.attachmentId, req.user.id]);

    if (!attachment) return res.status(404).json({ error: 'Anexo não encontrado.' });
    return res.sendFile(attachment.stored_name, {
      root: UPLOAD_ROOT,
      headers: { 'Content-Type': attachment.mime_type || 'application/octet-stream' },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const note = await getNoteById(req.params.id, req.user.id);
    if (!note) return res.status(404).json({ error: 'Nota não encontrada.' });
    const hydrated = await hydrateNotes([note]);
    res.json(hydrated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
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

    const noteId = await db.transaction(async (tx) => {
      const info = await tx.execute(`
        INSERT INTO notes (user_id, title, content, color_id, archived, trashed, deleted_at, position, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        req.user.id,
        title || '',
        content || '',
        color_id || 1,
        normalizeBoolean(archived),
        normalizeBoolean(trashed),
        trashed ? new Date().toISOString() : null,
        Date.now()
      ]);

      const newId = info.id;
      await syncChecklist(newId, checklist, tx);
      await syncLabels(newId, req.user.id, labels, tx);
      await syncReminder(newId, reminder_at || null, tx);
      await setFavorite(newId, req.user.id, !!is_favorite, tx);
      await setPinned(newId, req.user.id, !!is_pinned, tx);

      return newId;
    });

    await logAction({ user: req.user, action: 'create_note', recordType: 'note', recordId: noteId });

    const freshNote = await getNoteById(noteId, req.user.id);
    const hydrated = await hydrateNotes([freshNote]);
    res.status(201).json(hydrated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await db.queryOne('SELECT * FROM notes WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
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

    await db.transaction(async (tx) => {
      await tx.execute(`
        UPDATE notes
        SET title = $1,
            content = $2,
            color_id = $3,
            archived = $4,
            trashed = $5,
            deleted_at = $6,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $7 AND user_id = $8
      `, [
        title ?? existing.title,
        content ?? existing.content,
        color_id || existing.color_id || 1,
        typeof archived === 'boolean' ? normalizeBoolean(archived) : existing.archived,
        normalizeBoolean(shouldTrash),
        shouldTrash ? (existing.deleted_at || new Date().toISOString()) : null,
        req.params.id,
        req.user.id
      ]);

      if (Array.isArray(checklist)) await syncChecklist(existing.id, checklist, tx);
      if (Array.isArray(labels)) await syncLabels(existing.id, req.user.id, labels, tx);
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'reminder_at')) await syncReminder(existing.id, reminder_at || null, tx);
      if (typeof is_favorite === 'boolean') await setFavorite(existing.id, req.user.id, is_favorite, tx);
      if (typeof is_pinned === 'boolean') await setPinned(existing.id, req.user.id, is_pinned, tx);
    });

    await logAction({ user: req.user, action: 'update_note', recordType: 'note', recordId: req.params.id });

    const freshNote = await getNoteById(req.params.id, req.user.id);
    const hydrated = await hydrateNotes([freshNote]);
    res.json(hydrated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/reorder', async (req, res) => {
  try {
    const { position } = req.body || {};
    const own = await db.queryOne('SELECT id FROM notes WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!own) return res.status(404).json({ error: 'Nota não encontrada.' });

    await db.execute('UPDATE notes SET position = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3', [
      Number(position || Date.now()), req.params.id, req.user.id
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reorder', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: 'Lista de IDs inválida.' });

    await db.transaction(async (tx) => {
      const base = Date.now();
      for (let index = 0; index < ids.length; index++) {
        await tx.execute('UPDATE notes SET position = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3', [
          base - index, ids[index], req.user.id
        ]);
      }
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/attachments', upload.array('files', 10), async (req, res) => {
  try {
    const note = await db.queryOne('SELECT id FROM notes WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!note) {
      (req.files || []).forEach((file) => {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      });
      return res.status(404).json({ error: 'Nota não encontrada.' });
    }

    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

    const insertedIds = [];
    for (const file of files) {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const isImage = (file.mimetype || '').startsWith('image/');
      const isAllowedFile = ALLOWED_FILE_MIME.has(file.mimetype) || ALLOWED_FILE_EXT.has(ext);

      if (!isImage && !isAllowedFile) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        continue;
      }

      const info = await db.execute(`
        INSERT INTO note_attachments (note_id, file_type, original_name, stored_name, mime_type, file_size)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [
        req.params.id,
        isImage ? 'image' : 'file',
        file.originalname,
        path.basename(file.filename),
        file.mimetype,
        file.size
      ]);
      insertedIds.push(info.id);
    }

    await db.execute('UPDATE notes SET updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);

    if (!insertedIds.length) {
      return res.status(400).json({ error: 'Nenhum arquivo com formato permitido foi enviado.' });
    }

    const placeholders = insertedIds.map((_, i) => `$${i + 1}`).join(',');
    const rows = await db.query(`
      SELECT * FROM note_attachments WHERE id IN (${placeholders}) ORDER BY id DESC
    `, ...insertedIds);

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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:noteId/attachments/:attachmentId', async (req, res) => {
  try {
    const row = await db.queryOne(`
      SELECT a.*
      FROM note_attachments a
      JOIN notes n ON n.id = a.note_id
      WHERE a.id = $1 AND a.note_id = $2 AND n.user_id = $3
    `, [req.params.attachmentId, req.params.noteId, req.user.id]);

    if (!row) return res.status(404).json({ error: 'Anexo não encontrado.' });

    await db.execute('DELETE FROM note_attachments WHERE id = $1', [row.id]);
    await db.execute('UPDATE notes SET updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2', [req.params.noteId, req.user.id]);

    const fullPath = path.join(UPLOAD_ROOT, row.stored_name);
    if (fs.existsSync(fullPath)) {
      try { fs.unlinkSync(fullPath); } catch (_err) {}
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/restore', async (req, res) => {
  try {
    const note = await db.queryOne('SELECT id FROM notes WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!note) return res.status(404).json({ error: 'Nota não encontrada.' });

    await db.execute(`
      UPDATE notes
      SET trashed = 0, deleted_at = NULL, archived = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
    `, [req.params.id, req.user.id]);

    const freshNote = await getNoteById(req.params.id, req.user.id);
    const hydrated = await hydrateNotes([freshNote]);
    res.json(hydrated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/favorite', async (req, res) => {
  try {
    const note = await db.queryOne('SELECT id FROM notes WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!note) return res.status(404).json({ error: 'Nota não encontrada.' });

    const existingFav = await db.queryOne('SELECT id FROM favorite_notes WHERE note_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    const enabled = typeof req.body?.enabled === 'boolean'
      ? req.body.enabled
      : !existingFav;

    await setFavorite(req.params.id, req.user.id, enabled);
    await db.execute('UPDATE notes SET updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);

    const freshNote = await getNoteById(req.params.id, req.user.id);
    const hydrated = await hydrateNotes([freshNote]);
    res.json(hydrated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/pin', async (req, res) => {
  try {
    const note = await db.queryOne('SELECT id FROM notes WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!note) return res.status(404).json({ error: 'Nota não encontrada.' });

    const existingPinned = await db.queryOne('SELECT id FROM pinned_notes WHERE note_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    const enabled = typeof req.body?.enabled === 'boolean'
      ? req.body.enabled
      : !existingPinned;

    await setPinned(req.params.id, req.user.id, enabled);
    await db.execute('UPDATE notes SET updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);

    const freshNote = await getNoteById(req.params.id, req.user.id);
    const hydrated = await hydrateNotes([freshNote]);
    res.json(hydrated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/archive', async (req, res) => {
  try {
    const note = await db.queryOne('SELECT id, archived FROM notes WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!note) return res.status(404).json({ error: 'Nota não encontrada.' });

    const enabled = typeof req.body?.enabled === 'boolean' ? req.body.enabled : !note.archived;
    await db.execute('UPDATE notes SET archived = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3', [
      enabled ? 1 : 0, req.params.id, req.user.id
    ]);

    const freshNote = await getNoteById(req.params.id, req.user.id);
    const hydrated = await hydrateNotes([freshNote]);
    res.json(hydrated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const force = String(req.query.force || '') === 'true';
    const existing = await db.queryOne('SELECT * FROM notes WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!existing) return res.status(404).json({ error: 'Nota não encontrada.' });

    if (!force) {
      await db.execute(`
        UPDATE notes
        SET trashed = 1, deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND user_id = $2
      `, [req.params.id, req.user.id]);

      await logAction({ user: req.user, action: 'trash_note', recordType: 'note', recordId: req.params.id });
      return res.json({ success: true, moved_to_trash: true });
    }

    await removeNoteFiles(existing.id);
    await db.execute('DELETE FROM notes WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);

    await logAction({ user: req.user, action: 'delete_note_permanently', recordType: 'note', recordId: req.params.id });
    return res.json({ success: true, moved_to_trash: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
