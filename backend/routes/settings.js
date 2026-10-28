const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const settings = require('../services/settings');
const router = express.Router();

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const current = await settings.row(storeId);
    const settingsData = await settings.readSettings(storeId);
    const sequencesData = await settings.sequences(storeId);
    res.json({
      settings: settingsData,
      sequences: sequencesData,
      version: current.version,
      last_backup: current.last_backup
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar configurações: ' + err.message });
  }
});

router.get('/defaults', requireRole('admin'), async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    res.json(await settings.readSettings(storeId));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar configurações padrão: ' + err.message });
  }
});

router.put('/', requireRole('admin'), async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    const current = await settings.row(storeId);
    if (Number(req.body.version) !== current.version) {
      return res.status(409).json({ error: 'As configurações foram alteradas. Recarregue a página.' });
    }
    const value = req.body.settings;
    if (!value || !['store', 'documents', 'system', 'finance'].every(key => value[key] && typeof value[key] === 'object')) {
      return res.status(400).json({ error: 'Configurações inválidas.' });
    }

    const currentSequences = await settings.sequences(storeId);

    await db.transaction(async (tx) => {
      for (const [kind, number] of Object.entries(req.body.sequences || {})) {
        const previous = currentSequences[kind];
        if (previous === undefined || !Number.isSafeInteger(number) || number < previous) {
          throw new Error('Numeração inválida.');
        }
        await tx.execute('UPDATE document_sequences SET next_value = $1 WHERE store_id = $2 AND kind = $3', [number, storeId, kind]);
      }
      await tx.execute('UPDATE system_settings SET value = $1, version = version + 1 WHERE store_id = $2', [JSON.stringify(value), storeId]);
    });

    const updated = await settings.row(storeId);
    res.json({
      settings: await settings.readSettings(storeId),
      sequences: await settings.sequences(storeId),
      version: updated.version,
      last_backup: updated.last_backup
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
