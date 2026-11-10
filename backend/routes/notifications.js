const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const {
  NOTIFICATION_EVENTS,
  getUserNotificationPreferences,
  saveUserNotificationPreferences
} = require('../services/notificationService');

const router = express.Router();
router.use(authenticate);

// GET /api/notifications — Lista notificações do usuário logado
router.get('/', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const userId = req.user.id;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 40));

    const notifications = await db.query(`
      SELECT id, event_key, category, title, description, link, metadata, is_read, read_at, created_at
      FROM user_notifications
      WHERE store_id = $1 AND user_id = $2
      ORDER BY created_at DESC
      LIMIT $3
    `, [storeId, userId, limit]);

    const unreadCountRow = await db.queryOne(`
      SELECT COUNT(*) as count
      FROM user_notifications
      WHERE store_id = $1 AND user_id = $2 AND is_read = FALSE
    `, [storeId, userId]);

    const unreadCount = parseInt(unreadCountRow?.count || 0, 10);

    res.json({
      notifications: notifications || [],
      unreadCount
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/notifications/unread-count — Retorna apenas a contagem não lida
router.get('/unread-count', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const userId = req.user.id;

    const row = await db.queryOne(`
      SELECT COUNT(*) as count
      FROM user_notifications
      WHERE store_id = $1 AND user_id = $2 AND is_read = FALSE
    `, [storeId, userId]);

    res.json({ count: parseInt(row?.count || 0, 10) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/:id/read — Marca uma notificação individual como lida
router.patch('/:id/read', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const userId = req.user.id;
    const notifId = Number(req.params.id);

    await db.query(`
      UPDATE user_notifications
      SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND store_id = $2 AND user_id = $3
    `, [notifId, storeId, userId]);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/mark-all-read — Marca todas as notificações do usuário como lidas
router.post('/mark-all-read', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const userId = req.user.id;

    await db.query(`
      UPDATE user_notifications
      SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
      WHERE store_id = $1 AND user_id = $2 AND is_read = FALSE
    `, [storeId, userId]);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/notifications/:id — Exclui uma notificação do usuário
router.delete('/:id', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const userId = req.user.id;
    const notifId = Number(req.params.id);

    await db.query(`
      DELETE FROM user_notifications
      WHERE id = $1 AND store_id = $2 AND user_id = $3
    `, [notifId, storeId, userId]);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/notifications — Limpa todas as notificações do usuário
router.delete('/', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const userId = req.user.id;

    await db.query(`
      DELETE FROM user_notifications
      WHERE store_id = $1 AND user_id = $2
    `, [storeId, userId]);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/notifications/preferences — Obtém as preferências do usuário logado
router.get('/preferences', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const userId = req.user.id;
    const data = await getUserNotificationPreferences(storeId, userId);
    res.json({
      ...data,
      catalog: NOTIFICATION_EVENTS,
      isAdmin: req.user.role === 'admin'
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/notifications/preferences — Salva preferências do usuário
router.put('/preferences', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const userId = req.user.id;
    const { mode, preferences } = req.body || {};

    const updated = await saveUserNotificationPreferences(storeId, userId, { mode, preferences });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

