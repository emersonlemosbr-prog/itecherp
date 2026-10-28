const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/meta', async (req, res) => {
  try {
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

router.post('/notifications/:id/ack', async (req, res) => {
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
    res.status(500).json({ error: 'Erro ao confirmar notificação: ' + err.message });
  }
});

module.exports = router;
