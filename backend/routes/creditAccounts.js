// routes/creditAccounts.js
const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { emitDashboardRefresh } = require('../utils/events');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const storeId = req.user.store_id || 1;
  const { q, status } = req.query;
  let sql = `
    SELECT ca.*, COALESCE(ca.customer_name_snapshot, c.first_name) AS first_name,
      CASE WHEN ca.customer_name_snapshot IS NOT NULL THEN '' ELSE c.last_name END AS last_name,
      COALESCE(so.customer_phone_snapshot, c.phone) AS phone, so.order_number
    FROM credit_accounts ca
    JOIN customers c ON c.id = ca.customer_id
    LEFT JOIN service_orders so ON so.id = ca.service_order_id
    WHERE ca.store_id = ?
  `;
  const params = [storeId];
  if (q) {
    sql += ' AND (c.first_name LIKE ? OR c.last_name LIKE ? OR ca.customer_name_snapshot LIKE ? OR c.phone LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (status) { sql += ' AND ca.status = ?'; params.push(status); }
  sql += ' ORDER BY ca.status ASC, ca.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/', (req, res) => {
  const storeId = req.user.store_id || 1;
  const { customer_id, description, amount, pickup_date } = req.body;
  if (!customer_id || !amount) return res.status(400).json({ error: 'Cliente e valor são obrigatórios.' });

  // Validar se cliente pertence à mesma loja
  const cust = db.prepare('SELECT id FROM customers WHERE id = ? AND store_id = ?').get(customer_id, storeId);
  if (!cust) return res.status(404).json({ error: 'Cliente não encontrado nesta loja.' });

  const info = db.prepare(`
    INSERT INTO credit_accounts (store_id, customer_id, description, amount, pickup_date, status)
    VALUES (?, ?, ?, ?, ?, 'open')
  `).run(storeId, customer_id, description || null, amount, pickup_date || null);

  logAction({ user: req.user, action: 'create_credit_account', recordType: 'credit_account', recordId: info.lastInsertRowid });
  emitDashboardRefresh({ source: 'credit_account_create', creditAccountId: info.lastInsertRowid });
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/:id/pay', (req, res) => {
  const storeId = req.user.store_id || 1;
  const existing = db.prepare('SELECT * FROM credit_accounts WHERE id = ? AND store_id = ?').get(req.params.id, storeId);
  if (!existing) return res.status(404).json({ error: 'Conta não encontrada nesta loja.' });

  db.prepare(`UPDATE credit_accounts SET status='paid', paid_at=datetime('now') WHERE id=? AND store_id=?`).run(req.params.id, storeId);

  if (existing.service_order_id) {
    db.prepare(`UPDATE service_orders SET payment_status='paid' WHERE id=? AND store_id=?`).run(existing.service_order_id, storeId);
  }

  logAction({ user: req.user, action: 'pay_credit_account', recordType: 'credit_account', recordId: req.params.id });
  emitDashboardRefresh({ source: 'credit_account_pay', creditAccountId: Number(req.params.id), serviceOrderId: existing.service_order_id || null });
  res.json({ success: true });
});

router.delete('/:id', requireRole('admin'), (req, res) => {
  const storeId = req.user.store_id || 1;
  const existing = db.prepare('SELECT id FROM credit_accounts WHERE id = ? AND store_id = ?').get(req.params.id, storeId);
  if (!existing) return res.status(404).json({ error: 'Conta não encontrada nesta loja.' });

  db.prepare('DELETE FROM credit_accounts WHERE id = ? AND store_id = ?').run(req.params.id, storeId);
  logAction({ user: req.user, action: 'delete_credit_account', recordType: 'credit_account', recordId: req.params.id });
  emitDashboardRefresh({ source: 'credit_account_delete', creditAccountId: Number(req.params.id) });
  res.json({ success: true });
});

module.exports = router;
