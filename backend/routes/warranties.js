// routes/warranties.js
const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
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
    sql += ' AND (c.first_name LIKE ? OR c.last_name LIKE ? OR w.customer_name_snapshot LIKE ? OR so.order_number LIKE ? OR w.brand LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  sql += ' ORDER BY w.warranty_end ASC';
  res.json(db.prepare(sql).all(...params));
});

// Garantias vencendo nos próximos 7 dias
router.get('/expiring', (req, res) => {
  const storeId = req.user.store_id || 1;
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT w.*, COALESCE(w.customer_name_snapshot, c.first_name) AS first_name,
      CASE WHEN w.customer_name_snapshot IS NOT NULL THEN '' ELSE c.last_name END AS last_name, so.order_number
    FROM warranties w
    JOIN customers c ON c.id = w.customer_id
    JOIN service_orders so ON so.id = w.service_order_id
    WHERE w.store_id = ? AND w.warranty_end BETWEEN ? AND ?
    ORDER BY w.warranty_end ASC
  `).all(storeId, today, soon);
  res.json(rows);
});

router.put('/:id', (req, res) => {
  const storeId = req.user.store_id || 1;
  const b = req.body;
  const existing = db.prepare('SELECT * FROM warranties WHERE id = ? AND store_id = ?').get(req.params.id, storeId);
  if (!existing) return res.status(404).json({ error: 'Garantia não encontrada nesta loja.' });

  db.prepare(`
    UPDATE warranties SET pickup_date=?, warranty_start=?, warranty_end=?, brand=?, model=?, amount_paid=?, description=?
    WHERE id=? AND store_id=?
  `).run(
    b.pickup_date ?? existing.pickup_date, b.warranty_start ?? existing.warranty_start,
    b.warranty_end ?? existing.warranty_end, b.brand ?? existing.brand, b.model ?? existing.model,
    b.amount_paid ?? existing.amount_paid, b.description ?? existing.description, req.params.id, storeId
  );

  logAction({ user: req.user, action: 'update_warranty', recordType: 'warranty', recordId: req.params.id });
  res.json({ success: true });
});

module.exports = router;
