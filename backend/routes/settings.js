const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const settings = require('../services/settings');
const router = express.Router();

router.use(authenticate);

router.get('/', (req, res) => {
  const storeId = req.user.store_id || 1;
  const current = settings.row(storeId);
  res.json({
    settings: settings.readSettings(storeId),
    sequences: settings.sequences(storeId),
    version: current.version,
    last_backup: current.last_backup
  });
});

router.get('/defaults', requireRole('admin'), (req, res) => {
  const storeId = req.user.store_id || 1;
  res.json(settings.readSettings(storeId));
});

router.put('/', requireRole('admin'), (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const current = settings.row(storeId);
    if (Number(req.body.version) !== current.version) {
      return res.status(409).json({ error: 'As configurações foram alteradas. Recarregue a página.' });
    }
    const value = req.body.settings;
    if (!value || !['store', 'documents', 'system', 'finance'].every(key => value[key] && typeof value[key] === 'object')) {
      return res.status(400).json({ error: 'Configurações inválidas.' });
    }

    db.transaction(() => {
      for (const [kind, number] of Object.entries(req.body.sequences || {})) {
        const previous = settings.sequences(storeId)[kind];
        if (previous === undefined || !Number.isSafeInteger(number) || number < previous) {
          throw new Error('Numeração inválida.');
        }
        db.prepare('UPDATE document_sequences SET next_value=? WHERE store_id=? AND kind=?').run(number, storeId, kind);
      }
      db.prepare('UPDATE system_settings SET value=?,version=version+1 WHERE store_id=?').run(JSON.stringify(value), storeId);
    })();

    const updated = settings.row(storeId);
    res.json({
      settings: settings.readSettings(storeId),
      sequences: settings.sequences(storeId),
      version: updated.version,
      last_backup: updated.last_backup
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
