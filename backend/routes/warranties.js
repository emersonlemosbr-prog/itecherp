// routes/warranties.js
const express = require('express');
const db = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { logAction } = require('../utils/audit');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const { q } = req.query;
    let sql = `
      SELECT w.*, COALESCE(w.customer_name_snapshot, c.first_name) AS first_name,
        CASE WHEN w.customer_name_snapshot IS NOT NULL THEN '' ELSE c.last_name END AS last_name,
        COALESCE(so.customer_phone_snapshot, c.phone) AS phone, so.order_number
      FROM warranties w
      JOIN customers c ON c.id = w.customer_id
      JOIN service_orders so ON so.id = w.service_order_id
      WHERE w.store_id = ?
    `;
    const params = [storeId];
    if (q) {
      sql += ' AND (c.first_name ILIKE ? OR c.last_name ILIKE ? OR w.customer_name_snapshot ILIKE ? OR so.order_number ILIKE ? OR w.brand ILIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }
    sql += ' ORDER BY w.warranty_end ASC';
    const rows = await db.query(sql, ...params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Garantias vencendo nos próximos 7 dias
router.get('/expiring', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const rows = await db.query(`
      SELECT w.*, COALESCE(w.customer_name_snapshot, c.first_name) AS first_name,
        CASE WHEN w.customer_name_snapshot IS NOT NULL THEN '' ELSE c.last_name END AS last_name, so.order_number
      FROM warranties w
      JOIN customers c ON c.id = w.customer_id
      JOIN service_orders so ON so.id = w.service_order_id
      WHERE w.store_id = $1 AND w.warranty_end BETWEEN $2 AND $3
      ORDER BY w.warranty_end ASC
    `, [storeId, today, soon]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const b = req.body;
    const existing = await db.queryOne('SELECT * FROM warranties WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    if (!existing) return res.status(404).json({ error: 'Garantia não encontrada nesta loja.' });

    await db.query(`
      UPDATE warranties SET pickup_date = $1, warranty_start = $2, warranty_end = $3, brand = $4, model = $5, amount_paid = $6, description = $7
      WHERE id = $8 AND store_id = $9
    `, [
      b.pickup_date ?? existing.pickup_date,
      b.warranty_start ?? existing.warranty_start,
      b.warranty_end ?? existing.warranty_end,
      b.brand ?? existing.brand,
      b.model ?? existing.model,
      b.amount_paid ?? existing.amount_paid,
      b.description ?? existing.description,
      req.params.id,
      storeId
    ]);

    await logAction({ user: req.user, action: 'update_warranty', recordType: 'warranty', recordId: req.params.id, storeId });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
