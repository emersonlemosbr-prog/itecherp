const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/meta', (req, res) => {
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

router.post('/notifications/:id/ack', (req, res) => {
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

module.exports = router;
