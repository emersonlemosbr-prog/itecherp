const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { createPurchase } = require('../services/purchasesService');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

router.get('/', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const { supplier_id, payment_condition, status, start_date, end_date, q } = req.query;

    const conditions = ['p.store_id = $1'];
    const params = [storeId];

    if (supplier_id) {
      params.push(Number(supplier_id));
      conditions.push(`p.supplier_id = $${params.length}`);
    }
    if (payment_condition && ['cash', 'installments'].includes(payment_condition)) {
      params.push(payment_condition);
      conditions.push(`p.payment_condition = $${params.length}`);
    }
    if (status && ['confirmed', 'canceled'].includes(status)) {
      params.push(status);
      conditions.push(`p.status = $${params.length}`);
    }
    if (start_date && /^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      params.push(start_date);
      conditions.push(`p.purchase_date >= $${params.length}`);
    }
    if (end_date && /^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      params.push(end_date);
      conditions.push(`p.purchase_date <= $${params.length}`);
    }
    if (q && String(q).trim()) {
      params.push(`%${String(q).trim().toLowerCase()}%`);
      const idx = params.length;
      conditions.push(`(
        LOWER(p.purchase_number) LIKE $${idx}
        OR LOWER(COALESCE(p.supplier_name, '')) LIKE $${idx}
        OR LOWER(COALESCE(p.customer_name, '')) LIKE $${idx}
        OR LOWER(COALESCE(p.invoice_number, '')) LIKE $${idx}
      )`);
    }

    const whereSql = conditions.join(' AND ');
    const purchases = await db.query(`
      SELECT p.*,
        (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) AS items_count
      FROM purchases p
      WHERE ${whereSql}
      ORDER BY p.purchase_date DESC, p.id DESC
    `, params);

    const summary = purchases.reduce((acc, row) => {
      if (row.status === 'canceled') return acc;
      acc.total_count += 1;
      acc.total_amount += Number(row.total_amount || 0);
      if (row.payment_condition === 'cash') acc.cash_count += 1;
      else acc.installments_count += 1;
      return acc;
    }, { total_count: 0, total_amount: 0, cash_count: 0, installments_count: 0 });

    res.json({ items: purchases, summary });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const purchase = await db.queryOne(
      'SELECT * FROM purchases WHERE id = $1 AND store_id = $2',
      [req.params.id, storeId]
    );
    if (!purchase) return res.status(404).json({ error: 'Compra não encontrada.' });

    const items = await db.query(
      'SELECT * FROM purchase_items WHERE purchase_id = $1 AND store_id = $2 ORDER BY id ASC',
      [purchase.id, storeId]
    );
    const installments = await db.query(`
      SELECT pi.*
      FROM payable_installments pi
      JOIN accounts_payable ap ON ap.id = pi.payable_id
      WHERE ap.purchase_id = $1 AND pi.store_id = $2
      ORDER BY pi.installment_number ASC
    `, [purchase.id, storeId]);

    res.json({ ...purchase, items, installments });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const result = await createPurchase(db, storeId, req.user, req.body);
    res.status(result.idempotentReplay ? 200 : 201).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
