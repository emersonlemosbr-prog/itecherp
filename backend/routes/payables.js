const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const {
  getPayablesDashboard,
  listPayables,
  createManualPayable,
  payInstallment,
  syncPayableDueNotifications,
} = require('../services/payablesService');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

router.get('/dashboard', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    syncPayableDueNotifications(db, storeId).catch(() => {});
    const dashboard = await getPayablesDashboard(db, storeId);
    res.json(dashboard);
  } catch (err) {
    next(err);
  }
});

router.get('/payments', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const rows = await db.query(`
      SELECT pp.*, ap.description, ap.supplier_name, pi.installment_number, pi.total_installments
      FROM payable_payments pp
      JOIN accounts_payable ap ON ap.id = pp.payable_id
      JOIN payable_installments pi ON pi.id = pp.installment_id
      WHERE pp.store_id = $1
      ORDER BY pp.payment_date DESC, pp.id DESC
      LIMIT 100
    `, [storeId]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const { filter = 'all', q = '' } = req.query;
    const items = await listPayables(db, storeId, { filter, q });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const created = await createManualPayable(db, storeId, req.user, req.body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const existing = await db.queryOne(
      'SELECT * FROM accounts_payable WHERE id = $1 AND store_id = $2',
      [req.params.id, storeId]
    );
    if (!existing) return res.status(404).json({ error: 'Conta não encontrada.' });
    if (existing.origin_type === 'purchase') {
      return res.status(400).json({ error: 'Contas originadas de compras não podem ser editadas manualmente.' });
    }
    if (Number(existing.paid_amount || 0) > 0 || existing.status === 'paid') {
      return res.status(409).json({ error: 'Conta com pagamento já registrado não pode ser editada.' });
    }

    const description = String(req.body.description || existing.description).trim();
    const dueDate = String(req.body.due_date || existing.due_date).slice(0, 10);
    const amount = Number(req.body.amount ?? existing.total_amount);
    if (!description || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Dados inválidos para atualização.' });
    }

    await db.transaction(async (tx) => {
      await tx.execute(
        'UPDATE accounts_payable SET description = $1, category = $2, due_date = $3, total_amount = $4, notes = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6 AND store_id = $7',
        [description, req.body.category ?? existing.category, dueDate, amount, req.body.notes ?? existing.notes, existing.id, storeId]
      );
      await tx.execute(
        'UPDATE payable_installments SET due_date = $1, amount = $2, updated_at = CURRENT_TIMESTAMP WHERE payable_id = $3 AND store_id = $4',
        [dueDate, amount, existing.id, storeId]
      );
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const existing = await db.queryOne(
      'SELECT * FROM accounts_payable WHERE id = $1 AND store_id = $2',
      [req.params.id, storeId]
    );
    if (!existing) return res.status(404).json({ error: 'Conta não encontrada.' });
    if (Number(existing.paid_amount || 0) > 0 || existing.status === 'paid') {
      return res.status(409).json({ error: 'Conta com pagamento já registrado não pode ser cancelada.' });
    }

    await db.transaction(async (tx) => {
      await tx.execute(
        "UPDATE accounts_payable SET status = 'canceled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND store_id = $2",
        [existing.id, storeId]
      );
      await tx.execute(
        "UPDATE payable_installments SET status = 'canceled', updated_at = CURRENT_TIMESTAMP WHERE payable_id = $1 AND store_id = $2 AND status IN ('open', 'partial')",
        [existing.id, storeId]
      );
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/installments/:installmentId/pay', async (req, res, next) => {
  try {
    const storeId = req.user.store_id || 1;
    const result = await payInstallment(db, storeId, req.user, req.params.installmentId, req.body);
    res.status(result.idempotentReplay ? 200 : 201).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
