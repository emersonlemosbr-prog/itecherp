const express = require('express');
const { authenticate } = require('../middleware/auth');
const db = require('../db/database');

const router = express.Router();
router.use('/parts', require('./partsCatalog'));

// PagBank Calculator
router.get('/pagbank', authenticate, async (req, res) => {
  try {
    const user_id = req.user.id;
    const result = await db.queryOne('SELECT * FROM pagbank_calculator WHERE user_id = $1', [user_id]);
    res.json(result || { value: 100 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/pagbank', authenticate, async (req, res) => {
  try {
    const { value } = req.body;
    const user_id = req.user.id;

    const existing = await db.queryOne('SELECT id FROM pagbank_calculator WHERE user_id = $1', [user_id]);

    if (existing) {
      await db.execute('UPDATE pagbank_calculator SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2', [value, user_id]);
    } else {
      await db.execute('INSERT INTO pagbank_calculator (user_id, value) VALUES ($1, $2)', [user_id, value]);
    }

    res.json({ success: true, value });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Piece Calculator
router.get('/piece', authenticate, async (req, res) => {
  try {
    const user_id = req.user.id;
    const result = await db.queryOne('SELECT * FROM piece_calculator WHERE user_id = $1', [user_id]);

    if (result) {
      result.entries = typeof result.entries === 'string' ? JSON.parse(result.entries || '[]') : (result.entries || []);
    }

    res.json(result || { base_value: 0, entries: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/piece', authenticate, async (req, res) => {
  try {
    const { base_value, entries } = req.body;
    const user_id = req.user.id;
    const entriesJson = JSON.stringify(entries || []);

    const existing = await db.queryOne('SELECT id FROM piece_calculator WHERE user_id = $1', [user_id]);

    if (existing) {
      await db.execute('UPDATE piece_calculator SET base_value = $1, entries = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $3', [base_value, entriesJson, user_id]);
    } else {
      await db.execute('INSERT INTO piece_calculator (user_id, base_value, entries) VALUES ($1, $2, $3)', [user_id, base_value, entriesJson]);
    }

    res.json({ success: true, base_value, entries });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Frontals Calculator
router.get('/frontals', authenticate, async (req, res) => {
  try {
    const user_id = req.user.id;
    const result = await db.queryOne('SELECT * FROM frontals_calculator WHERE user_id = $1', [user_id]);

    if (result) {
      result.entries = typeof result.entries === 'string' ? JSON.parse(result.entries || '[]') : (result.entries || []);
    }

    res.json(result || { base_value: 0, brand: 'Apple', model: '', version: 'primeira linha', entries: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/frontals', authenticate, async (req, res) => {
  try {
    const { base_value, brand, model, version, entries } = req.body;
    const user_id = req.user.id;
    const entriesJson = JSON.stringify(entries || []);

    const existing = await db.queryOne('SELECT id FROM frontals_calculator WHERE user_id = $1', [user_id]);

    if (existing) {
      await db.execute(
        'UPDATE frontals_calculator SET base_value = $1, brand = $2, model = $3, version = $4, entries = $5, updated_at = CURRENT_TIMESTAMP WHERE user_id = $6',
        [base_value, brand, model, version, entriesJson, user_id]
      );
    } else {
      await db.execute(
        'INSERT INTO frontals_calculator (user_id, base_value, brand, model, version, entries) VALUES ($1, $2, $3, $4, $5, $6)',
        [user_id, base_value, brand, model, version, entriesJson]
      );
    }

    res.json({ success: true, base_value, brand, model, version, entries });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/frontals/entries', authenticate, async (req, res) => {
  try {
    const user_id = req.user.id;
    const entries = await db.query(`
      SELECT id, brand, model, version, cost_price, sale_price AS price, created_at
      FROM frontals_price_list
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
    `, [user_id]);
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/frontals/entries', authenticate, async (req, res) => {
  try {
    const { brand, model, version, cost_price, sale_price } = req.body;
    const user_id = req.user.id;

    if (!brand || !model || !version || cost_price == null || sale_price == null) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    }
    if (typeof brand !== 'string' || typeof model !== 'string' || !brand.trim() || !model.trim() || !['primeira linha', 'original'].includes(version) || typeof cost_price !== 'number' || !Number.isFinite(cost_price) || cost_price <= 0 || typeof sale_price !== 'number' || !Number.isFinite(sale_price) || sale_price < 0) {
      return res.status(400).json({ error: 'Informe marca, modelo, versão e valores válidos. O custo da peça deve ser maior que zero.' });
    }

    const result = await db.execute(`
      INSERT INTO frontals_price_list (user_id, brand, model, version, cost_price, sale_price)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [user_id, brand, model, version, cost_price, sale_price]);

    const insertedId = result.id;
    if (!insertedId) {
      return res.status(500).json({ error: 'Não foi possível recuperar o ID do registro inserido.' });
    }

    const entry = await db.queryOne(`
      SELECT id, brand, model, version, cost_price, sale_price AS price, created_at
      FROM frontals_price_list
      WHERE id = $1
    `, [insertedId]);

    res.status(201).json(entry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear calculator data
router.delete('/:type', authenticate, async (req, res) => {
  try {
    const { type } = req.params;
    const user_id = req.user.id;

    const tableMap = {
      pagbank: 'pagbank_calculator',
      piece: 'piece_calculator',
      frontals: 'frontals_calculator'
    };

    const table = tableMap[type];
    if (!table) return res.status(400).json({ error: 'Invalid calculator type' });

    await db.execute(`DELETE FROM ${table} WHERE user_id = $1`, [user_id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
