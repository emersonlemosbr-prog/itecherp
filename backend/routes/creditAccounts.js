// routes/creditAccounts.js
const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { emitDashboardRefresh } = require('../utils/events');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
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
      sql += ' AND (c.first_name ILIKE ? OR c.last_name ILIKE ? OR ca.customer_name_snapshot ILIKE ? OR c.phone ILIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (status) {
      sql += ' AND ca.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY ca.status ASC, ca.created_at DESC';
    const rows = await db.query(sql, ...params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const { customer_id, description, amount, pickup_date } = req.body;
    if (!customer_id || !amount) return res.status(400).json({ error: 'Cliente e valor são obrigatórios.' });

    // Validar se cliente pertence à mesma loja
    const cust = await db.queryOne('SELECT id FROM customers WHERE id = $1 AND store_id = $2', [customer_id, storeId]);
    if (!cust) return res.status(404).json({ error: 'Cliente não encontrado nesta loja.' });

    const info = await db.queryOne(`
      INSERT INTO credit_accounts (store_id, customer_id, description, amount, pickup_date, status)
      VALUES ($1, $2, $3, $4, $5, 'open')
      RETURNING id
    `, [storeId, customer_id, description || null, amount, pickup_date || null]);

    const accountId = info.id;
    await logAction({ user: req.user, action: 'create_credit_account', recordType: 'credit_account', recordId: accountId, storeId });
    emitDashboardRefresh({ source: 'credit_account_create', creditAccountId: accountId });
    res.status(201).json({ id: accountId });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/pay', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const existing = await db.queryOne('SELECT * FROM credit_accounts WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    if (!existing) return res.status(404).json({ error: 'Conta não encontrada nesta loja.' });

    await db.query(`UPDATE credit_accounts SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = $1 AND store_id = $2`, [req.params.id, storeId]);

    if (existing.service_order_id) {
      await db.query(`UPDATE service_orders SET payment_status = 'paid' WHERE id = $1 AND store_id = $2`, [existing.service_order_id, storeId]);
    }

    await logAction({ user: req.user, action: 'pay_credit_account', recordType: 'credit_account', recordId: req.params.id, storeId });
    emitDashboardRefresh({ source: 'credit_account_pay', creditAccountId: Number(req.params.id), serviceOrderId: existing.service_order_id || null });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const existing = await db.queryOne('SELECT id FROM credit_accounts WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    if (!existing) return res.status(404).json({ error: 'Conta não encontrada nesta loja.' });

    await db.query('DELETE FROM credit_accounts WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    await logAction({ user: req.user, action: 'delete_credit_account', recordType: 'credit_account', recordId: req.params.id, storeId });
    emitDashboardRefresh({ source: 'credit_account_delete', creditAccountId: Number(req.params.id) });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
