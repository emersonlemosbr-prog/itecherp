const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const settings = require('../services/settings');
const router = express.Router();

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const storeId = req.user.store_id || 1;
    let current = await settings.row(storeId);
    if (!current) {
      await db.execute(`
        INSERT INTO system_settings (store_id, value, version, updated_at)
        VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
        ON CONFLICT (store_id) DO NOTHING
      `, [storeId, JSON.stringify(await settings.readSettings(storeId))]);
      current = await settings.row(storeId);
    }
    const settingsData = await settings.readSettings(storeId);
    const sequencesData = await settings.sequences(storeId);
    res.json({
      settings: settingsData,
      sequences: sequencesData,
      version: current?.version || 1,
      last_backup: current?.last_backup || null
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
    let current = await settings.row(storeId);
    if (!current) {
      // Se ainda não existir registro de configurações para esta loja, inicializa atomicamente
      await db.execute(`
        INSERT INTO system_settings (store_id, value, version, updated_at)
        VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
        ON CONFLICT (store_id) DO NOTHING
      `, [storeId, JSON.stringify(await settings.readSettings(storeId))]);
      current = await settings.row(storeId);
    }

    if (current && req.body.version !== undefined && Number(req.body.version) !== current.version) {
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

      // Atualiza ou insere atomicamente as configurações da loja
      await tx.execute(`
        INSERT INTO system_settings (store_id, value, version, updated_at)
        VALUES ($1, $2, 1, CURRENT_TIMESTAMP)
        ON CONFLICT (store_id) DO UPDATE SET
          value = EXCLUDED.value,
          version = system_settings.version + 1,
          updated_at = CURRENT_TIMESTAMP
      `, [storeId, JSON.stringify(value)]);

      // Se o nome da loja foi informado, mantém sincronizado na tabela stores
      if (value.store?.name && typeof value.store.name === 'string' && value.store.name.trim()) {
        await tx.execute(`
          UPDATE stores
          SET name = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [value.store.name.trim(), storeId]);
      }
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
