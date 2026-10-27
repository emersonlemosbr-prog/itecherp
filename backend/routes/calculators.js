const express = require('express');
const { authenticate } = require('../middleware/auth');
const db = require('../db/database');

const router = express.Router();
router.use('/parts', require('./partsCatalog')); 

// PagBank Calculator
router.get('/pagbank', authenticate, (req, res) => {
  try {
    const user_id = req.user.id;
    const result = db.prepare('SELECT * FROM pagbank_calculator WHERE user_id = ?').get(user_id);
    res.json(result || { value: 100 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/pagbank', authenticate, (req, res) => {
  try {
    const { value } = req.body;
    const user_id = req.user.id;

    const existing = db.prepare('SELECT id FROM pagbank_calculator WHERE user_id = ?').get(user_id);
    
    if (existing) {
      db.prepare('UPDATE pagbank_calculator SET value = ?, updated_at = datetime("now") WHERE user_id = ?')
        .run(value, user_id);
    } else {
      db.prepare('INSERT INTO pagbank_calculator (user_id, value) VALUES (?, ?)')
        .run(user_id, value);
    }
    
    res.json({ success: true, value });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Piece Calculator
router.get('/piece', authenticate, (req, res) => {
  try {
    const user_id = req.user.id;
    const result = db.prepare('SELECT * FROM piece_calculator WHERE user_id = ?').get(user_id);
    
    if (result) {
      result.entries = JSON.parse(result.entries || '[]');
    }
    
    res.json(result || { base_value: 0, entries: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/piece', authenticate, (req, res) => {
  try {
    const { base_value, entries } = req.body;
    const user_id = req.user.id;
    const entriesJson = JSON.stringify(entries || []);

    const existing = db.prepare('SELECT id FROM piece_calculator WHERE user_id = ?').get(user_id);
    
    if (existing) {
      db.prepare('UPDATE piece_calculator SET base_value = ?, entries = ?, updated_at = datetime("now") WHERE user_id = ?')
        .run(base_value, entriesJson, user_id);
    } else {
      db.prepare('INSERT INTO piece_calculator (user_id, base_value, entries) VALUES (?, ?, ?)')
        .run(user_id, base_value, entriesJson);
    }
    
    res.json({ success: true, base_value, entries });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Frontals Calculator
router.get('/frontals', authenticate, (req, res) => {
  try {
    const user_id = req.user.id;
    const result = db.prepare('SELECT * FROM frontals_calculator WHERE user_id = ?').get(user_id);
    
    if (result) {
      result.entries = JSON.parse(result.entries || '[]');
    }
    
    res.json(result || { base_value: 0, brand: 'Apple', model: '', version: 'primeira linha', entries: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/frontals', authenticate, (req, res) => {
  try {
    const { base_value, brand, model, version, entries } = req.body;
    const user_id = req.user.id;
    const entriesJson = JSON.stringify(entries || []);

    const existing = db.prepare('SELECT id FROM frontals_calculator WHERE user_id = ?').get(user_id);
    
    if (existing) {
      db.prepare('UPDATE frontals_calculator SET base_value = ?, brand = ?, model = ?, version = ?, entries = ?, updated_at = datetime("now") WHERE user_id = ?')
        .run(base_value, brand, model, version, entriesJson, user_id);
    } else {
      db.prepare('INSERT INTO frontals_calculator (user_id, base_value, brand, model, version, entries) VALUES (?, ?, ?, ?, ?, ?)')
        .run(user_id, base_value, brand, model, version, entriesJson);
    }
    
    res.json({ success: true, base_value, brand, model, version, entries });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/frontals/entries', authenticate, (req, res) => {
  try {
    const user_id = req.user.id;
    const entries = db.prepare(`
      SELECT id, brand, model, version, cost_price, sale_price AS price, created_at
      FROM frontals_price_list
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
    `).all(user_id);
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/frontals/entries', authenticate, (req, res) => {
  try {
    const { brand, model, version, cost_price, sale_price } = req.body;
    const user_id = req.user.id;

    if (!brand || !model || !version || cost_price == null || sale_price == null) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    }
    if (typeof brand !== 'string' || typeof model !== 'string' || !brand.trim() || !model.trim() || !['primeira linha', 'original'].includes(version) || typeof cost_price !== 'number' || !Number.isFinite(cost_price) || cost_price <= 0 || typeof sale_price !== 'number' || !Number.isFinite(sale_price) || sale_price < 0) {
      return res.status(400).json({ error: 'Informe marca, modelo, versão e valores válidos. O custo da peça deve ser maior que zero.' });
    }

    const result = db.prepare(`
      INSERT INTO frontals_price_list (user_id, brand, model, version, cost_price, sale_price)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(user_id, brand, model, version, cost_price, sale_price);

    const insertedId = result.lastInsertRowid;
    if (!insertedId) {
      return res.status(500).json({ error: 'Não foi possível recuperar o ID do registro inserido.' });
    }

    const entry = db.prepare(`
      SELECT id, brand, model, version, cost_price, sale_price AS price, created_at
      FROM frontals_price_list
      WHERE id = ?
    `).get(insertedId);

    res.status(201).json(entry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear calculator data
router.delete('/:type', authenticate, (req, res) => {
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
    
    db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(user_id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
